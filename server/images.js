// Uploaded image checks and metadata removal.
//
// Phone photos often carry the GPS position where they were taken (often the
// owner's home), camera serial numbers and editing history. Before a photo is
// published we parse the file, reject anything that is not a well-formed
// JPEG/PNG/WebP, and drop metadata:
//   JPEG: GPS data is wiped from EXIF (orientation is kept so photos are not
//         shown sideways); XMP, IPTC/Photoshop and comments are removed.
//   PNG:  eXIf and all text/time chunks are removed; data after IEND is cut.
//   WebP: EXIF and XMP chunks are removed.

export class ImageError extends Error {}
const bad = (msg = 'Пошкоджене або непідтримуване зображення') => {
  throw new ImageError(msg);
};

/* ---------------- JPEG ---------------- */

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

// Wipe the GPS IFD inside an EXIF APP1 payload (in place). Returns false if the
// EXIF structure can't be parsed safely, in which case the caller drops it.
function wipeExifGps(seg) {
  if (seg.length < 14 || seg.toString('latin1', 0, 6) !== 'Exif\0\0') return false;
  const t = seg.subarray(6); // TIFF block
  const le = t.toString('latin1', 0, 2) === 'II';
  if (!le && t.toString('latin1', 0, 2) !== 'MM') return false;
  const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const in_ = (o, n) => o >= 0 && n >= 0 && o + n <= t.length;
  if (!in_(0, 8) || u16(2) !== 42) return false;

  const ifd0 = u32(4);
  if (!in_(ifd0, 2)) return false;
  const n = u16(ifd0);
  if (!in_(ifd0 + 2, n * 12)) return false;
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) !== 0x8825) continue; // GPSInfo pointer
    const gps = u32(e + 8);
    if (!in_(gps, 2)) return false;
    const m = u16(gps);
    if (!in_(gps + 2, m * 12)) return false;
    for (let j = 0; j < m; j++) {
      const g = gps + 2 + j * 12;
      const size = (TYPE_SIZE[u16(g + 2)] || 1) * u32(g + 4);
      if (size > 4) {
        const at = u32(g + 8);
        if (in_(at, size)) t.fill(0, at, at + size); // out-of-line values (coordinates)
      }
    }
    t.fill(0, gps, gps + 2 + m * 12); // entry table; count becomes 0
  }
  return true;
}

function cleanJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) bad();
  const parts = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) bad();
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd9) break; // EOI before SOS: no image data
    if (marker >= 0xd0 && marker <= 0xd7) bad();
    if (i + 4 > buf.length) bad();
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) bad();
    const seg = buf.subarray(i, i + 2 + len);
    const payload = Buffer.from(seg.subarray(4)); // copy: we may modify it

    if (marker === 0xda) {
      // Start of scan: compressed image data follows until EOI.
      const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (eoi < i) bad();
      parts.push(buf.subarray(i, eoi + 2)); // anything after EOI is dropped
      return Buffer.concat(parts);
    }

    let keep = true;
    if (marker === 0xe1) keep = wipeExifGps(payload); // EXIF (GPS wiped) — XMP is not EXIF and is dropped
    else if (marker === 0xed || marker === 0xfe) keep = false; // IPTC/Photoshop, comments
    else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) keep = false; // other vendor APPn (keep Adobe APP14)

    if (keep) parts.push(seg.subarray(0, 4), payload);
    i += 2 + len;
  }
  bad();
}

/* ---------------- PNG ---------------- */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function cleanPng(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) bad();
  const parts = [PNG_SIG];
  let i = 8;
  let first = true;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    if (!/^[A-Za-z]{4}$/.test(type) || i + 12 + len > buf.length) bad();
    if (first && type !== 'IHDR') bad();
    first = false;
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') return Buffer.concat(parts); // data after IEND is dropped
  }
  bad();
}

/* ---------------- WebP ---------------- */

function cleanWebp(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') bad();
  const end = Math.min(buf.length, 8 + buf.readUInt32LE(4));
  const chunks = [];
  let i = 12;
  let hasImage = false;
  while (i + 8 <= end) {
    const type = buf.toString('latin1', i, i + 4);
    const len = buf.readUInt32LE(i + 4);
    const total = 8 + len + (len & 1);
    if (i + 8 + len > end) bad();
    if (['VP8 ', 'VP8L', 'ANIM'].includes(type)) hasImage = true;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(buf.subarray(i, Math.min(i + total, end)));
      if (type === 'VP8X' && len >= 1) chunk[8] &= ~0x0c; // clear EXIF/XMP flags
      chunks.push(chunk);
    }
    i += total;
  }
  if (!hasImage) bad();
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

/* ---------------- Entry point ---------------- */

export function sanitizeImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) bad('Завантажте JPG, PNG або WebP до 8 МБ');
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', data: cleanJpeg(buf) };
  if (buf.subarray(0, 8).equals(PNG_SIG)) return { ext: 'png', data: cleanPng(buf) };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', data: cleanWebp(buf) };
  bad('Файл не є зображенням JPG, PNG або WebP');
}
