'use client';

import React, { useState } from 'react';
import { AuthGate } from './AuthGate';
import { ConfigError } from './ConfigError';
import { LoadError } from './LoadError';
import { Splash } from './Splash';
import { Onboarding } from './Onboarding';
import { NoBook } from './NoBook';
import { TabBar } from './TabBar';
import { EmergencyCard } from './EmergencyCard';
import { TodayScreen } from './screens/TodayScreen';
import { MedsScreen } from './screens/MedsScreen';
import { ApptsScreen } from './screens/ApptsScreen';
import { BookScreen } from './screens/BookScreen';
import { ActorSheet } from './sheets/ActorSheet';
import { AddApptSheet } from './sheets/AddApptSheet';
import { AddMedSheet } from './sheets/AddMedSheet';
import { GroupSheet } from './sheets/GroupSheet';
import { ProfileSheet } from './sheets/ProfileSheet';
import { ScanSheet } from './sheets/ScanSheet';
import { TidyNamesSheet } from './sheets/TidyNamesSheet';
import { SymptomSheet } from './sheets/SymptomSheet';
import { activeBook } from '@/lib/selectors';
import { useStore } from '@/lib/store';
import { hasBrokenConfig } from '@/lib/supabase';

type SheetName = 'actor' | 'symptom' | 'appt' | 'med' | 'scan' | 'group' | 'profile' | 'tidy' | null;

export function AppShell() {
  const {
    state, actions, toastMsg,
    unsavedCount, unsavedReason, retryUnsaved, discardUnsaved, hasLocalToUpload,
  } = useStore();
  const [sheet, setSheet] = useState<SheetName>(null);
  const [emergency, setEmergency] = useState(false);

  // ใส่ค่า Supabase ไว้แล้วแต่ค่าผิด — ห้ามเงียบๆ ถอยไปโหมดเครื่องเดียว เพราะผู้ใช้ตั้งใจจะต่อคลาวด์
  if (hasBrokenConfig) return <div className="app"><ConfigError /></div>;

  if (!state.ready) return <div className="app" aria-busy="true"><Splash /></div>;

  // ต่อคลาวด์แล้วแต่ยังไม่ได้เข้าระบบ
  if (state.mode === 'cloud' && !state.userId) {
    return <div className="app"><AuthGate /></div>;
  }

  // ดึงข้อมูลไม่สำเร็จ ≠ ยังไม่มีสมุด — ห้ามพาไปหน้ากรอกข้อมูลใหม่
  // ครอบคลุมตอนเช็คสถานะเข้าระบบไม่ผ่านด้วย ซึ่งตอนนั้นยังไม่มี userId
  if (state.mode === 'cloud' && state.loadError) {
    return <div className="app"><LoadError /></div>;
  }

  if (!state.onboarded) {
    // เข้าระบบแล้วแต่ไม่เห็นสมุด = แยกไม่ออกว่าเป็นผู้ใช้ใหม่ หรืออ่านข้อมูลไม่ติด
    // ห้ามพาไปหน้ากรอกข้อมูลตรงๆ ให้ไปที่ที่รอได้ก่อน แล้วค่อยเลือกเองว่าจะสร้างใหม่
    const signedIn = state.mode === 'cloud' && Boolean(state.userId);
    return (
      <div className="app">
        {signedIn ? <NoBook /> : <Onboarding />}
        <div style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 55, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          maxWidth: 'calc(100vw - 32px)',
        }}>
          {hasLocalToUpload && (
            <button type="button" className="o-btn secondary"
              onClick={() => { void actions.uploadLocalData(); }}>
              ยกข้อมูลในเครื่องขึ้นคลาวด์
            </button>
          )}
          {state.mode === 'local' && (
            <button type="button" className="o-btn ghost" onClick={actions.loadDemo}>
              ดูโหมดตัวอย่างก่อน
            </button>
          )}
          {state.mode === 'cloud' && state.userEmail && (
            <button type="button" className="o-btn ghost"
              title={state.userEmail}
              onClick={() => { void actions.signOut(); }}>
              {state.userEmail} · ออกจากระบบ
            </button>
          )}
        </div>
      </div>
    );
  }

  const book = activeBook(state);
  if (!book) return <div className="app" />;

  const close = () => setSheet(null);

  return (
    <div className="app">
      {state.tab === 'home' && (
        <TodayScreen
          book={book}
          onOpenActor={() => setSheet('actor')}
          onOpenSymptom={() => setSheet('symptom')}
          onOpenEmergency={() => setEmergency(true)}
          onAddAppt={() => setSheet('appt')}
        />
      )}
      {state.tab === 'meds' && (
        <MedsScreen book={book} onScan={() => setSheet('scan')} onAddMed={() => setSheet('med')}
          onTidy={() => setSheet('tidy')} />
      )}
      {state.tab === 'appts' && <ApptsScreen book={book} onAdd={() => setSheet('appt')} />}
      {state.tab === 'book' && (
        <BookScreen book={book} onOpenGroup={() => setSheet('group')} onOpenProfile={() => setSheet('profile')} />
      )}

      <TabBar tab={state.tab} onChange={actions.setTab} />

      <ActorSheet open={sheet === 'actor'} onClose={close} />
      <SymptomSheet open={sheet === 'symptom'} bookId={book.id} onClose={close} />
      <AddApptSheet open={sheet === 'appt'} bookId={book.id} onClose={close} />
      <AddMedSheet open={sheet === 'med'} bookId={book.id} onClose={close} />
      <ScanSheet open={sheet === 'scan'} bookId={book.id} onClose={close} />
      <GroupSheet open={sheet === 'group'} onClose={close} />
      <TidyNamesSheet open={sheet === 'tidy'} book={book} onClose={close} />
      {sheet === 'profile' && <ProfileSheet open book={book} onClose={close} />}

      {emergency && <EmergencyCard book={book} onClose={() => setEmergency(false)} />}

      {toastMsg && !unsavedCount && <div className="toast" role="status">{toastMsg}</div>}

      {unsavedCount > 0 && (
        <div className="unsaved-bar" role="alert">
          <span style={{ flex: 1, minWidth: 0 }}>
            ยังบันทึกไม่สำเร็จ {unsavedCount} รายการ — ข้อมูลยังอยู่ในเครื่อง
            {unsavedReason && (
              <span style={{ display: 'block', fontSize: 14, opacity: 0.85, marginTop: 4 }}>
                {unsavedReason}
              </span>
            )}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '0 0 auto' }}>
            <button type="button" onClick={retryUnsaved}>ลองใหม่</button>
            <button type="button" className="ghost" onClick={discardUnsaved}>เลิกลอง</button>
          </span>
        </div>
      )}
    </div>
  );
}
