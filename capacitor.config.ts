import type { CapacitorConfig } from '@capacitor/cli';

/** ตั้งค่าแอปที่ห่อเว็บชุดเดียวกันนี้ขึ้น App Store
 *
 *  webDir ชี้ไปที่ `out` ซึ่งเป็นผลของ `next build` (output: 'export')
 *  ไฟล์ถูกฝังไปในตัวแอป **ไม่ใช่** ชี้ server.url ไปที่ doolaekan.com
 *  สองเหตุผล: แอปเปิลตีกลับแอปที่เป็นแค่เปลือกห่อเว็บ (กติกา 4.2) และถ้าชี้ออก
 *  ข้างนอก เน็ตหลุดเมื่อไหร่แอปก็เปิดไม่ขึ้นเลย ซึ่งผิดกับที่ตั้งใจไว้ทั้งหมด
 *
 *  แปลว่าอัปเดตแอปต้องส่งรุ่นใหม่ขึ้นสโตร์ ไม่เหมือนฝั่งเว็บที่ deploy แล้วถึงทันที
 *  — ต่างกันจริง และเป็นราคาที่ต้องจ่ายเพื่อให้เปิดได้ตอนไม่มีเน็ต */
const config: CapacitorConfig = {
  appId: 'com.doolaekan.app',
  appName: 'Doolaekan',
  webDir: 'out',
  ios: {
    // พื้นหลังเดียวกับสีของแอป ไม่ให้เห็นขาววาบตอนเปิด
    backgroundColor: '#f5ead8',
    // ให้ลิงก์ภายนอก (นโยบายความเป็นส่วนตัว, tel:) เปิดออกไปข้างนอก
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    PushNotifications: {
      // ขอสิทธิ์เอง ตอนผู้ใช้กดปุ่มในหน้าตั้งค่า ไม่ใช่เด้งถามตั้งแต่เปิดแอปครั้งแรก
      // เพราะคนที่ถูกถามก่อนเข้าใจว่าจะได้อะไร มักกดปฏิเสธ แล้วขอใหม่ไม่ได้อีกเลย
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
