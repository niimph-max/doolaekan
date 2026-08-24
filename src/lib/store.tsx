'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Appointment, AppState, Book, BookShare, Doctor, Group, Medication, MedLog, RecordItem, ShareLevel, Tab, WatchRule,
} from './types';
import { uid } from './format';
import { demoState } from './seed';
import {
  clearCloudCache, clearLocal, loadCloudCache, loadLastUserId, loadLocal, loadPrefs,
  saveCloudCache, saveLastUserId, savePrefs, saveLocal,
} from './storage';
import * as remote from './remote';
import { getSupabase, isSupabaseConfigured } from './supabase';

const emptyState: AppState = {
  ready: false,
  mode: isSupabaseConfigured ? 'cloud' : 'local',
  userId: '',
  userEmail: '',
  loadError: '',
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
  const myBook = data.books.find((b) => b.is_mine);
  return {
    ...s, ...data,
    ready: true, userId, loadError: '',
    onboarded: Boolean(myBook),
    activeBookId: data.books.some((b) => b.id === s.activeBookId)
      ? s.activeBookId
      : (myBook?.id ?? data.books[0]?.id ?? ''),
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
  retryLoad: () => Promise<void>;
  uploadLocalData: () => Promise<void>;
  updateBook: (id: string, patch: Partial<Book>) => void;
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
  logDose: (log: Omit<MedLog, 'id' | 'at' | 'actor_name'>) => void;
  addAppointment: (bookId: string, appt: Omit<Appointment, 'id' | 'book_id' | 'blood_test_done'>) => void;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;
  removeAppointment: (id: string) => void;
  addRecord: (bookId: string, rec: Omit<RecordItem, 'id' | 'book_id' | 'at' | 'actor_name'>) => void;
  addWatchRule: (bookId: string, rule: Omit<WatchRule, 'id' | 'book_id'>) => void;
  updateWatchRule: (id: string, patch: Partial<WatchRule>) => void;
  removeWatchRule: (id: string) => void;
  createGroup: (name: string, share: ShareLevel) => void;
  joinGroup: (code: string, share: ShareLevel) => Promise<boolean>;
  setShareLevel: (bookId: string, level: ShareLevel) => void;
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
    // จำไว้ว่าใครเข้าระบบค้างอยู่ เปิดแอปครั้งหน้าจะได้หยิบสำเนาของคนนี้ขึ้นมาทันที
    // (ตัวสำเนาเองมี effect คอยเขียนตามทุกครั้งที่ข้อมูลเปลี่ยน)
    saveLastUserId(userId);
  }, []);

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
        // ออกจากระบบไปแล้ว (หรือหมดอายุ) — สำเนาบนจอต้องหายไปด้วย
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
      setState((s) => ({ ...s, userEmail: email || s.userEmail }));
      try {
        await refresh(userId);
        showingCache = true;
      } catch (e) {
        // ห้ามปล่อยให้ตกไปหน้า onboarding — ผู้ใช้ที่มีสมุดอยู่แล้วจะนึกว่าข้อมูลหาย
        // แล้วกรอกใหม่จนได้สมุดซ้ำสองเล่ม
        if (showingCache) {
          // มีสำเนาให้ดูอยู่แล้ว ไม่ต้องขึ้นหน้าเต็มจอขวางทาง บอกเบาๆ ก็พอ
          setState((s) => ({ ...s, ready: true, userId }));
          toast('อัปเดตข้อมูลล่าสุดไม่สำเร็จ — กำลังแสดงข้อมูลที่เก็บไว้ในเครื่อง');
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
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
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
    saveCloudCache(state.userId, {
      books: state.books, doctors: state.doctors, medications: state.medications,
      medLogs: state.medLogs, appointments: state.appointments, records: state.records,
      watchRules: state.watchRules, groups: state.groups, shares: state.shares,
    });
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

    /** ยิงคำสั่งเขียนขึ้นคลาวด์ — ล้มเหลวก็บอกผู้ใช้แล้วดึงของจริงกลับมาแสดง */
    const push = (fn: () => Promise<void>) => {
      if (stateRef.current.mode !== 'cloud' || !stateRef.current.userId) return;
      fn().catch((e: Error) => {
        toast(`บันทึกขึ้นคลาวด์ไม่สำเร็จ: ${e.message}`);
        refresh(stateRef.current.userId).catch(() => { /* แสดงของเดิมไปก่อน */ });
      });
    };

    return {
      setTab: (tab) => patch(() => ({ tab })),
      setActor: (actorName) => patch(() => ({ actorName })),
      setBigText: (bigText) => patch(() => ({ bigText })),
      setActiveBook: (activeBookId) => patch(() => ({ activeBookId })),
      setActiveGroup: (activeGroupId) => patch(() => ({ activeGroupId })),

      finishOnboarding: (input) => {
        const s = stateRef.current;
        const bookId = uid();
        const book: Book = {
          id: bookId, owner_id: s.userId, owner_name: input.displayName || 'ฉัน',
          full_name: input.fullName, address: input.address, allergy: input.allergy,
          conditions: input.conditions, blood_type: '', birth_date: '', age: '', emergency_contact: '',
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
          await remote.upsertProfile(s.userId, book.owner_name);
          await remote.upsertBook(book);
          for (const d of doctors) await remote.upsertDoctor(d);
          for (const g of groups) await remote.insertGroup(g);
          for (const sh of shares) await remote.upsertShare(sh);
        });

        // เข้ากลุ่มด้วยรหัสต้องผ่าน RPC จึงทำแยกหลังจากมีสมุดแล้ว
        if (input.groupChoice === 'join' && input.inviteCode.trim()) {
          void actionsRef.current?.joinGroup(input.inviteCode, input.shareLevel);
        }
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
        try {
          await refresh(userId);
        } catch (e) {
          setState((s) => ({ ...s, loadError: (e as Error).message }));
        }
      },

      signOut: async () => {
        clearCloudCache(stateRef.current.userId);
        saveLastUserId('');
        await getSupabase()?.auth.signOut();
        setState({ ...emptyState, ready: true });
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

      updateBook: (id, p) => {
        patch((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
        push(async () => {
          const book = stateRef.current.books.find((b) => b.id === id);
          if (book) await remote.updateBook(book);
        });
      },

      addDoctor: (bookId, doc) => {
        const created: Doctor = { ...doc, id: uid(), book_id: bookId };
        patch((s) => ({ doctors: [...s.doctors, created] }));
        push(() => remote.upsertDoctor(created));
      },

      updateDoctor: (id, p) => {
        patch((s) => ({ doctors: s.doctors.map((d) => (d.id === id ? { ...d, ...p } : d)) }));
        push(async () => {
          const doc = stateRef.current.doctors.find((d) => d.id === id);
          if (doc) await remote.upsertDoctor(doc);
        });
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

      renameMedField: (bookId, field, from, to) => {
        const before = stateRef.current.medications;
        const hits = before.filter((m) => m.book_id === bookId && m[field] === from);
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
        patch((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
        push(async () => {
          const appt = stateRef.current.appointments.find((a) => a.id === id);
          if (appt) await remote.upsertAppointment(appt);
        });
      },

      removeAppointment: (id) => {
        patch((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) }));
        push(() => remote.deleteAppointment(id));
      },

      addRecord: (bookId, rec) => {
        const created: RecordItem = {
          ...rec, id: uid(), book_id: bookId, at: new Date().toISOString(),
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

      addWatchRule: (bookId, rule) => {
        const created: WatchRule = { ...rule, id: uid(), book_id: bookId };
        patch((s) => ({ watchRules: [...s.watchRules, created] }));
        push(() => remote.upsertWatchRule(created));
      },

      updateWatchRule: (id, p) => {
        patch((s) => ({ watchRules: s.watchRules.map((w) => (w.id === id ? { ...w, ...p } : w)) }));
        push(async () => {
          const rule = stateRef.current.watchRules.find((w) => w.id === id);
          if (rule) await remote.upsertWatchRule(rule);
        });
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

      toast,
    };
  }, [toast, refresh]);

  // finishOnboarding ต้องเรียก joinGroup ของตัวเอง จึงต้องอ้างผ่าน ref
  const actionsRef = useRef<Actions | null>(null);
  actionsRef.current = actions;

  const value = useMemo(
    () => ({ state, actions, toastMsg, hasLocalToUpload }),
    [state, actions, toastMsg, hasLocalToUpload],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore ต้องอยู่ใน <StoreProvider>');
  return ctx;
}
