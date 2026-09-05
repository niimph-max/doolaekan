'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Appointment, AppState, Book, BookShare, Doctor, Group, Medication, MedLog, RecordItem, ShareLevel, Tab, WatchRule,
} from './types';
import { uid } from './format';
import { demoState } from './seed';
import {
  clearAuthStorage, clearCloudCache, clearLocal, loadCloudCache, loadLastUserId, loadLocal, loadPrefs,
  markHadBook,
  saveCloudCache, saveLastUserId, savePrefs, saveLocal,
} from './storage';
import { syncPushSubscription } from './push';
import * as remote from './remote';
import { getSupabase, isSupabaseConfigured } from './supabase';

/** เวลาสูงสุดที่ยอมรอการต่ออายุ token ก่อนจะลองดึงข้อมูลด้วยใบเดิมไปเลย */
const REFRESH_TIMEOUT_MS = 8000;
/** เวลาสูงสุดที่ยอมรอการดึงข้อมูลหนึ่งรอบ ก่อนจะถือว่าล้มเหลวและคืนปุ่มให้ผู้ใช้ */
const FETCH_TIMEOUT_MS = 12000;
/** จังหวะลองดึงข้อมูลใหม่เงียบๆ เมื่อมีสำเนาให้ดูอยู่แล้ว (มิลลิวินาที) */
const BACKGROUND_RETRIES = [2000, 6000];

const emptyState: AppState = {
  ready: false,
  mode: isSupabaseConfigured ? 'cloud' : 'local',
  userId: '',
  userEmail: '',
  loadError: '',
  loadOk: false,
  onboarded: false, tab: 'home', actorName: '', bigText: false,
  activeBookId: '', activeGroupId: '',
  books: [], doctors: [], medications: [], medLogs: [],
  appointments: [], records: [], watchRules: [], groups: [], shares: [],
};

/** ช่องข้อมูลที่มาจากคลาวด์ล้วนๆ — ใช้ล้างทิ้งตอนออกจากระบบ */
const emptyCloudData: remote.CloudData = {
  books: [], doctors: [], medications: [], medLogs: [],
  appointments: [], records: [], watchRules: [], groups: [], shares: [],
};

/** วางข้อมูลชุดใหม่ลง state โดยพยายามคงสมุด/กลุ่มที่เปิดค้างไว้เดิม
 *  ใช้ร่วมกันทั้งตอนหยิบสำเนาจากเครื่องและตอนโหลดจากคลาวด์จริง */
function applyData(s: AppState, data: remote.CloudData, userId: string): AppState {
  // ── กันสมุดซ้ำ ──
  // token ที่ใช้ไม่ได้ทำให้ฐานข้อมูลมองไม่เห็นว่าเราคือใคร คำขออ่านจึงคืน "ไม่มีอะไรเลย"
  // กลับมาแบบไม่มี error ถ้าเชื่อตามนั้นตรงๆ แอปจะสรุปว่าเป็นผู้ใช้ใหม่แล้วพาไป
  // หน้ากรอกข้อมูลเริ่มต้น ผู้ใช้ที่มีสมุดอยู่แล้วกรอกต่อ = ได้สมุดซ้ำสองเล่มทันที
  //
  // เมื่อกี้ยังเห็นสมุดอยู่ แต่รอบนี้ไม่เห็นสักเล่ม — ไม่ใช่เรื่องปกติ อย่าเพิ่งเชื่อ
  if (s.books.length > 0 && data.books.length === 0) {
    return { ...s, ready: true, userId, loadError: '' };
  }

  // ของหนักดึงไม่สำเร็จ = ได้อาร์เรย์ว่างกลับมา ห้ามเอาไปทับของเดิมที่ยังดีอยู่
  // ไม่งั้นไทม์ไลน์กับประวัติกินยาจะหายวูบทุกครั้งที่เน็ตไม่ดี ทั้งที่ยังอยู่บนคลาวด์
  const kept = data.partial
    ? { ...data, records: s.records, medLogs: s.medLogs }
    : data;

  // ── สมุดของเราที่ยังส่งขึ้นคลาวด์ไม่สำเร็จ ห้ามถูกลบทิ้ง ──
  // เพิ่งกรอกข้อมูลเสร็จแล้วการส่งขึ้นคลาวด์ยังไม่ผ่าน แต่มีการดึงข้อมูลใหม่มาทับ
  // (เช่นตอนเข้ากลุ่ม หรือมีคนอื่นบันทึกอะไร) รายการจากเซิร์ฟเวอร์ยังไม่มีเล่มนี้
  // สิ่งที่เพิ่งกรอกจึงหายไปทั้งหมดโดยไม่มีใครรู้ แล้วแอปค้างอยู่ในสภาพครึ่งๆ กลางๆ
  // คือจำได้ว่าเคยมีสมุด แต่ไม่มีทั้งในเครื่องและบนคลาวด์
  //
  // ปลอดภัยเพราะแอปไม่มีทางลบสมุดได้เลย เล่มที่หายจากเซิร์ฟเวอร์จึงแปลว่า
  // "ยังส่งขึ้นไปไม่ถึง" เสมอ ไม่ใช่ "ถูกลบไปแล้ว"
  const pendingMine = s.books.filter(
    (b) => b.is_mine && !data.books.some((d) => d.id === b.id),
  );
  const books = pendingMine.length ? [...data.books, ...pendingMine] : data.books;

  // จำว่า "เครื่องนี้เปิดสมุดของบัญชีนี้ได้จริง" เฉพาะเล่มที่ยืนยันจากเซิร์ฟเวอร์แล้ว
  // ถ้าจำจากเล่มที่ยังส่งไม่สำเร็จ จะไปหลอกหน้ารอว่าเคยมีสมุดทั้งที่ไม่เคยมีจริง
  if (data.books.some((b) => b.is_mine)) markHadBook(userId);

  const myBook = books.find((b) => b.is_mine);
  return {
    ...s, ...kept, books,
    ready: true, userId, loadError: '', loadOk: true,
    onboarded: Boolean(myBook),
    activeBookId: books.some((b) => b.id === s.activeBookId)
      ? s.activeBookId
      : (myBook?.id ?? books[0]?.id ?? ''),
    activeGroupId: data.groups.some((g) => g.id === s.activeGroupId)
      ? s.activeGroupId
      : (data.groups[0]?.id ?? ''),
  };
}

interface Actions {
  setTab: (tab: Tab) => void;
  setActor: (name: string) => void;
  setBigText: (on: boolean) => void;
  setActiveBook: (id: string) => void;
  setActiveGroup: (id: string) => void;
  finishOnboarding: (input: OnboardingInput) => void;
  loadDemo: () => void;
  resetAll: () => void;
  signOut: () => Promise<void>;
  /** ลบบัญชีพร้อมข้อมูลทั้งหมด — กู้คืนไม่ได้
   *  คืนค่าว่าลบตัวบัญชีเข้าระบบได้ด้วยไหม เพื่อให้หน้าจอบอกตรงกับที่เกิดขึ้นจริง */
  deleteAccount: () => Promise<{ ok: boolean; authRemoved: boolean; error?: string }>;
  /** ปิดหน้าแจ้งผลการลบบัญชี กลับไปหน้าเข้าใช้งานตามปกติ */
  clearDeletedNotice: () => void;
  retryLoad: () => Promise<void>;
  uploadLocalData: () => Promise<void>;
  /** ส่งทุกอย่างที่อยู่ในเครื่องขึ้นคลาวด์อีกครั้ง — ใช้ตอนที่เคยบันทึกไม่สำเร็จ
   *  แล้วข้อมูลค้างอยู่ในเครื่องเครื่องเดียว */
  resyncToCloud: () => Promise<void>;
  updateBook: (id: string, patch: Partial<Book>) => void;
  /** เปิดสมุดเล่มใหม่ให้คนที่ไม่ได้ใช้แอปเอง (พ่อแม่ที่ไม่ถนัดมือถือ)
   *  เจ้าของสมุดคือบัญชีที่กดสร้าง จึงไม่ต้องมีอีเมลของคนนั้น */
  addBook: (displayName: string) => void;
  addDoctor: (bookId: string, doc: Omit<Doctor, 'id' | 'book_id'>) => void;
  updateDoctor: (id: string, patch: Partial<Doctor>) => void;
  removeDoctor: (id: string) => void;
  addMedication: (bookId: string, med: Omit<Medication, 'id' | 'book_id' | 'duplicate_flag' | 'paused' | 'paused_note'>) => Medication;
  updateMedication: (id: string, patch: Partial<Medication>) => void;
  /** พักยาไว้ชั่วคราว / กลับมากินต่อ — ต่างจาก removeMedication ที่เป็นการเอาออกถาวร */
  setMedicationPaused: (id: string, paused: boolean, note?: string) => void;
  removeMedication: (id: string) => void;
  /** เปลี่ยนค่าในช่องเดียวกันของยาทุกตัวที่ใช้ค่านั้นอยู่ (รวมชื่อที่สะกดเพี้ยน / ล้างค่าที่ไม่ใช้) */
  renameMedField: (bookId: string, field: 'prescriber' | 'tag' | 'hospital', from: string, to: string) => number;
  /** เปลี่ยนชื่อหมอ/โรงพยาบาลในรายชื่อหมอที่โปรไฟล์ ใช้คู่กับ renameMedField
   *  เพราะ dropdown ดึงชื่อมาจากทั้งสองที่ แก้ที่เดียวชื่อเก่าจะยังค้างอยู่ */
  renameDoctorField: (bookId: string, field: 'name' | 'hospital', from: string, to: string) => number;
  logDose: (log: Omit<MedLog, 'id' | 'at' | 'actor_name'>) => void;
  addAppointment: (bookId: string, appt: Omit<Appointment, 'id' | 'book_id' | 'blood_test_done'>) => void;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;
  removeAppointment: (id: string) => void;
  /** เก็บภาพใบนัดไว้กับนัดนั้น — ใบกระดาษหายง่าย และมีข้อมูลที่แอปไม่ได้เก็บ
   *  (เลขคิว ชั้น ห้องตรวจ ข้อความที่หมอเขียนมือ) */
  setAppointmentPhoto: (id: string, dataUrl: string) => void;
  /** `at` ใส่เองได้สำหรับเอกสารเก่าที่เพิ่งเอามาเก็บย้อนหลัง
   *  ถ้าไม่ใส่จะเป็นเวลาปัจจุบัน */
  addRecord: (
    bookId: string,
    rec: Omit<RecordItem, 'id' | 'book_id' | 'at' | 'actor_name'> & { at?: string },
  ) => void;
  /** ลบบันทึก — ส่งได้หลาย id เพราะรูปหลายใบของบันทึกเดียวคือหลายแถว */
  removeRecords: (ids: string[]) => void;
  /** แก้บันทึกที่จดไว้แล้ว — แก้ทุกแถวในชุดเดียวกันพร้อมกัน */
  updateRecords: (
    ids: string[],
    patch: { title?: string; body?: string; data?: RecordItem['data']; at?: string },
  ) => void;
  addWatchRule: (bookId: string, rule: Omit<WatchRule, 'id' | 'book_id'>) => void;
  updateWatchRule: (id: string, patch: Partial<WatchRule>) => void;
  removeWatchRule: (id: string) => void;
  createGroup: (name: string, share: ShareLevel) => void;
  joinGroup: (code: string, share: ShareLevel) => Promise<boolean>;
  setShareLevel: (bookId: string, level: ShareLevel) => void;
  /** ขอลิงก์ดูรูปเฉพาะใบที่ผู้ใช้กดดู
   *
   *  ไม่ขอล่วงหน้าให้ทุกใบ เพราะรูปเป็นของหนักที่สุดในแอปและส่วนใหญ่ไม่ได้เปิดดู
   *  การไม่ดึงรูปคือเหตุผลหนึ่งที่ทำให้เปิดแอปได้เร็ว ควรรักษาไว้ */
  loadPhoto: (path: string) => Promise<void>;
  toast: (msg: string) => void;
}

export interface OnboardingInput {
  displayName: string;
  fullName: string;
  address: string;
  conditions: string[];
  allergy: string;
  doctors: Omit<Doctor, 'id' | 'book_id'>[];
  groupChoice: 'solo' | 'create' | 'join';
  groupName: string;
  inviteCode: string;
  shareLevel: ShareLevel;
}

interface Ctx {
  state: AppState;
  actions: Actions;
  toastMsg: string;
  /** จำนวนรายการที่ยังบันทึกขึ้นคลาวด์ไม่สำเร็จ — ค้างรอกดลองใหม่ */
  unsavedCount: number;
  /** สาเหตุจริงที่บันทึกไม่ผ่าน — ข้อความจากฐานข้อมูล/เครือข่ายตรงๆ */
  unsavedReason: string;
  retryUnsaved: () => void;
  /** เลิกพยายามกับรายการที่บันทึกไม่ได้ — บางอย่างลองอีกกี่ครั้งก็ไม่ผ่าน
   *  (สิทธิ์ไม่ถึง / ข้อมูลชี้ไปที่สมุดที่ไม่มีอยู่แล้ว) ต้องมีทางออกให้ผู้ใช้ */
  discardUnsaved: () => void;
  /** มีข้อมูลค้างจากโหมดเครื่องเดียวรอยกขึ้นคลาวด์ */
  hasLocalToUpload: boolean;
}

const StoreContext = createContext<Ctx | null>(null);

/** ยาซ้ำ = ตัวยาหลัก (คำแรกของชื่อ) ตรงกันในสมุดเดียวกัน */
function markDuplicates(meds: Medication[], bookId: string): Medication[] {
  const key = (m: Medication) => m.name.trim().split(/[\s\d]/)[0];
  const counts = new Map<string, number>();
  for (const m of meds) {
    // ยาที่พักไว้ไม่ได้กินอยู่ จึงไม่ใช่ยาซ้ำอีกต่อไป — พักตัวเก่าแล้วธงต้องหายเอง
    // ไม่ต้องให้ผู้ใช้มานั่งปิดคำเตือนเองอีกที
    if (m.book_id !== bookId || m.paused) continue;
    counts.set(key(m), (counts.get(key(m)) ?? 0) + 1);
  }
  return meds.map((m) =>
    m.book_id === bookId ? { ...m, duplicate_flag: (counts.get(key(m)) ?? 0) > 1 } : m,
  );
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [toastMsg, setToastMsg] = useState('');
  const [unsavedCount, setUnsavedCount] = useState(0);
  const [unsavedReason, setUnsavedReason] = useState('');
  // งานเขียนที่ล้มเหลว เก็บไว้ยิงซ้ำ — ห้ามทิ้งสิ่งที่ผู้ใช้พิมพ์ไปเฉยๆ
  const failedWrites = useRef<(() => Promise<void>)[]>([]);
  // งานเขียนที่ยังไม่เสร็จ ระหว่างนี้ห้ามดึงข้อมูลใหม่มาทับ ไม่งั้นของเก่าจากเซิร์ฟเวอร์
  // จะทับสิ่งที่เพิ่งบันทึกไป แล้วดูเหมือนบันทึกไม่ติด
  const inFlight = useRef(0);
  // ตัวยิงคิวซ้ำ ตั้งค่าไว้ตอนสร้าง actions — ปุ่ม "ลองบันทึกใหม่" เรียกผ่านตัวนี้
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  // แยกให้ออกว่า "ผู้ใช้กดออกจากระบบเอง" กับ "token ต่ออายุไม่สำเร็จ"
  // supabase ยิงเหตุการณ์เดียวกัน (SIGNED_OUT) ทั้งสองกรณี
  const intentionalSignOut = useRef(false);
  // เตือนเรื่องสำเนาเขียนไม่ลงครั้งเดียวพอ ไม่งั้นเด้งทุกครั้งที่ข้อมูลเปลี่ยน
  const cacheWarned = useRef(false);
  const [hasLocalToUpload, setHasLocalToUpload] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  /** ดึงข้อมูลใหม่ทั้งชุดจากคลาวด์ (ใช้ตอนเข้าระบบ, มีคนอื่นบันทึก, หรือเขียนพลาด) */
  const refresh = useCallback(async (userId: string) => {
    const data = await remote.fetchAll(userId);
    setState((s) => applyData(s, data, userId));
    // เปิดแอปได้แล้วแต่ได้มาไม่ครบ ต้องบอก ไม่ใช่ให้ผู้ใช้ไปเจอไทม์ไลน์ว่างแล้วงงเอง
    if (data.partial) toast('ยากับนัดพร้อมแล้ว — ไทม์ไลน์ย้อนหลังยังดึงไม่ครบ');
    // จำไว้ว่าใครเข้าระบบค้างอยู่ เปิดแอปครั้งหน้าจะได้หยิบสำเนาของคนนี้ขึ้นมาทันที
    // (ตัวสำเนาเองมี effect คอยเขียนตามทุกครั้งที่ข้อมูลเปลี่ยน)
    saveLastUserId(userId);
  }, [toast]);

  // ── โหลดครั้งแรก ──
  useEffect(() => {
    const prefs = loadPrefs();

    if (!isSupabaseConfigured) {
      const saved = loadLocal();
      setState(saved ? { ...emptyState, ...saved, ready: true } : { ...emptyState, ...prefs, ready: true });
      return;
    }

    const sb = getSupabase();
    if (!sb) return;
    setState((s) => ({ ...s, ...prefs }));
    setHasLocalToUpload(Boolean(loadLocal()?.books?.some((b) => b.is_mine)));

    let cancelled = false;

    // ── หยิบสำเนาครั้งล่าสุดขึ้นจอก่อนเลย ──
    // ไม่ต้องรอเช็ค session และไม่ต้องรอโหลดข้อมูล ผู้ใช้เห็นสมุดของตัวเองทันทีที่เปิดแอป
    // ของจริงจะตามมาอัปเดตทับให้เองอีกไม่กี่วินาที
    let showingCache = false;
    const lastUserId = loadLastUserId();
    if (lastUserId) {
      const cached = loadCloudCache(lastUserId);
      if (cached) {
        showingCache = true;
        setState((s) => applyData({ ...s, ...prefs }, cached, lastUserId));
      }
    }

    const load = async (userId: string | undefined, email = '') => {
      if (cancelled) return;
      if (!userId) {
        // ไม่มี session — แยกสองกรณีให้ขาดจากกัน
        //
        // 1) กดออกจากระบบเอง หรือเครื่องนี้ยังไม่เคยเข้าระบบ → ล้างของบนจอถูกแล้ว
        // 2) เคยเข้าระบบอยู่ แต่ต่ออายุ token ไม่สำเร็จตอนกลับมาเปิดแอป
        //    → ห้ามล้าง ห้ามลืมว่าใครเข้าค้างไว้ ไม่งั้นผู้ใช้โดนเด้งไปหน้าใส่อีเมล
        //    ทั้งที่ไม่ได้ทำอะไรผิด แล้วต้องกดโหลดซ้ำจนกว่าจะมีรอบที่ต่ออายุทัน
        // มีข้อมูลอยู่บนจอแล้ว (จากสำเนาในเครื่อง หรือเพิ่งกรอกเสร็จหมาดๆ)
        // ห้ามล้างทิ้งเพราะคำขอเบื้องหลังอันเดียวตอบว่าไม่มี session
        // ผู้ใช้ใหม่ที่ยังไม่ทันซิงก์จะเสียสิ่งที่เพิ่งกรอกไปทั้งหมด
        const hasDataOnScreen = showingCache || stateRef.current.books.length > 0;
        if (hasDataOnScreen && !intentionalSignOut.current) {
          setState((s) => ({ ...s, ready: true }));
          toast('ต่อคลาวด์ไม่ได้ชั่วคราว — กำลังแสดงข้อมูลที่เก็บไว้ในเครื่อง');
          return;
        }
        showingCache = false;
        saveLastUserId('');
        setState((s) => ({
          ...s, ...emptyCloudData,
          ready: true, userId: '', userEmail: '', loadError: '', onboarded: false,
        }));
        return;
      }
      // สลับบัญชี: สำเนาที่ค้างบนจอเป็นของคนก่อน ล้างทิ้งก่อนโหลดของคนใหม่
      if (showingCache && userId !== lastUserId) {
        showingCache = false;
        setState((s) => ({ ...s, ...emptyCloudData, ready: false, onboarded: false }));
      }
      // จำไว้ตั้งแต่ตอนนี้เลยว่าเครื่องนี้เข้าระบบด้วยใคร ไม่ต้องรอให้โหลดสำเร็จก่อน
      //
      // เดิมจำหลังโหลดสำเร็จเท่านั้น ผู้ใช้ใหม่ที่เพิ่งกรอกข้อมูลเสร็จจึงเสี่ยงมาก:
      // ถ้าแอปโหลดหน้าใหม่ (เช่นมี service worker รุ่นใหม่เข้ามาพอดี) ก่อนที่สมุด
      // จะขึ้นคลาวด์ทัน เปิดมาอีกทีจะไม่รู้ว่าใครเข้าอยู่ หยิบสำเนาในเครื่องไม่ได้
      // แล้วเด้งกลับไปหน้ากรอกข้อมูลใหม่ทั้งที่เพิ่งกรอกไปหมาดๆ
      saveLastUserId(userId);
      setState((s) => ({ ...s, userEmail: email || s.userEmail }));
      try {
        // ── การโหลดครั้งแรกต้องมีเส้นตายเหมือนกัน ──
        // เดิมมีแต่ปุ่มลองใหม่ที่มีเส้นตาย ส่วนรอบแรกรอไม่จำกัด ถ้าคำขอค้าง
        // (เน็ตเงียบ หรือฐานข้อมูลตอบช้าจนโดนตัด) แอปจะค้างที่ ready = false
        // ตลอดกาล ผู้ใช้เห็นแต่โลโก้กับคำว่า "ใช้เวลานานกว่าปกติ" แล้วกดโหลดใหม่
        // ซ้ำๆ ไปเรื่อยๆ โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้นและต้องทำยังไงต่อ
        await Promise.race([
          refresh(userId),
          new Promise((_, reject) => setTimeout(
            () => reject(new Error('ดึงข้อมูลนานเกินไป — เน็ตช้าหรือเซิร์ฟเวอร์ไม่ตอบ')),
            FETCH_TIMEOUT_MS,
          )),
        ]);
        showingCache = true;
      } catch (e) {
        // ห้ามปล่อยให้ตกไปหน้า onboarding — ผู้ใช้ที่มีสมุดอยู่แล้วจะนึกว่าข้อมูลหาย
        // แล้วกรอกใหม่จนได้สมุดซ้ำสองเล่ม
        if (showingCache) {
          // ── มีสำเนาให้ดูอยู่แล้ว ลองเงียบๆ อีกสองรอบก่อนค่อยรบกวน ──
          // เดิมพลาดครั้งเดียวก็เตือนทันที ทั้งที่สาเหตุส่วนใหญ่หายเองในไม่กี่วินาที
          // ผู้ใช้จึงเห็นคำเตือนบ่อยจนรู้สึกว่าแอปใกล้พังตลอดเวลา ทั้งที่ใช้งานได้ปกติ
          setState((s) => ({ ...s, ready: true, userId }));
          void (async () => {
            for (const wait of BACKGROUND_RETRIES) {
              await new Promise((r) => setTimeout(r, wait));
              if (cancelled) return;
              try {
                await refresh(userId);
                return;   // ได้แล้ว ไม่ต้องบอกอะไรเลย
              } catch { /* ลองรอบถัดไป */ }
            }
            if (!cancelled) toast('อัปเดตข้อมูลล่าสุดไม่สำเร็จ — กำลังแสดงข้อมูลที่เก็บไว้ในเครื่อง');
          })();
        } else {
          setState((s) => ({ ...s, ready: true, userId, loadError: (e as Error).message }));
        }
      }
    };

    // สมัครฟัง onAuthStateChange ก่อน getSession เพราะ supabase จะยิง INITIAL_SESSION
    // ให้ทันทีจาก token ที่เก็บไว้ในเครื่อง ไม่ต้องรอ round-trip
    let authResolved = false;
    const onAuth = (userId: string | undefined, email: string) => {
      authResolved = true;
      void load(userId, email);
    };
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      // ── จุดที่ทำให้ต้องกดโหลดซ้ำ 2-3 ครั้งตอนไม่ได้เข้าสักพัก ──
      // token ของ supabase หมดอายุทุกชั่วโมง กลับมาเปิดแอปทีต้องต่ออายุก่อน
      // ถ้าจังหวะนั้นเน็ตสะดุด (เพิ่งปลดล็อกจอ ยังไม่จับสัญญาณ) การต่ออายุล้ม
      // แล้ว supabase ยิง SIGNED_OUT ออกมา — เหมือนกับตอนกดออกจากระบบเองเป๊ะ
      //
      // เดิมไม่ได้ดูเลยว่าเป็นเหตุการณ์อะไร เหมารวมว่าออกจากระบบแล้ว
      // จึงล้างข้อมูลบนจอทิ้งและลืมว่าใครเข้าระบบค้างไว้ ผู้ใช้เลยโดนเด้งออก
      // ต้องโหลดใหม่จนกว่าจะมีรอบที่ต่ออายุทัน
      if (event === 'SIGNED_OUT' && !intentionalSignOut.current) {
        setState((st) => ({ ...st, ready: true }));
        // ── ห้ามเตือนก่อนรู้ผล ──
        // เดิมเตือนทันทีที่ได้ยินว่าต่ออายุไม่ผ่าน แล้วค่อยไปลองใหม่เงียบๆ พอลองแล้ว
        // สำเร็จก็ไม่ได้ถอนคำเตือน ผู้ใช้จึงเห็น "ต่อคลาวด์ไม่ได้" ค้างอยู่ทั้งที่
        // อ่านเขียนได้ตามปกติ — คำเตือนที่ไม่ตรงกับความจริงทำให้คนไปแก้ผิดจุด
        sb.auth.refreshSession().then(({ data }) => {
          if (cancelled) return;
          if (data.session) {
            onAuth(data.session.user.id, data.session.user.email ?? '');
            return;   // ต่อได้แล้ว ไม่ต้องบอกอะไรเลย
          }
          toast('ต่อคลาวด์ไม่ได้ชั่วคราว — กำลังแสดงข้อมูลที่เก็บไว้ในเครื่อง');
        }).catch(() => {
          if (!cancelled) toast('ต่อคลาวด์ไม่ได้ชั่วคราว — กำลังแสดงข้อมูลที่เก็บไว้ในเครื่อง');
        });
        return;
      }
      intentionalSignOut.current = false;
      onAuth(session?.user.id, session?.user.email ?? '');
    });

    // เผื่อ INITIAL_SESSION ไม่มา ให้ getSession เป็นตัวสำรอง
    // และถ้าค้างจนไม่มีอะไรตอบเลย ต้องมี timeout ไม่งั้นแอปติดที่ ready=false เป็นจอขาว
    const SESSION_TIMEOUT_MS = 12000;
    const withTimeout = <T,>(promise: Promise<T>): Promise<T | 'timeout'> => Promise.race([
      promise,
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), SESSION_TIMEOUT_MS)),
    ]);

    withTimeout(sb.auth.getSession())
      .then((result) => {
        if (cancelled) return;
        if (result === 'timeout') {
          if (authResolved) return;
          if (showingCache) {
            setState((st) => ({ ...st, ready: true }));
            toast('เช็คสถานะการเข้าระบบไม่สำเร็จ — กำลังแสดงข้อมูลที่เก็บไว้ในเครื่อง');
            return;
          }
          setState((st) => ({
            ...st,
            ready: true,
            loadError: 'เช็คสถานะการเข้าระบบไม่สำเร็จ — ต่ออินเทอร์เน็ตไม่ได้หรือเซิร์ฟเวอร์ไม่ตอบ',
          }));
          return;
        }
        if (authResolved) return;
        onAuth(result.data.session?.user.id, result.data.session?.user.email ?? '');
      })
      .catch((e: Error) => {
        if (cancelled || authResolved) return;
        setState((st) => ({ ...st, ready: true, loadError: showingCache ? '' : e.message }));
      });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [refresh, toast]);

  // ── realtime: มีใครในบ้านบันทึกอะไร ทุกเครื่องเห็นทันที ──
  useEffect(() => {
    if (state.mode !== 'cloud' || !state.userId) return;
    const sb = getSupabase();
    if (!sb) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // ยังเขียนไม่เสร็จ = ของบนเซิร์ฟเวอร์ยังเป็นของเก่า ดึงมาตอนนี้จะทับ
        // สิ่งที่เพิ่งกรอกไป รอให้เขียนเสร็จก่อนแล้วค่อยว่ากันใหม่
        if (inFlight.current > 0) { bump(); return; }
        refresh(stateRef.current.userId).catch(() => { /* เดี๋ยวรอบหน้าค่อยว่ากัน */ });
      }, 400);
    };

    const channel: RealtimeChannel = sb.channel('doolaekan');
    for (const table of ['med_logs', 'records', 'appointments', 'medications']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, bump);
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      sb.removeChannel(channel);
    };
  }, [state.mode, state.userId, refresh]);

  // ── ที่อยู่รับแจ้งเตือนของเครื่องนี้ ──
  // เบราว์เซอร์เปลี่ยนที่อยู่รับ push ให้เองเป็นระยะ service worker สมัครใหม่ให้แล้ว
  // แต่ส่งขึ้นฐานข้อมูลเองไม่ได้เพราะไม่มีใบเข้าระบบ ถ้าไม่มีใครเก็บที่อยู่ใหม่ให้
  // แจ้งเตือนจะเงียบไปเฉยๆ ทั้งที่ปุ่มในแอปยังขึ้นว่า "เปิดอยู่"
  useEffect(() => {
    if (state.mode !== 'cloud' || !state.userId) return;
    void syncPushSubscription();
  }, [state.mode, state.userId]);

  // ── เขียนกลับลงเครื่อง ──
  useEffect(() => {
    if (!state.ready) return;
    if (state.mode === 'local') saveLocal(state);
    else savePrefs(state);
  }, [state]);

  // สำเนาข้อมูลคลาวด์ต้องตามการแก้ไขในเครื่องด้วย ไม่งั้นบันทึกยาเสร็จแล้วปิดแอปทันที
  // เปิดใหม่จะเห็นของเก่าจนกว่าจะโหลดจากคลาวด์เสร็จ
  useEffect(() => {
    if (!state.ready || state.mode !== 'cloud' || !state.userId) return;
    const cached = saveCloudCache(state.userId, {
      books: state.books, doctors: state.doctors, medications: state.medications,
      medLogs: state.medLogs, appointments: state.appointments, records: state.records,
      watchRules: state.watchRules, groups: state.groups, shares: state.shares,
    });
    // เก็บสำเนาไม่ลง = เปิดแอปครั้งหน้าจะไม่มีอะไรให้ดูจนกว่าจะโหลดจากคลาวด์สำเร็จ
    // เป็นเรื่องที่ผู้ใช้ต้องรู้ ไม่ใช่ปล่อยให้ไปเซอร์ไพรส์ตอนเน็ตไม่ดี
    if (!cached && !cacheWarned.current) {
      cacheWarned.current = true;
      toast('เก็บสำเนาในเครื่องไม่ได้ (พื้นที่เต็ม) — เปิดแอปครั้งหน้าต้องรอโหลดจากคลาวด์');
    }
  }, [
    state.ready, state.mode, state.userId,
    state.books, state.doctors, state.medications, state.medLogs,
    state.appointments, state.records, state.watchRules, state.groups, state.shares,
  ]);

  useEffect(() => {
    document.documentElement.dataset.bigtext = state.bigText ? '1' : '0';
  }, [state.bigText]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const actions = useMemo<Actions>(() => {
    const patch = (fn: (s: AppState) => Partial<AppState>) => setState((s) => ({ ...s, ...fn(s) }));

    /** ยิงคำสั่งเขียนขึ้นคลาวด์
     *
     *  เน็ตมือถือสะดุดเป็นเรื่องปกติ (สลับเสา เข้าลิฟต์ ล็อกจอ) ลองใหม่ให้เองก่อน
     *  ยังไม่ผ่านจริงๆ ค่อยเก็บงานไว้ในคิวแล้วขึ้นแถบบอก — ห้ามทิ้งสิ่งที่ผู้ใช้พิมพ์
     *
     *  เดิมพลาดครั้งเดียวก็สั่งโหลดข้อมูลใหม่ทั้งชุดทับทันที ทุกอย่างที่กรอกไว้
     *  ตั้งแต่ครั้งที่ซิงก์สำเร็จล่าสุดหายเกลี้ยง โดยเห็นแค่ toast 2.8 วินาที
     *  ที่เลื่อนผ่านไปแล้วก็ไม่รู้ตัว */
    const RETRY_DELAYS = [600, 1800, 4000];

    const runWrite = async (fn: () => Promise<void>) => {
      inFlight.current += 1;
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            await fn();
            // ยิงผ่านแล้ว = เน็ตกลับมา ลองส่งงานที่ค้างอยู่ต่อให้เลย
            if (failedWrites.current.length) void flushFailed();
            return;
          } catch (e) {
            const err = e as Error;
            // token หมดอายุ/ใช้ไม่ได้ — ลองซ้ำกี่ครั้งก็ไม่ผ่าน ต้องเข้าระบบใหม่เท่านั้น
            // เคสนี้อันตรายเป็นพิเศษ เพราะอ่านข้อมูลก็พังไปด้วย แอปเลยแสดงสำเนาในเครื่อง
            // ดูเหมือนใช้งานได้ปกติทุกอย่าง ทั้งที่ไม่มีอะไรขึ้นคลาวด์เลยสักรายการ
            const authBroken = /JWT|jwt|401|Invalid API key|not authenticated|token/i.test(err.message);
            // ผิดกติกาฐานข้อมูล (สิทธิ์ไม่พอ / ข้อมูลไม่ถูกรูปแบบ) ลองอีกกี่ครั้งก็ไม่ผ่าน
            const permanent = authBroken || /42501|23\d{3}|22\d{3}|PGRST/.test(err.message);
            if (permanent || attempt >= RETRY_DELAYS.length) {
              failedWrites.current.push(fn);
              setUnsavedCount(failedWrites.current.length);
              // ต้องบอกสาเหตุจริง ไม่ใช่แค่ "ไม่สำเร็จ" — ไม่งั้นทั้งผู้ใช้และคนแก้โค้ด
              // ก็ได้แต่เดา ว่าติดสิทธิ์ ติดเน็ต หรือข้อมูลผิดรูปแบบ
              setUnsavedReason(authBroken
                ? 'หมดเวลาเข้าระบบแล้ว — ต้องออกจากระบบแล้วเข้าใหม่ ข้อมูลในเครื่องยังอยู่ครบ'
                : err.message || 'ต่อคลาวด์ไม่ได้');
              return;
            }
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
          }
        }
      } finally {
        inFlight.current -= 1;
      }
    };

    // เผื่อผู้ใช้กดปุ่มลองใหม่เอง
    flushRef.current = () => flushFailed();

    const flushFailed = async () => {
      const queued = failedWrites.current;
      failedWrites.current = [];
      setUnsavedCount(0);
      setUnsavedReason('');
      for (const fn of queued) await runWrite(fn);
    };

    const push = (fn: () => Promise<void>) => {
      if (stateRef.current.mode !== 'cloud' || !stateRef.current.userId) return;
      void runWrite(fn);
    };

    return {
      setTab: (tab) => patch(() => ({ tab })),
      setActor: (actorName) => patch(() => ({ actorName })),
      setBigText: (bigText) => patch(() => ({ bigText })),
      setActiveBook: (activeBookId) => patch(() => ({ activeBookId })),
      setActiveGroup: (activeGroupId) => patch(() => ({ activeGroupId })),

      finishOnboarding: (input) => {
        const s = stateRef.current;
        // ด่านสุดท้ายกันสมุดซ้ำ — ถ้ามีสมุดของตัวเองอยู่แล้ว แปลว่าหน้านี้ไม่ควรโผล่มา
        // ตั้งแต่แรก อย่าสร้างเล่มใหม่ทับของเดิม
        if (s.books.some((b) => b.is_mine)) {
          patch(() => ({ onboarded: true, tab: 'home' }));
          toast('มีสมุดของคุณอยู่แล้ว — พากลับเข้าสมุดเดิมให้');
          return;
        }
        const bookId = uid();
        const book: Book = {
          id: bookId, owner_id: s.userId, owner_name: input.displayName || 'ฉัน',
          full_name: input.fullName, address: input.address, allergy: input.allergy,
          conditions: input.conditions, blood_type: '', birth_date: '', age: '', emergency_contact: '', avatar: '',
          is_mine: true,
        };
        const doctors: Doctor[] = input.doctors.map((d) => ({ ...d, id: uid(), book_id: bookId }));
        const groups: Group[] = [];
        const shares: BookShare[] = [];

        if (input.groupChoice === 'create') {
          const g: Group = {
            id: uid(), name: input.groupName || 'ครอบครัวของฉัน',
            invite_code: `DLK-${Math.floor(1000 + Math.random() * 9000)}`,
            owner_id: s.userId,
            members: [{ id: s.userId || uid(), name: book.owner_name }],
          };
          groups.push(g);
          shares.push({ book_id: bookId, group_id: g.id, level: input.shareLevel });
        }

        patch(() => ({
          onboarded: true, books: [book], doctors, groups, shares,
          activeBookId: bookId, activeGroupId: groups[0]?.id ?? '',
          actorName: book.owner_name, tab: 'home',
        }));

        push(async () => {
          // ถามเซิร์ฟเวอร์ว่าตอนนี้เราคือใคร แล้วใช้ค่านั้นเป็นเจ้าของสมุด
          // ค่าที่จำไว้ในเครื่องเพี้ยนได้ และถ้าไม่ตรงกับ auth.uid() ของคำขอ
          // ฐานข้อมูลจะปฏิเสธด้วย 42501 โดยไม่บอกว่าเพราะเจ้าของไม่ตรง
          const owner = (await remote.currentUserId()) || s.userId;
          const mine = owner !== book.owner_id ? { ...book, owner_id: owner } : book;
          if (owner !== book.owner_id) {
            setState((st) => ({
              ...st, userId: owner,
              books: st.books.map((b) => (b.id === book.id ? mine : b)),
              groups: st.groups.map((g) => (g.owner_id === book.owner_id ? { ...g, owner_id: owner } : g)),
            }));
          }
          await remote.upsertProfile(owner, mine.owner_name);
          await remote.upsertBook(mine);
          for (const d of doctors) await remote.upsertDoctor(d);
          for (const g of groups) await remote.insertGroup({ ...g, owner_id: owner });
          for (const sh of shares) await remote.upsertShare(sh);

          // ── เข้ากลุ่มต้องรอให้สมุดขึ้นคลาวด์เสร็จก่อนเสมอ ──
          // เดิมยิงไปพร้อมกัน ซึ่งแพ้ทางสองต่อ: การแชร์สมุดเข้ากลุ่มอ้างถึงสมุดที่ยัง
          // ไม่มีบนคลาวด์ และการดึงข้อมูลใหม่หลังเข้ากลุ่มจะทับสถานะด้วยรายการสมุด
          // จากเซิร์ฟเวอร์ซึ่งยังไม่มีเล่มที่เพิ่งกรอก แอปจึงสรุปว่ายังไม่มีสมุด
          // แล้วเด้งผู้ใช้กลับไปหน้ากรอกข้อมูลทั้งที่เพิ่งกรอกเสร็จหมาดๆ
          if (input.groupChoice === 'join' && input.inviteCode.trim()) {
            await actionsRef.current?.joinGroup(input.inviteCode, input.shareLevel);
          }
        });
      },

      loadDemo: () => setState({ ...demoState(), ready: true }),

      resetAll: () => {
        clearLocal();
        setState({ ...emptyState, ready: true, mode: stateRef.current.mode, userId: stateRef.current.userId });
      },

      retryLoad: async () => {
        const userId = stateRef.current.userId;
        if (!userId) return;
        setState((s) => ({ ...s, loadError: '' }));
        // ต่ออายุ token ก่อนเสมอ — สาเหตุที่พบบ่อยที่สุดของการอ่านไม่ติดคือ token
        // หมดอายุ ซึ่งดึงข้อมูลซ้ำเฉยๆ ไม่ช่วย เพราะยังใช้ใบเดิมที่หมดอายุอยู่ดี
        //
        // ต้องมีเวลาจำกัดเสมอ: ถ้าเน็ตตายสนิท คำขอนี้ค้างได้ยาวมากโดยไม่เด้ง error
        // ผู้ใช้จะติดอยู่กับข้อความ "กำลังดึงสมุด…" ไม่จบสักที ซึ่งแย่กว่าบอกไปตรงๆ
        // ว่าดึงไม่ได้แล้วให้กดลองเอง
        const sb = getSupabase();
        if (sb) {
          await Promise.race([
            sb.auth.refreshSession().catch(() => { /* ต่อไม่ได้ก็ลองด้วยใบเดิม */ }),
            new Promise((resolve) => setTimeout(resolve, REFRESH_TIMEOUT_MS)),
          ]);
        }
        try {
          // ต้องมีเวลาจำกัดเหมือนกัน ไม่งั้นปุ่ม "ลองใหม่" ค้างที่ "กำลังลอง…" ได้ไม่จบ
          // เมื่อเน็ตหยุดตอบโดยไม่เด้ง error ซึ่งเป็นทางตันที่ผู้ใช้ทำอะไรต่อไม่ได้เลย
          await Promise.race([
            refresh(userId),
            new Promise((_, reject) => setTimeout(
              () => reject(new Error('ดึงข้อมูลนานเกินไป — เน็ตช้าหรือเซิร์ฟเวอร์ไม่ตอบ')),
              FETCH_TIMEOUT_MS,
            )),
          ]);
        } catch (e) {
          setState((s) => ({ ...s, loadError: (e as Error).message }));
        }
      },

      signOut: async () => {
        intentionalSignOut.current = true;
        clearCloudCache(stateRef.current.userId);
        saveLastUserId('');
        // ── ล้างฝั่งเครื่องให้เสร็จก่อนเสมอ แล้วค่อยไปบอกเซิร์ฟเวอร์ ──
        // เดิมรอเซิร์ฟเวอร์ตอบก่อนถึงจะล้างสถานะบนจอ ซึ่งพังในกรณีที่สำคัญที่สุด:
        // ตอนใบเข้าระบบหมดอายุ คำขอออกจากระบบจะค้างหรือพัง บรรทัดล้างสถานะจึงไม่เคย
        // ได้ทำงาน ผู้ใช้ติดอยู่หน้าเดิมออกไม่ได้เลย ทั้งที่การออกจากระบบเป็นทางแก้
        clearAuthStorage();
        setState({ ...emptyState, ready: true });
        const sb = getSupabase();
        if (sb) {
          // scope local = ล้างใบเข้าระบบในเครื่องอย่างเดียว ไม่ต้องรอเซิร์ฟเวอร์อนุมัติ
          await Promise.race([
            sb.auth.signOut({ scope: 'local' }).catch(() => { /* ล้างเองไปแล้ว */ }),
            new Promise((resolve) => setTimeout(resolve, REFRESH_TIMEOUT_MS)),
          ]);
        }
      },

      /** ── ลบบัญชีพร้อมข้อมูลทั้งหมด ──
       *  ลบคลาวด์ให้เสร็จก่อน แล้วค่อยล้างเครื่อง ถ้าลบคลาวด์ไม่สำเร็จต้องไม่ล้างเครื่อง
       *  เพราะผู้ใช้จะเหลือแอปว่างเปล่าโดยที่ข้อมูลยังอยู่บนคลาวด์ครบ แล้วเข้าใจผิด
       *  ว่าลบไปแล้ว ทั้งที่ยังไม่ได้ลบ */
      deleteAccount: async () => {
        const userId = stateRef.current.userId;
        if (stateRef.current.mode !== 'cloud' || !userId) {
          return { ok: false, authRemoved: false, error: 'ยังไม่ได้เข้าระบบ' };
        }
        let authRemoved = false;
        try {
          ({ authRemoved } = await remote.deleteMyAccount(userId));
        } catch (e) {
          return { ok: false, authRemoved: false, error: (e as Error).message };
        }
        intentionalSignOut.current = true;
        clearCloudCache(userId);
        clearLocal();
        saveLastUserId('');
        clearAuthStorage();
        // ค้างผลไว้บนจอ ไม่งั้นผู้ใช้เด้งกลับหน้าใส่อีเมลโดยไม่รู้ว่าลบสำเร็จไหม
        setState({ ...emptyState, ready: true, deleted: authRemoved ? 'full' : 'data' });
        const sb = getSupabase();
        if (sb) {
          await Promise.race([
            sb.auth.signOut({ scope: 'local' }).catch(() => { /* ล้างเองไปแล้ว */ }),
            new Promise((resolve) => setTimeout(resolve, REFRESH_TIMEOUT_MS)),
          ]);
        }
        return { ok: true, authRemoved };
      },

      clearDeletedNotice: () => setState((st) => ({ ...st, deleted: undefined })),

      resyncToCloud: async () => {
        const s = stateRef.current;
        if (s.mode !== 'cloud' || !s.userId) { toast('ยังไม่ได้เข้าระบบ'); return; }
        const owner = (await remote.currentUserId()) || s.userId;
        const mine = s.books.filter((b) => b.owner_id === s.userId || b.is_mine).map((b) => b.id);
        if (!mine.length) { toast('ไม่มีสมุดของคุณในเครื่อง'); return; }
        const inMine = <T extends { book_id: string }>(rows: T[]) => rows.filter((r) => mine.includes(r.book_id));
        try {
          await remote.upsertProfile(owner, s.books.find((b) => mine.includes(b.id))?.owner_name ?? 'ฉัน');
          for (const b of s.books.filter((b) => mine.includes(b.id))) {
            await remote.upsertBook({ ...b, owner_id: owner });
          }
          for (const d of inMine(s.doctors)) await remote.upsertDoctor(d);
          const meds = inMine(s.medications);
          if (meds.length) await remote.upsertMedications(meds);
          for (const a of inMine(s.appointments)) await remote.upsertAppointment(a);
          for (const w of inMine(s.watchRules)) await remote.upsertWatchRule(w);
          for (const g of s.groups.filter((g) => g.owner_id === s.userId)) await remote.insertGroup(g);
          for (const sh of inMine(s.shares)) await remote.upsertShare(sh);
          await refresh(s.userId);
          toast('ส่งข้อมูลขึ้นคลาวด์เรียบร้อยแล้ว');
        } catch (e) {
          toast(`ส่งไม่สำเร็จ: ${(e as Error).message}`);
        }
      },

      uploadLocalData: async () => {
        const local = loadLocal();
        const userId = stateRef.current.userId;
        if (!local || !userId) return;
        await remote.uploadLocalData(local, userId);
        setHasLocalToUpload(false);
        clearLocal();
        await refresh(userId);
        toast('ยกข้อมูลในเครื่องขึ้นคลาวด์แล้ว');
      },

      addBook: (displayName) => {
        const s = stateRef.current;
        const created: Book = {
          id: uid(), owner_id: s.userId, owner_name: displayName.trim() || 'สมุดใหม่',
          full_name: '', address: '', allergy: '', conditions: [],
          blood_type: '', birth_date: '', age: '', emergency_contact: '', avatar: '',
          is_mine: true,
        };
        // แชร์เข้ากลุ่มที่เปิดอยู่ให้เลย ไม่งั้นคนอื่นในบ้านจะไม่เห็นสมุดเล่มใหม่
        const share: BookShare | null = s.activeGroupId
          ? { book_id: created.id, group_id: s.activeGroupId, level: 'full' }
          : null;
        patch((st) => ({
          books: [...st.books, created],
          shares: share ? [...st.shares, share] : st.shares,
          activeBookId: created.id,
        }));
        push(async () => {
          const owner = (await remote.currentUserId()) || created.owner_id;
          const mine = owner !== created.owner_id ? { ...created, owner_id: owner } : created;
          if (owner !== created.owner_id) {
            setState((st) => ({ ...st, books: st.books.map((b) => (b.id === created.id ? mine : b)) }));
          }
          await remote.upsertBook(mine);
          if (share) await remote.upsertShare(share);
        });
      },

      updateBook: (id, p) => {
        // ต้องประกอบแถวใหม่ตรงนี้แล้วส่งตัวนั้นไปเลย ห้ามไปอ่านจาก stateRef ข้างใน push
        // เพราะ push ทำงานทันทีในจังหวะเดียวกับที่กด ส่วน setState ยังไม่ทันมีผล
        // stateRef จึงยังเป็นค่าก่อนแก้ — ที่ผ่านมาแอปจึงส่งค่าเก่าขึ้นคลาวด์ทุกครั้ง
        const before = stateRef.current.books.find((b) => b.id === id);
        if (!before) return;
        const updated: Book = { ...before, ...p };
        patch((s) => ({ books: s.books.map((b) => (b.id === id ? updated : b)) }));
        push(() => remote.updateBook(updated));
      },

      addDoctor: (bookId, doc) => {
        const created: Doctor = { ...doc, id: uid(), book_id: bookId };
        patch((s) => ({ doctors: [...s.doctors, created] }));
        push(() => remote.upsertDoctor(created));
      },

      updateDoctor: (id, p) => {
        const before = stateRef.current.doctors.find((d) => d.id === id);
        if (!before) return;
        const updated: Doctor = { ...before, ...p };
        patch((s) => ({ doctors: s.doctors.map((d) => (d.id === id ? updated : d)) }));
        push(() => remote.upsertDoctor(updated));
      },

      removeDoctor: (id) => {
        patch((s) => ({ doctors: s.doctors.filter((d) => d.id !== id) }));
        push(() => remote.deleteDoctor(id));
      },

      addMedication: (bookId, med) => {
        const created: Medication = {
          ...med, id: uid(), book_id: bookId, duplicate_flag: false, paused: false, paused_note: '',
        };
        const before = stateRef.current.medications;
        const after = markDuplicates([...before, created], bookId);
        setState((s) => ({ ...s, medications: markDuplicates([...s.medications, created], bookId) }));
        // ส่งขึ้นเฉพาะตัวใหม่ + ตัวที่ธงยาซ้ำเปลี่ยน
        const changed = after.filter((m) => {
          const old = before.find((o) => o.id === m.id);
          return !old || old.duplicate_flag !== m.duplicate_flag;
        });
        push(() => remote.upsertMedications(changed));
        return created;
      },

      updateMedication: (id, p) => {
        const before = stateRef.current.medications;
        const target = before.find((m) => m.id === id);
        if (!target) return;
        const after = markDuplicates(
          before.map((m) => (m.id === id ? { ...m, ...p } : m)),
          target.book_id,
        );
        setState((s) => ({ ...s, medications: after }));
        // ชื่อยาเปลี่ยน = ธงยาซ้ำอาจเปลี่ยนทั้งเล่ม ส่งขึ้นเฉพาะตัวที่ต่างจากเดิม
        const changed = after.filter((m) => {
          const old = before.find((o) => o.id === m.id);
          return !old || old.duplicate_flag !== m.duplicate_flag || m.id === id;
        });
        push(() => remote.upsertMedications(changed));
      },

      setMedicationPaused: (id, paused, note = '') => {
        const before = stateRef.current.medications;
        const target = before.find((m) => m.id === id);
        if (!target) return;
        const after = markDuplicates(
          before.map((m) => (m.id === id ? { ...m, paused, paused_note: paused ? note : '' } : m)),
          target.book_id,
        );
        setState((s) => ({ ...s, medications: after }));
        // พัก/กลับมากิน เป็นเรื่องที่คนอื่นในบ้านต้องรู้ ไม่งั้นคนจัดยาตอนเช้า
        // จะงงว่าทำไมยาหายไปจากรายการวันนี้
        actionsRef.current?.addRecord(target.book_id, {
          kind: 'visit',
          title: paused ? `พักยา ${target.name} ไว้ก่อน` : `กลับมากิน ${target.name} ต่อ`,
          body: paused ? note : '',
          important: false,
        });
        const changed = after.filter((m) => {
          const old = before.find((o) => o.id === m.id);
          return !old || old.duplicate_flag !== m.duplicate_flag || m.id === id;
        });
        push(() => remote.upsertMedications(changed));
      },

      removeMedication: (id) => {
        const before = stateRef.current.medications;
        const target = before.find((m) => m.id === id);
        if (!target) return;
        const after = markDuplicates(before.filter((m) => m.id !== id), target.book_id);
        setState((s) => ({
          ...s,
          medications: after,
          medLogs: s.medLogs.filter((l) => l.medication_id !== id),
        }));
        const changed = after.filter((m) => {
          const old = before.find((o) => o.id === m.id);
          return old && old.duplicate_flag !== m.duplicate_flag;
        });
        push(async () => {
          if (changed.length) await remote.upsertMedications(changed);
          await remote.deactivateMedication(id);
        });
      },

      renameDoctorField: (bookId, field, from, to) => {
        const before = stateRef.current.doctors;
        const hits = before.filter((d) => d.book_id === bookId && d[field].trim() === from);
        if (!hits.length) return 0;
        const changed = hits.map((d) => ({ ...d, [field]: to }));
        setState((s) => ({
          ...s,
          doctors: s.doctors.map((d) => changed.find((c) => c.id === d.id) ?? d),
        }));
        push(async () => {
          for (const d of changed) await remote.upsertDoctor(d);
        });
        return hits.length;
      },

      renameMedField: (bookId, field, from, to) => {
        const before = stateRef.current.medications;
        const hits = before.filter((m) => m.book_id === bookId && m[field].trim() === from);
        if (!hits.length) return 0;
        const changed = hits.map((m) => ({ ...m, [field]: to }));
        setState((s) => ({
          ...s,
          medications: s.medications.map(
            (m) => changed.find((c) => c.id === m.id) ?? m,
          ),
        }));
        push(() => remote.upsertMedications(changed));
        return hits.length;
      },

      logDose: (log) => {
        const created: MedLog = {
          ...log, id: uid(), at: new Date().toISOString(),
          actor_name: stateRef.current.actorName || 'ฉัน',
        };
        patch((s) => ({
          medLogs: [
            ...s.medLogs.filter(
              (l) => !(l.medication_id === created.medication_id
                && l.day === created.day && l.slot === created.slot),
            ),
            created,
          ],
        }));
        push(() => remote.upsertMedLog(created));
      },

      addAppointment: (bookId, appt) => {
        const created: Appointment = { ...appt, id: uid(), book_id: bookId, blood_test_done: false };
        patch((s) => ({ appointments: [...s.appointments, created] }));
        push(() => remote.upsertAppointment(created));
      },

      updateAppointment: (id, p) => {
        const before = stateRef.current.appointments.find((a) => a.id === id);
        if (!before) return;
        const updated: Appointment = { ...before, ...p };
        patch((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? updated : a)) }));
        push(() => remote.upsertAppointment(updated));
      },

      setAppointmentPhoto: (id, dataUrl) => {
        const before = stateRef.current.appointments.find((a) => a.id === id);
        if (!before) return;
        const updated: Appointment = { ...before, photo: dataUrl };
        patch((st) => ({ appointments: st.appointments.map((a) => (a.id === id ? updated : a)) }));
        push(async () => {
          let row = updated;
          if (dataUrl.startsWith('data:')) {
            const path = await remote.uploadImage('scans', before.book_id, `appt-${id}`, dataUrl);
            row = { ...updated, photo_path: path };
            setState((st) => ({
              ...st,
              appointments: st.appointments.map((a) => (a.id === id ? { ...a, photo_path: path } : a)),
            }));
          }
          await remote.upsertAppointment(row);
        });
      },

      removeAppointment: (id) => {
        patch((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) }));
        push(() => remote.deleteAppointment(id));
      },

      addRecord: (bookId, rec) => {
        const created: RecordItem = {
          ...rec, id: uid(), book_id: bookId,
          at: rec.at || new Date().toISOString(),
          actor_name: stateRef.current.actorName || 'ฉัน',
        };
        patch((s) => ({ records: [created, ...s.records] }));
        push(async () => {
          let row = created;
          if (created.file?.startsWith('data:')) {
            const path = await remote.uploadImage('scans', bookId, created.id, created.file);
            row = { ...created, file_path: path };
            setState((s) => ({
              ...s,
              records: s.records.map((r) => (r.id === created.id ? { ...r, file_path: path } : r)),
            }));
          }
          await remote.insertRecord(row);
        });
      },

      removeRecords: (ids) => {
        if (!ids.length) return;
        const targets = stateRef.current.records.filter((r) => ids.includes(r.id));
        if (!targets.length) return;
        // ไฟล์รูปต้องตามไปลบด้วย ไม่งั้นพื้นที่เก็บไฟล์โตขึ้นเรื่อยๆ โดยไม่มีทางลด
        const paths = targets.map((r) => r.file_path).filter((p): p is string => Boolean(p));
        patch((s) => ({ records: s.records.filter((r) => !ids.includes(r.id)) }));
        push(async () => {
          await remote.deleteRecords(ids);
          // ลบแถวสำเร็จแล้วถือว่าลบสำเร็จ ไฟล์ค้างไม่ใช่เรื่องที่ต้องให้ผู้ใช้มาลองใหม่
          try { await remote.deleteImages(paths); } catch { /* ไว้เก็บกวาดทีหลัง */ }
        });
      },

      updateRecords: (ids, changes) => {
        if (!ids.length) return;
        patch((s) => ({
          records: s.records.map((r) => (ids.includes(r.id) ? { ...r, ...changes } : r)),
        }));
        push(() => remote.updateRecords(ids, changes));
      },

      addWatchRule: (bookId, rule) => {
        const created: WatchRule = { ...rule, id: uid(), book_id: bookId };
        patch((s) => ({ watchRules: [...s.watchRules, created] }));
        push(() => remote.upsertWatchRule(created));
      },

      updateWatchRule: (id, p) => {
        const before = stateRef.current.watchRules.find((w) => w.id === id);
        if (!before) return;
        const updated: WatchRule = { ...before, ...p };
        patch((s) => ({ watchRules: s.watchRules.map((w) => (w.id === id ? updated : w)) }));
        push(() => remote.upsertWatchRule(updated));
      },

      removeWatchRule: (id) => {
        patch((s) => ({ watchRules: s.watchRules.filter((w) => w.id !== id) }));
        push(() => remote.deleteWatchRule(id));
      },

      createGroup: (name, share) => {
        const s = stateRef.current;
        const group: Group = {
          id: uid(), name: name || 'ครอบครัวใหม่',
          invite_code: `DLK-${Math.floor(1000 + Math.random() * 9000)}`,
          owner_id: s.userId,
          members: [{ id: s.userId || uid(), name: s.actorName || 'ฉัน' }],
        };
        const shareRow: BookShare | null = s.activeBookId
          ? { book_id: s.activeBookId, group_id: group.id, level: share }
          : null;

        patch((cur) => ({
          groups: [...cur.groups, group],
          activeGroupId: group.id,
          shares: shareRow ? [...cur.shares, shareRow] : cur.shares,
        }));

        push(async () => {
          await remote.insertGroup(group);
          if (shareRow) await remote.upsertShare(shareRow);
        });
      },

      joinGroup: async (code, share) => {
        const trimmed = code.trim();
        if (!trimmed) return false;
        const s = stateRef.current;

        if (s.mode === 'cloud' && s.userId) {
          try {
            const group = await remote.joinGroupByCode(trimmed);
            if (s.activeBookId) {
              await remote.upsertShare({ book_id: s.activeBookId, group_id: group.id, level: share });
            }
            await refresh(s.userId);
            setState((cur) => ({ ...cur, activeGroupId: group.id }));
            return true;
          } catch (e) {
            toast((e as Error).message);
            return false;
          }
        }

        // โหมดเครื่องเดียว: ไม่มีเซิร์ฟเวอร์ให้ค้นรหัส จึงจำกลุ่มไว้ในเครื่องก่อน
        const existing = s.groups.find((g) => g.invite_code.toUpperCase() === trimmed.toUpperCase());
        const group: Group = existing ?? {
          id: uid(), name: `ครอบครัว ${trimmed.toUpperCase()}`, invite_code: trimmed.toUpperCase(),
          owner_id: '', members: [{ id: uid(), name: s.actorName || 'ฉัน' }],
        };
        patch((cur) => ({
          groups: existing ? cur.groups : [...cur.groups, group],
          activeGroupId: group.id,
          shares: cur.activeBookId
            ? [
              ...cur.shares.filter((x) => !(x.book_id === cur.activeBookId && x.group_id === group.id)),
              { book_id: cur.activeBookId, group_id: group.id, level: share },
            ]
            : cur.shares,
        }));
        return true;
      },

      setShareLevel: (bookId, level) => {
        const groupId = stateRef.current.activeGroupId;
        if (!groupId) return;
        const row: BookShare = { book_id: bookId, group_id: groupId, level };
        patch((s) => ({
          shares: [
            ...s.shares.filter((x) => !(x.book_id === bookId && x.group_id === groupId)),
            row,
          ],
        }));
        push(() => remote.upsertShare(row));
      },

      loadPhoto: async (path) => {
        if (!path) return;
        try {
          const byPath = await remote.signPhotoUrls([path]);
          const url = byPath.get(path);
          if (!url) { toast('เปิดดูรูปไม่ได้ตอนนี้ — รูปยังอยู่ครบ'); return; }
          setState((st) => ({
            ...st,
            records: st.records.map((r) => (r.file_path === path ? { ...r, file: url } : r)),
            appointments: st.appointments.map((a) => (a.photo_path === path ? { ...a, photo: url } : a)),
          }));
        } catch {
          toast('เปิดดูรูปไม่ได้ตอนนี้ — รูปยังอยู่ครบ ลองใหม่เมื่อสัญญาณดีขึ้น');
        }
      },

      toast,
    };
  }, [toast, refresh]);

  // finishOnboarding ต้องเรียก joinGroup ของตัวเอง จึงต้องอ้างผ่าน ref
  const retryUnsaved = useCallback(() => { void flushRef.current?.(); }, []);
  const discardUnsaved = useCallback(() => {
    failedWrites.current = [];
    setUnsavedCount(0);
    setUnsavedReason('');
  }, []);

  const actionsRef = useRef<Actions | null>(null);
  actionsRef.current = actions;

  const value = useMemo(
    () => ({
      state, actions, toastMsg,
      unsavedCount, unsavedReason, retryUnsaved, discardUnsaved, hasLocalToUpload,
    }),
    [state, actions, toastMsg, unsavedCount, unsavedReason, retryUnsaved, discardUnsaved, hasLocalToUpload],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore ต้องอยู่ใน <StoreProvider>');
  return ctx;
}
