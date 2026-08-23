import type { Metadata, Viewport } from 'next';
import './globals.css';
import { RegisterSW } from '@/components/RegisterSW';
import { StoreProvider } from '@/lib/store';

// Next เติม basePath ให้ asset ของตัวเองอัตโนมัติ แต่ไม่เติมให้ manifest/icons ใน metadata
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Doolaekan — สมุดสุขภาพครอบครัว',
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
    <html lang="th" data-bigtext="0">
      <body>
        <StoreProvider>{children}</StoreProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
