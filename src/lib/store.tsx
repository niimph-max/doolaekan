'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Appointment, AppState, Book, Doctor, Group, Medication, MedLog, RecordItem, ShareLevel, Tab, WatchRule,
} from './types';
import { uid } from './format';
import { demoState } from './seed';
import { clearLocal, loadLocal, saveLocal } from './storage';

const emptyState: AppState = {
  ready: false, onboarded: false, tab: 'home', actorName: '', bigText: false,
  activeBookId: '', activeGroupId: '',
  books: [], doctors: [], medications: [], medLogs: [],
  appointments: [], records: [], watchRules: [], groups: [],
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
  joinGroup: (code: string, share: ShareLevel) => boolean;
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
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // โหลดจากเครื่องครั้งแรก
  useEffect(() => {
    const saved = loadLocal();
    setState(saved ? { ...emptyState, ...saved, ready: true } : { ...emptyState, ready: true });
  }, []);

  // เขียนกลับทุกครั้งที่ state เปลี่ยน (หลังพร้อมแล้วเท่านั้น กันเขียนทับด้วยค่าว่าง)
  useEffect(() => {
    if (state.ready) saveLocal(state);
  }, [state]);

  // โหมดตัวหนังสือใหญ่ผูกกับ :root[data-bigtext]
  useEffect(() => {
    document.documentElement.dataset.bigtext = state.bigText ? '1' : '0';
  }, [state.bigText]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);

  const actions = useMemo<Actions>(() => {
    const patch = (fn: (s: AppState) => Partial<AppState>) => setState((s) => ({ ...s, ...fn(s) }));

    /** ยาซ้ำ = ตัวยาหลัก (คำแรกของชื่อ) ตรงกันในสมุดเดียวกัน แต่คนละหมอสั่ง */
    const markDuplicates = (meds: Medication[], bookId: string): Medication[] => {
      const inBook = meds.filter((m) => m.book_id === bookId);
      const key = (m: Medication) => m.name.trim().split(/[\s\d]/)[0];
      const groups = new Map<string, Medication[]>();
      for (const m of inBook) {
        const k = key(m);
        groups.set(k, [...(groups.get(k) ?? []), m]);
      }
      const dupIds = new Set<string>();
      for (const list of groups.values()) {
        if (list.length > 1) list.forEach((m) => dupIds.add(m.id));
      }
      return meds.map((m) =>
        m.book_id === bookId ? { ...m, duplicate_flag: dupIds.has(m.id) } : m,
      );
    };

    return {
      setTab: (tab) => patch(() => ({ tab })),
      setActor: (actorName) => patch(() => ({ actorName })),
      setBigText: (bigText) => patch(() => ({ bigText })),
      setActiveBook: (activeBookId) => patch(() => ({ activeBookId })),
      setActiveGroup: (activeGroupId) => patch(() => ({ activeGroupId })),

      finishOnboarding: (input) => {
        const bookId = uid('b');
        const book: Book = {
          id: bookId, owner_name: input.displayName || 'ฉัน', full_name: input.fullName,
          address: input.address, allergy: input.allergy, conditions: input.conditions,
          blood_type: '', age: '', emergency_contact: '',
          share_level: input.groupChoice === 'solo' ? 'none' : input.shareLevel,
          is_mine: true,
        };
        const doctors: Doctor[] = input.doctors.map((d) => ({ ...d, id: uid('dr'), book_id: bookId }));
        const groups: Group[] = [];
        if (input.groupChoice === 'create') {
          groups.push({
            id: uid('g'), name: input.groupName || 'ครอบครัวของฉัน',
            invite_code: `DLK-${Math.floor(1000 + Math.random() * 9000)}`,
            members: [{ id: uid('u'), name: book.owner_name }], book_ids: [bookId],
          });
        } else if (input.groupChoice === 'join') {
          groups.push({
            id: uid('g'), name: 'ครอบครัว (เข้าร่วมด้วยรหัส)',
            invite_code: input.inviteCode || 'DLK-0000',
            members: [{ id: uid('u'), name: book.owner_name }], book_ids: [bookId],
          });
        }
        patch(() => ({
          onboarded: true, books: [book], doctors, groups,
          activeBookId: bookId, activeGroupId: groups[0]?.id ?? '',
          actorName: book.owner_name, tab: 'home',
        }));
      },

      loadDemo: () => setState({ ...demoState(), ready: true }),

      resetAll: () => {
        clearLocal();
        setState({ ...emptyState, ready: true });
      },

      updateBook: (id, p) =>
        patch((s) => ({ books: s.books.map((b) => (b.id === id ? { ...b, ...p } : b)) })),

      addDoctor: (bookId, doc) =>
        patch((s) => ({ doctors: [...s.doctors, { ...doc, id: uid('dr'), book_id: bookId }] })),

      removeDoctor: (id) => patch((s) => ({ doctors: s.doctors.filter((d) => d.id !== id) })),

      addMedication: (bookId, med) => {
        const created: Medication = { ...med, id: uid('m'), book_id: bookId, duplicate_flag: false };
        setState((s) => ({ ...s, medications: markDuplicates([...s.medications, created], bookId) }));
        return created;
      },

      logDose: (log) =>
        patch((s) => ({
          medLogs: [
            ...s.medLogs.filter(
              (l) => !(l.book_id === log.book_id && l.medication_id === log.medication_id
                && l.day === log.day && l.slot === log.slot),
            ),
            { ...log, id: uid('log'), at: new Date().toISOString(), actor_name: s.actorName || 'ฉัน' },
          ],
        })),

      addAppointment: (bookId, appt) =>
        patch((s) => ({
          appointments: [
            ...s.appointments,
            { ...appt, id: uid('a'), book_id: bookId, blood_test_done: false },
          ],
        })),

      updateAppointment: (id, p) =>
        patch((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? { ...a, ...p } : a)) })),

      addRecord: (bookId, rec) =>
        patch((s) => ({
          records: [
            { ...rec, id: uid('r'), book_id: bookId, at: new Date().toISOString(), actor_name: s.actorName || 'ฉัน' },
            ...s.records,
          ],
        })),

      addWatchRule: (bookId, rule) =>
        patch((s) => ({ watchRules: [...s.watchRules, { ...rule, id: uid('w'), book_id: bookId }] })),

      createGroup: (name, share) =>
        setState((s) => {
          const g: Group = {
            id: uid('g'), name: name || 'ครอบครัวใหม่',
            invite_code: `DLK-${Math.floor(1000 + Math.random() * 9000)}`,
            members: [{ id: uid('u'), name: s.actorName || 'ฉัน' }],
            book_ids: s.activeBookId ? [s.activeBookId] : [],
          };
          return {
            ...s,
            groups: [...s.groups, g],
            activeGroupId: g.id,
            books: s.books.map((b) => (b.id === s.activeBookId ? { ...b, share_level: share } : b)),
          };
        }),

      joinGroup: (code, share) => {
        const trimmed = code.trim().toUpperCase();
        if (!trimmed) return false;
        setState((s) => {
          const existing = s.groups.find((g) => g.invite_code.toUpperCase() === trimmed);
          if (existing) {
            return {
              ...s,
              activeGroupId: existing.id,
              books: s.books.map((b) => (b.id === s.activeBookId ? { ...b, share_level: share } : b)),
            };
          }
          const g: Group = {
            id: uid('g'), name: `ครอบครัว ${trimmed}`, invite_code: trimmed,
            members: [{ id: uid('u'), name: s.actorName || 'ฉัน' }],
            book_ids: s.activeBookId ? [s.activeBookId] : [],
          };
          return {
            ...s,
            groups: [...s.groups, g],
            activeGroupId: g.id,
            books: s.books.map((b) => (b.id === s.activeBookId ? { ...b, share_level: share } : b)),
          };
        });
        return true;
      },

      setShareLevel: (bookId, level) =>
        patch((s) => ({ books: s.books.map((b) => (b.id === bookId ? { ...b, share_level: level } : b)) })),

      toast,
    };
  }, [toast]);

  const value = useMemo(() => ({ state, actions, toastMsg }), [state, actions, toastMsg]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore ต้องอยู่ใน <StoreProvider>');
  return ctx;
}
