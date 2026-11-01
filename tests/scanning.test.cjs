const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseOcrText } = require("../lib/ocr-parser.ts");
const { itemFormSchema } = require("../lib/validators.ts");
const { prepareReceiptRows } = require("../lib/receipt-review.ts");
const today = "2026-10-25";

for (const [label, expected] of [
  ["EXP 28/02/2027", "2027-02-28"],
  ["EXP 02/2028", "2028-02-29"],
  ["EXP JUN 2027", "2027-06-30"],
  ["USE BY 15 JUN 2027", "2027-06-15"],
  ["Expiry 2027-06-15", "2027-06-15"],
  ["EXP 31/02/2027", null],
  ["MFG 15/06/2027", null],
  ["Batch 15/06/2027", null],
  ["MFG 01/01/2026 EXP 15/06/2027", "2027-06-15"],
  ["EXP 15/06/2027 MFG 01/01/2026", "2027-06-15"],
  ["EXP 10/01/2025", "2025-01-10"],
  // Month/2-digit-year, compact month names and OCR digit confusion (common on Indian packs).
  ["EXP 06/27", "2027-06-30"],
  ["Exp. 11-25", "2025-11-30"],
  ["BEST BEFORE 15JUN27", "2027-06-15"],
  ["BEST BEFORE 15 JUN 2027", "2027-06-15"],
  ["EXP 2O/O5/2O27", "2027-05-20"],
  ["EXP l5/06/2O27", "2027-06-15"],
  // An unlabelled MM/YY, or an impossible month, must never be guessed as an expiry.
  ["Lot 06/27", null],
  ["EXP 13/27", null],
  ["MFG 06/27", null],
]) {
  test(`OCR: ${label}`, () => assert.equal(parseOcrText(`Test product\n${label}`, today).expiry_date, expected));
}

test("manufacture date remains distinct from expiry", () => {
  const result = parseOcrText("Tablets\nMFG 01/06/2026 EXP 12/2027", today);
  assert.equal(result.manufacture_date, "2026-06-01");
  assert.equal(result.expiry_date, "2027-12-31");
});

const item = { name: "Milk", category: "food", expiry_date: "2027-02-28" };
test("form rejects calendar rollovers and accepts leap days", () => {
  for (const expiry_date of ["2027-02-29", "2027-04-31", "2027-13-01"]) {
    assert.equal(itemFormSchema.safeParse({ ...item, expiry_date }).success, false);
  }
  assert.equal(itemFormSchema.safeParse({ ...item, expiry_date: "2028-02-29" }).success, true);
});

const row = { name: "Milk", category: "food", expiry: "2027-02-28", qty: "1" };
test("receipt validates a complete batch and attaches the current user", () => {
  const result = prepareReceiptRows([row, { ...row, name: "Bread", qty: "2" }], "test-user");
  assert.deepEqual(result.errors, {});
  assert.equal(result.valid.length, 2);
  assert.equal(result.valid[1].user_id, "test-user");
  assert.equal(result.valid[1].quantity, 2);
});
test("receipt returns no partial batch for missing dates, names, or invalid quantities", () => {
  for (const invalid of [{ expiry: "" }, { name: "" }, { qty: "-1" }, { expiry: "2027-02-30" }]) {
    const result = prepareReceiptRows([row, { ...row, ...invalid }], "test-user");
    assert.equal(result.valid.length, 0);
    assert.equal(Object.keys(result.errors).length, 1);
    assert.ok(result.errors[1]);
  }
});

test("manufacture MM/YY stays a manufacture date", () => {
  const result = parseOcrText("Cream\nMFG 03/26 EXP 03/28", today);
  assert.equal(result.manufacture_date, "2026-03-31");
  assert.equal(result.expiry_date, "2028-03-31");
});

test("OCR digit repair only touches date-like tokens", () => {
  const { repairDateDigits } = require("../lib/ocr-parser.ts");
  assert.equal(repairDateDigits("2O/O5/2O27"), "20/05/2027");
  assert.equal(repairDateDigits("COLD DRINK OIL"), "COLD DRINK OIL");
  assert.equal(repairDateDigits("Rol/Rol"), "Rol/Rol");
});

test("nutrition-panel mg and milk powder do not change the category", () => {
  assert.equal(parseOcrText("Oat biscuits\nSodium 120 mg\nEXP 06/2027", today).category, null);
  assert.equal(parseOcrText("Skimmed milk powder\nEXP 06/2027", today).category, null);
  assert.equal(parseOcrText("Paracetamol tablets\nEXP 06/2027", today).category, "medicine");
  assert.equal(parseOcrText("Face powder SPF 30\nEXP 06/2027", today).category, "cosmetics");
});

test("photos are scaled to fit the upload edge without distortion or enlarging", () => {
  const { fitWithin, MAX_IMAGE_EDGE, MAX_UPLOAD_BYTES } = require("../lib/image-resize.ts");
  assert.deepEqual(fitWithin(4000, 3000), { width: 1800, height: 1350, scaled: true });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1350, height: 1800, scaled: true });
  assert.deepEqual(fitWithin(1200, 900), { width: 1200, height: 900, scaled: false });
  assert.deepEqual(fitWithin(1800, 1800), { width: 1800, height: 1800, scaled: false });
  assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1, scaled: false });
  assert.equal(MAX_IMAGE_EDGE, 1800);
  // Hosts reject bodies around 4.5 MB; the client limit must stay below that.
  assert.ok(MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024);
});
