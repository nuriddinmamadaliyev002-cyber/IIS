// ═══════════════════════════════════════════════════════════════════════════
//  Sertifikat PDF generatori (pdfkit + qrcode)
//
//  • Fon: assets/sertifikat-fon.png (maydonlarsiz shablon). Koordinatalar fon
//    rasmining PIKSEL fazosida (1537×1023) berilgan va rasm o'lchamiga
//    mutanosib o'lchanadi — yuqori sifatli (bir xil nisbatli) rasm bilan
//    almashtirilsa, kod o'zgarmaydi.
//  • Shrift: Liberation (OFL) — oʻ, gʻ belgilarini to'g'ri chiqaradi.
//  • QR: tekshiruv sahifasiga olib boradi (CERT_VERIFY_BASE/sertifikat.html?k=KOD).
//  • PDF diskka SAQLANMAYDI — har so'rovda bazadagi ma'lumotdan yasaladi.
// ═══════════════════════════════════════════════════════════════════════════
const path   = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const ASSETS = path.join(__dirname, '../assets');
const BG     = path.join(ASSETS, 'sertifikat-fon.png');
const F = {
  serif:     path.join(ASSETS, 'fonts/LiberationSerif-Regular.ttf'),
  serifBold: path.join(ASSETS, 'fonts/LiberationSerif-Bold.ttf'),
  sansBold:  path.join(ASSETS, 'fonts/LiberationSans-Bold.ttf'),
  sans:      path.join(ASSETS, 'fonts/LiberationSans-Regular.ttf'),
};

// Fon rasmi o'lchamlari (piksel) — koordinatalar shu fazoda
const IMG_W = 1537, IMG_H = 1023;
const PAGE_W = 842;                       // pt (A4 gorizontal eni)
const S = PAGE_W / IMG_W;                 // piksel → pt
const PAGE_H = IMG_H * S;

const NAVY = '#0B1F5C';

function verifyBase() {
  return (process.env.CERT_VERIFY_BASE || 'https://innovateitschool.uz').replace(/\/+$/, '');
}
function verifyUrl(kod) {
  return `${verifyBase()}/sertifikat.html?k=${encodeURIComponent(kod)}`;
}

// "2026-11-01" yoki Date → "01.11.2026"
function sanaMatn(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  // Sana ustuni DATE (vaqt mintaqasisiz) — mahalliy komponentlardan foydalanamiz
  return `${p(dt.getDate())}.${p(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

// Matnni berilgan kenglikka sig'diradi (shrift kichraytiriladi)
function fit(doc, text, font, size, maxW, minSize = 12) {
  doc.font(font);
  let sz = size;
  while (sz > minSize && doc.fontSize(sz * S).widthOfString(text) > maxW * S) sz -= 1;
  return sz;
}

// Matnni piksel koordinatalarida yozish. (cx, baseline) — markaz va asos chizig'i.
function centered(doc, text, font, size, cx, baseline, maxW, color = NAVY) {
  const sz = fit(doc, text, font, size, maxW);
  doc.font(font).fontSize(sz * S).fillColor(color);
  const w = doc.widthOfString(text);
  const top = baseline * S - sz * S * 0.89;      // asos chizig'idan yuqori chetga
  doc.text(text, cx * S - w / 2, top, { lineBreak: false });
}
function leftAt(doc, text, font, size, x, baseline, maxW, color = NAVY) {
  const sz = fit(doc, text, font, size, maxW);
  doc.font(font).fontSize(sz * S).fillColor(color);
  const top = baseline * S - sz * S * 0.89;
  doc.text(text, x * S, top, { lineBreak: false });
}

/**
 * @param {object} s  { raqam, tekshiruv_kodi, familiya, ism, sharif, direktor_fio, berilgan_sana }
 * @returns {Promise<Buffer>}
 */
async function sertifikatPdf(s) {
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: true,
    info: { Title: `Sertifikat ${s.raqam}`, Author: 'Innovate IT School', Subject: 'Sertifikat' } });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });

  doc.image(BG, 0, 0, { width: PAGE_W, height: PAGE_H });

  // ── Ishtirokchi F.I.Sh. ──
  const fio = [s.familiya, s.ism, s.sharif].map(x => String(x || '').trim()).filter(Boolean).join(' ');
  //    Chiziqning chap boshidan ("...sharifi:" dan keyin) yoziladi; uzun bo'lsa shrift kichrayadi.
  leftAt(doc, fio, F.serifBold, 40, 652, 352, 700);

  // ── Sertifikat raqami: rasmiy reestr raqami (IIS-YYYY-NNNNNN) ──
  //    Tekshiruv kodi alohida — QR kod ostida.
  leftAt(doc, s.raqam, F.sansBold, 25, 878, 631, 210);

  // ── Berilgan sana: sana chiziq USTIDA, "Berilgan sana:" yozuvi chiziq OSTIDA (taqvim belgisi yonida) ──
  //    (fon rasmida bu yozuv yo'q — u shu yerda chiziladi)
  centered(doc, s.sana_matn || sanaMatn(s.berilgan_sana), F.sansBold, 30, 1193, 833, 300);
  leftAt(doc, 'Berilgan sana', F.serifBold, 31, 1106, 913, 220);   // "Direktor Innovate IT School" kabi qalin

  // ── Direktor F.I.Sh. — "Direktor Innovate IT School" tepasidagi chiziq ustida ──
  if (s.direktor_fio && String(s.direktor_fio).trim()) {
    centered(doc, String(s.direktor_fio).trim(), F.serifBold, 26, 809, 827, 262);
  }

  // ── QR kod: pastki o'ng burchakda kichik oq quti; QR tagida tekshiruv kodi ──
  const url = verifyUrl(s.tekshiruv_kodi);
  const png = await QRCode.toBuffer(url, {
    errorCorrectionLevel: 'M', margin: 0, width: 600,
    color: { dark: '#0A1A4A', light: '#FFFFFF' },
  });
  const bx = 1405, by = 867, bw = 91, bh = 107;   // quti (piksel fazosida)
  const qs = 75, qx = bx + (bw - qs) / 2, qy = by + 8;
  doc.save();
  doc.roundedRect(bx * S, by * S, bw * S, bh * S, 5 * S)
     .fillColor('#FFFFFF').strokeColor('#7FB3E6').lineWidth(1 * S).fillAndStroke();
  doc.restore();
  doc.image(png, qx * S, qy * S, { width: qs * S, height: qs * S });
  centered(doc, s.tekshiruv_kodi, F.sansBold, 12, bx + bw / 2, qy + qs + 17, bw - 8);

  doc.end();
  return done;
}

module.exports = { sertifikatPdf, verifyUrl, sanaMatn };
