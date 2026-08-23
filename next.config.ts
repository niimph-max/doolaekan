import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      // service worker ต้องคุมได้ทั้ง scope และห้าม cache ตัวไฟล์เอง
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
  ],
};

export default nextConfig;
