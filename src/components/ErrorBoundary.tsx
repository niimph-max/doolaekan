'use client';

import React from 'react';

/** กันจอขาว: ถ้า render พังกลางทาง React จะถอด UI ออกทั้งหมดจนเหลือหน้าว่าง
 *  ผู้ใช้จะไม่มีทางรู้เลยว่าเกิดอะไรขึ้นหรือควรทำอะไรต่อ */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || 'เกิดข้อผิดพลาดที่ไม่รู้จัก' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== 'undefined') console.error('[Doolaekan]', error, info);
  }

  render() {
    if (!this.state.message) return this.props.children;

    return (
      <div className="app">
        <div className="full">
          <div className="full-inner">
            <div className="o-card warn" style={{ marginTop: 48 }}>
              <h3 style={{ marginBottom: 8 }}>แอปสะดุด</h3>
              <p style={{ margin: 0 }}>
                หน้าจอทำงานต่อไม่ได้ แต่<strong>ข้อมูลยังอยู่ครบบนคลาวด์</strong> ไม่ได้หายไปไหน
              </p>
              <p className="subtle" style={{ margin: '10px 0 0', wordBreak: 'break-word' }}>
                {this.state.message}
              </p>
            </div>
            <button type="button" className="o-btn primary block"
              onClick={() => window.location.reload()}>
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      </div>
    );
  }
}
