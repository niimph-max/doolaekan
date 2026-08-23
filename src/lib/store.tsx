'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Appointment, AppState, Book, BookShare, Doctor, Group, Medication, MedLog, RecordItem, ShareLevel, Tab, WatchRule,
} from './types';
import { uid } from './format';
import { demoState } from './seed';
import { clearLocal, loadLocal, loadPrefs, savePrefs, saveLocal } from './storage';
import * as remote from './remote';
import { getSupabase, isSupabaseConfigured } from './supabase';

const emptyState: AppState = {
  ready: false,
  mode: isSupabaseConfigured ? 'cloud' : 'local',
  userId: '',
  onboarded: false, tab: 'home', actorName: '', bigText: false,
  activeBookId: '', activeGroupId: '',
  books: [], doctors: [], medications: [], medLogs: [],
  appointments: [], records: [], watchRules: [], groups: [], shares: [],
};

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
  uploadLocalData: () => Promise<void>;
  updateBook: (id: string, patch: Partial<Book>) => void;
  addDoctor: (bookId: string, doc: Omit<Doctor, 'id' | 'book_id'>) => void;
  removeDoctor: (id: string) => void;
  addMedication: (bookId: string, med: Omit<Medication, 'id' | 'book_id' | 'duplicate_flag'>) => Medication;
  logDose: (log: Omit<MedLog, 'id' | 'at' | 'actor_name'>) => void;
  addAppointment: (bookId: string, appt: Omit<Appointment, 'id' | 'book_id' | 'blood_test_done'>) => void;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;
  addRecord: (bookId: string, rec: Omit<RecordItem, 'id' | 'book_id' | 'at' | 'actor_name'>) => void;
  addWatchRule: (bookId: string, rule: Omit<WatchRule, 'id' | 'book_id'>) => void;
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
    if (m.book_id !== bookId) continue;
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
    setState((s) => {
      const myBook = data.books.find((b) => b.is_mine);
      return {
        ...s, ...data,
        ready: true, userId,
        onboarded: Boolean(myBook),
        activeBookId: data.books.some((b) => b.id === s.activeBookId)
          ? s.activeBookId
          : (myBook?.id ?? data.books[0]?.id ?? ''),
        activeGroupId: data.groups.some((g) => g.id === s.activeGroupId)
          ? s.activeGroupId
          : (data.groups[0]?.id ?? ''),
      };
    });
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
    const load = async (userId: string | undefined) => {
      if (cancelled) return;
      if (!userId) {
        setState((s) => ({ ...s, ready: true, userId: '', onboarded: false }));
        return;
      }
      try {
        await refresh(userId);
      } catch (e) {
        toast(`โหลดข้อมูลไม่สำเร็จ: ${(e as Error).message}`);
        setState((s) => ({ ...s, ready: true, userId }));
      }
    };

    sb.auth.getSession().then(({ data }) => load(data.session?.user.id));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      load(session?.user.id);
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
          conditions: input.conditions, blood_type: '', age: '', emergency_contact: '',
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
          for (const d of doctors) await remote.insertDoctor(d);
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

      signOut: async () => {
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
          if (book) await remote.upsertBook(book);
        });
      },

      addDoctor: (bookId, doc) => {
        const created: Doctor = { ...doc, id: uid(), book_id: bookId };
        patch((s) => ({ doctors: [...s.doctors, created] }));
        push(() => remote.insertDoctor(created));
      },

      removeDoctor: (id) => {
        patch((s) => ({ doctors: s.doctors.filter((d) => d.id !== id) }));
        push(() => remote.deleteDoctor(id));
      },

      addMedication: (bookId, med) => {
        const created: Medication = { ...med, id: uid(), book_id: bookId, duplicate_flag: false };
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
        push(() => remote.insertWatchRule(created));
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
