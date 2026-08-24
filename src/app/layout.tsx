import type { Metadata, Viewport } from 'next';
import { Mitr, Sarabun } from 'next/font/google';
import './globals.css';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RegisterSW } from '@/components/RegisterSW';
import { StoreProvider } from '@/lib/store';

// โหลดฟอนต์เก็บไว้ในตัวเว็บตอน build — ผู้ใช้ไม่ต้องรอต่อไปที่ fonts.googleapis.com
// display: 'swap' ให้ตัวหนังสือขึ้นด้วยฟอนต์ระบบไปก่อน ไม่ต้องรอฟอนต์ไทยเสร็จ
const mitr = Mitr({ subsets: ['thai', 'latin'], weight: ['400', '500'], display: 'swap', variable: '--font-mitr' });
const sarabun = Sarabun({ subsets: ['thai', 'latin'], weight: ['400', '600', '700'], display: 'swap', variable: '--font-sarabun' });

// Next เติม basePath ให้ asset ของตัวเองอัตโนมัติ แต่ไม่เติมให้ manifest/icons ใน metadata
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" data-bigtext="0" className={`${mitr.variable} ${sarabun.variable}`}>
      <body>
        <ErrorBoundary>
          <StoreProvider>{children}</StoreProvider>
        </ErrorBoundary>
        <RegisterSW />
      </body>
    </html>
  );
}
