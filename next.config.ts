import type { NextConfig } from 'next';

// GitHub Pages เสิร์ฟโปรเจกต์ที่ /<ชื่อ repo>/ ไม่ใช่ราก จึงต้องมี basePath
// ตอน dev ในเครื่องไม่ต้องตั้งค่านี้ แอปจะอยู่ที่ / ตามปกติ
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // แอปนี้ทำงานในเบราว์เซอร์ล้วน (คุยกับ Supabase ตรงๆ ไม่มีฝั่งเซิร์ฟเวอร์ของตัวเอง)
  // จึง export เป็นไฟล์นิ่งแล้วเอาไปวางบน static host ไหนก็ได้
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,        // ให้ /path/ เปิดเจอ index.html บน GitHub Pages
  images: { unoptimized: true },
};

export default nextConfig;
