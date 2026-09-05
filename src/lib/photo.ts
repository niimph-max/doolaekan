/** ย่อรูปก่อนเก็บ
 *
 *  รูปคือของหนักที่สุดในแอปนี้ — เคยกิน egress ไป 32 GB เพราะเก็บรูปเต็มขนาด
 *  ที่ผู้ใช้ถ่ายมาจากมือถือ (ใบละหลายเมกะไบต์) รูปที่จดกันทุกวันยิ่งต้องเบา
 *
 *  1000px คุณภาพ 0.72 ยังอ่านตัวหนังสือบนซองยาออก และเห็นผื่นได้ชัดพอที่จะ
 *  เอาให้หมอดู ซึ่งคือเหตุผลเดียวที่ถ่ายเก็บไว้
 *
 *  ย่อไม่สำเร็จให้คืนรูปเดิม ไม่ใช่โยน error ทิ้ง — ของที่ผู้ใช้เพิ่งถ่ายมา
 *  ห้ามหายเพราะเบราว์เซอร์รุ่นแปลกๆ ทำ canvas ไม่ได้ */
const MAX_SIDE = 1000;
const QUALITY = 0.72;

/** รูปเอกสารต้องอ่านตัวหนังสือออก จึงย่อน้อยกว่ารูปอาหาร
 *
 *  เดิมรูปเอกสารไม่ถูกย่อเลย เก็บเต็มขนาดที่ได้จากมือถือ ใบละ 3-8 MB
 *  ซึ่งเท่ากับรูปอาหารสามสิบใบ นี่คือตัวกินพื้นที่ที่แท้จริงของแอปนี้
 *
 *  1600px คุณภาพ 0.8 ยังอ่านตัวเลขบนใบผลเลือดและตัวหนังสือบนใบนัดออกชัด
 *  แต่เหลือราว 400 KB — ประหยัดราว 90% */
const DOC_MAX_SIDE = 1600;
const DOC_QUALITY = 0.8;

/** ย่อรูปเอกสาร — เก็บรายละเอียดไว้มากกว่ารูปทั่วไป */
export function shrinkDoc(dataUrl: string): Promise<string> {
  return resize(dataUrl, DOC_MAX_SIDE, DOC_QUALITY);
}

export function shrinkPhoto(dataUrl: string): Promise<string> {
  return resize(dataUrl, MAX_SIDE, QUALITY);
}

function resize(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
