// Generated label images exercise the actual worker, WASM, bundled data and parser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...rest) {
  return resolve.call(this, id.startsWith('@/') ? path.join(__dirname, '..', id.slice(2)) : id, ...rest);
};
const { tesseractExtractText, parseOcrText } = require('../services/tesseract/index.ts');
(async () => {
  for (const [name, expiry] of [['printed-expiry', '2027-02-28'], ['manufacture-only', null]]) {
    const text = await tesseractExtractText(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.png`)));
    assert.equal(parseOcrText(text, '2026-10-25').expiry_date, expiry);
    console.log(`PASS: actual OCR worker — ${name}`);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
