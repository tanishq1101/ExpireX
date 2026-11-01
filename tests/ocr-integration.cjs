// Generated label images exercise the actual worker, WASM, bundled data and parser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const sharp = require('sharp');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...rest) {
  return resolve.call(this, id.startsWith('@/') ? path.join(__dirname, '..', id.slice(2)) : id, ...rest);
};
const { tesseractExtractText, parseOcrText } = require('../services/tesseract/index.ts');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** Render a label as an image; `opts` degrade it the way real phone photos are degraded. */
async function label(lines, { w = 1200, h = 800, bg = '#ffffff', fg = '#111111', size = 56, rotate = 0, blur = 0, noise = 0, skew = 0 } = {}) {
  const text = lines.map((l, i) => `<text x="60" y="${110 + i * (size * 1.5)}" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="${size}" fill="${fg}">${esc(l)}</text>`).join('');
  let img = sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${text}</svg>`));
  let buf = await img.png().toBuffer();
  if (blur) buf = await sharp(buf).blur(blur).png().toBuffer();
  if (noise) {
    const grain = await sharp({ create: { width: w, height: h, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: noise } } }).png().toBuffer();
    buf = await sharp(buf).composite([{ input: grain, blend: 'overlay' }]).png().toBuffer();
  }
  if (skew) buf = await sharp(buf).rotate(skew, { background: bg }).png().toBuffer();
  if (rotate) buf = await sharp(buf).rotate(rotate, { background: bg }).png().toBuffer();
  return buf;
}

const cases = [
  ['clean label', () => label(['Tomato Ketchup', 'MFG 01/06/2026', 'EXP 15/06/2027']), '2027-06-15'],
  ['small print on a big pack', () => label(['Choco Crunch Cereal', 'MFG 02/2026  BEST BEFORE 12 MAR 2027'], { w: 2400, h: 1600, size: 30 }), '2027-03-12'],
  ['sideways (rotated 90)', () => label(['Fresh Milk', 'EXP 20/09/2027'], { rotate: 90 }), '2027-09-20'],
  ['sideways (rotated 270)', () => label(['Fresh Milk', 'EXP 20/09/2027'], { rotate: 270 }), '2027-09-20'],
  ['faint grey print', () => label(['Face Cream SPF 30', 'EXP 11/2027'], { bg: '#cfcfcf', fg: '#8c8c8c' }), '2027-11-30'],
  ['light text on dark pack', () => label(['Energy Drink', 'BEST BEFORE 05/05/2027'], { bg: '#14213d', fg: '#f1f1f1' }), '2027-05-05'],
  ['blurry and grainy', () => label(['Orange Juice', 'USE BY 30 NOV 2026'], { blur: 1.4, noise: 40 }), '2026-11-30'],
  ['tilted photo', () => label(['Paracetamol Tablets', 'MFD 03/2026  EXP 03/2028'], { skew: 7 }), '2028-03-31'],
  ['no printed date', () => label(['Mixed Fruit Jam', 'Net wt 500 g', 'Batch 20270615']), null],
];

(async () => {
  let failed = 0;
  // Real fixtures first (exact reproduction of earlier behaviour).
  for (const [name, expiry] of [['printed-expiry', '2027-02-28'], ['manufacture-only', null]]) {
    const text = await tesseractExtractText(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.png`)));
    assert.equal(parseOcrText(text, '2026-10-25').expiry_date, expiry);
    console.log(`PASS: actual OCR worker — ${name}`);
  }
  for (const [name, make, expected] of cases) {
    const t0 = Date.now();
    try {
      const text = await tesseractExtractText(await make());
      const got = parseOcrText(text, '2026-10-25').expiry_date;
      if (got !== expected) throw new Error(`expected ${expected}, got ${got}\n${text}`);
      console.log(`PASS: ${name} (${Date.now() - t0} ms)`);
    } catch (e) {
      failed++;
      console.log(`FAIL: ${name} (${Date.now() - t0} ms) — ${e.message}`);
    }
  }
  if (failed) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
