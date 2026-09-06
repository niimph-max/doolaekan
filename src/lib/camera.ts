'use client';

import { isNativeApp } from './native';

/** กล้องของเครื่องจริง สำหรับตอนรันเป็นแอป
 *
 *  ในเบราว์เซอร์เราใช้ `<input type="file" capture>` ซึ่งทำงานได้ดีอยู่แล้ว
 *  แต่ในแอปมีเหตุผลสามข้อที่ต้องใช้กล้องของเครื่องแทน
 *    1. แอปเปิลดูว่าแอปใช้ความสามารถของเครื่องจริงหรือเป็นแค่เปลือกห่อเว็บ (กติกา 4.2)
 *    2. กล้องผ่าน input ใน WKWebView หมุนรูปผิดด้านเป็นบางเครื่อง เพราะไม่มีใคร
 *       อ่าน EXIF ให้ ส่วนของเครื่องหมุนมาให้ถูกตั้งแต่ต้น
 *    3. ย่อขนาดตั้งแต่ตอนถ่าย ไม่ต้องลากรูป 12 ล้านพิกเซลผ่าน base64 ทั้งก้อน
 *       ก่อนจะมาย่อทีหลัง ซึ่งเป็นจังหวะที่เครื่องเก่าค้างได้จริง
 *
 *  ปลั๊กอินถูกโหลดแบบ dynamic import ตลอด คนที่เข้าผ่านเบราว์เซอร์ไม่ต้องโหลด
 *  โค้ดก้อนนี้เลยแม้แต่ไบต์เดียว */

export function hasNativeCamera(): boolean {
  return isNativeApp();
}

/** ถ่ายรูปด้วยกล้องของเครื่อง
 *  คืนค่าว่างถ้าผู้ใช้กดยกเลิก — ซึ่งไม่ใช่ความผิดพลาด ห้ามขึ้นเป็น error
 *  โยน error เฉพาะตอนที่เปิดกล้องไม่ได้จริงๆ เช่นไม่ได้รับอนุญาต */
export async function shootPhoto(opts: { front?: boolean } = {}): Promise<string> {
  const { Camera, CameraDirection, CameraResultType, CameraSource } = await import('@capacitor/camera');
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      direction: opts.front ? CameraDirection.Front : CameraDirection.Rear,
      resultType: CameraResultType.DataUrl,
      // หมุนตาม EXIF ให้เรียบร้อยตั้งแต่ต้น
      correctOrientation: true,
      // ย่อตั้งแต่ตอนถ่าย ให้ใหญ่กว่าค่าที่ photo.ts ย่ออีกทีเล็กน้อย
      // จะได้ไม่เสียรายละเอียดบนใบผลเลือดไปตั้งแต่ก้าวแรก
      width: 2000,
      quality: 90,
      // ให้ดูรูปที่เพิ่งถ่ายก่อนกดใช้ — ถุงยาถ่ายเบลอบ่อยมาก
      allowEditing: false,
      saveToGallery: false,
    });
    return photo.dataUrl ?? '';
  } catch (e) {
    // ปลั๊กอินใช้ error ตัวเดียวกันทั้งกรณีกดยกเลิกและกรณีพังจริง
    // แยกจากข้อความ ไม่งั้นกดยกเลิกทีจะขึ้นแถบแดงทุกครั้ง
    const msg = (e as Error).message ?? '';
    if (/cancel/i.test(msg)) return '';
    throw e;
  }
}
