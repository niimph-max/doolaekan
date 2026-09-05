import type { Metadata, Viewport } from 'next';
import { Mitr, Sarabun } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppStarted } from '@/components/AppStarted';
import { RegisterSW } from '@/components/RegisterSW';
import { StoreProvider } from '@/lib/store';

// โหลดฟอนต์เก็บไว้ในตัวเว็บตอน build — ผู้ใช้ไม่ต้องรอต่อไปที่ fonts.googleapis.com
// display: 'swap' ให้ตัวหนังสือขึ้นด้วยฟอนต์ระบบไปก่อน ไม่ต้องรอฟอนต์ไทยเสร็จ
const mitr = Mitr({ subsets: ['thai', 'latin'], weight: ['400', '500'], display: 'swap', variable: '--font-mitr' });
const sarabun = Sarabun({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'], display: 'swap', variable: '--font-sarabun' });

// Next เติม basePath ให้ asset ของตัวเองอัตโนมัติ แต่ไม่เติมให้ manifest/icons ใน metadata
//
// เคยลองเปลี่ยนเป็นอ้างแบบสัมพัทธ์ (ไม่ขึ้นต้นด้วย /) ตอนไล่หาสาเหตุที่ย้ายโดเมนแล้วพัง
// แต่ใช้ไม่ได้ เพราะแบบสัมพัทธ์อ้างจากตำแหน่งของหน้า พอมีหน้าที่อยู่ลึกลงไปอย่าง
// /welcome/ ไอคอนจะกลายเป็น /welcome/icon-192.png ซึ่งไม่มีอยู่จริง
// ต้องผูกกับรากเว็บเท่านั้น และ basePath ก็ถูกต้องอยู่แล้วหลังแก้ workflow
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Doolaekan — สมุดสุขภาพ',
  description: 'บันทึกยา นัดหมอ ความดัน และอาการของคนที่บ้าน แชร์กันในครอบครัวเมื่อยินยอม',
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
    apple: `${base}/apple-touch-icon.png`,
  },
  appleWebApp: { capable: true, title: 'Doolaekan', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#f5ead8',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** ตัวกู้ตอนแอปไม่เริ่มทำงาน — ต้องอยู่ในไฟล์ HTML ตรงๆ ไม่ใช่ในก้อน JavaScript ของแอป
 *
 *  วันที่ย้ายโดเมน ทุกเครื่องค้างที่หน้า "กำลังเปิดสมุด…" เพราะไฟล์ js ตอบ 404 หมด
 *  React จึงไม่เคยเริ่ม และเพราะ React ไม่เคยเริ่ม โค้ดที่คอยอัปเดต service worker
 *  ก็ไม่ได้ทำงานตามไปด้วย ตัวเก่าเลยค้างเสิร์ฟหน้าเก่าอยู่อย่างนั้น ไม่มีทางหลุดเอง
 *  ต้องเดินไปล้างข้อมูลเว็บไซต์ทีละเครื่องด้วยมือ — ซึ่งกับพ่อแม่ที่อยู่คนละบ้านคือทางตัน
 *
 *  ตัวนี้จึงฝังไว้ใน HTML ที่ถูกสร้างไว้ล่วงหน้า มันทำงานได้แม้ทุกอย่างที่เหลือพัง
 *
 *  กันไม่ให้ไปล้างของเครื่องที่ปกติดีสามชั้น
 *    1. แอปที่เริ่มได้จะปัก __doolaekanStarted ไว้ (ดู AppStarted.tsx)
 *    2. หน้าจอต้องยังเป็นหน้ารอที่สร้างไว้ล่วงหน้าเท่านั้น (ป้าย data-boot-splash)
 *    3. ต้องมีเน็ต — ออฟไลน์แล้วล้างแคชคือทำให้แย่ลง เพราะจะไม่เหลืออะไรให้เปิดเลย
 *
 *  และกู้ได้ครั้งเดียวต่อการเปิดหนึ่งครั้ง กู้แล้วยังไม่ขึ้น = ไม่ใช่เพราะของเก่าค้าง
 *  ต้องบอกตามตรง ไม่ใช่วนล้างวนโหลดไปเรื่อยๆ ให้ดูเหมือนกำลังโหลดอยู่ */
const bootRescue = `(function(){
  var KEY='doolaekan-rescue', WAIT=8000;
  function mark(){try{sessionStorage.setItem(KEY,'1')}catch(e){}}
  function tried(){try{return sessionStorage.getItem(KEY)}catch(e){return null}}
  function waiting(){return !!document.querySelector('[data-boot-splash]')}
  function tell(){
    document.body.innerHTML='<div style="min-height:100dvh;display:flex;align-items:center;'
      +'justify-content:center;padding:24px;background:#f5ead8;color:#4a3728;'
      +'font-family:system-ui,sans-serif;line-height:1.7"><div style="max-width:22rem;text-align:center">'
      +'<p style="font-size:20px;font-weight:700;margin:0 0 10px">เปิดแอปไม่สำเร็จ</p>'
      +'<p style="margin:0 0 6px">ล้างของเก่าที่ค้างในเครื่องให้แล้ว แต่ยังเปิดไม่ขึ้น '
      +'— แปลว่าไม่ได้ติดที่ของเก่าค้าง</p>'
      +'<p style="margin:0 0 18px">ลองเช็คสัญญาณอินเทอร์เน็ตแล้วกดลองใหม่ '
      +'ข้อมูลที่บันทึกไว้ยังอยู่ครบ ไม่ได้หายไปไหน</p>'
      +'<button type="button" id="boot-retry" style="min-height:48px;padding:11px 24px;border:0;'
      +'border-radius:999px;background:#c2652a;color:#fff;font-weight:600;font-size:16px">'
      +'ลองใหม่อีกครั้ง</button></div></div>';
    var b=document.getElementById('boot-retry');
    if(b)b.onclick=function(){location.reload()};
  }
  setTimeout(function(){
    if(window.__doolaekanStarted||!waiting())return;
    if(navigator.onLine===false)return;
    if(tried()){tell();return}
    mark();
    var jobs=[];
    try{
      if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)
        jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){return r.unregister()}))}));
      if(window.caches&&caches.keys)
        jobs.push(caches.keys().then(function(ks){
          return Promise.all(ks.map(function(k){return caches.delete(k)}))}));
    }catch(e){}
    Promise.all(jobs).catch(function(){}).then(function(){location.reload()});
  },WAIT);
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-bigtext="0" className={`${mitr.variable} ${sarabun.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: bootRescue }} />
        <ErrorBoundary>
          <StoreProvider>{children}</StoreProvider>
        </ErrorBoundary>
        <AppStarted />
        <RegisterSW />
      </body>
    </html>
  );
}
