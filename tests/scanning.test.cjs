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
  // Packing dates are never an expiry; relative shelf life is counted from them.
  ["PKG 01/06/2026", null],
  ["PKG 01/06/2026 Best before 6 months from packaging", "2026-12-01"],
  ["DOM 12/2025 EXP 11/2027", "2027-11-30"],
  ["PKD 05/26 Consume within 180 days from packing", "2026-11-27"],
  ["MFD 01/03/2026 Best before twelve months from manufacture", "2027-03-01"],
  // "Once opened" periods are not expiry dates.
  ["MFD 01/03/2026 Use within 3 months of opening", null],
  // Labels with a "DATE"/"END" word, and month-name with a 2-digit year.
  ["EXP DATE: 06/27", "2027-06-30"],
  ["BEST BEFORE END 08/27", "2027-08-31"],
  ["EXP JUN 27", "2027-06-30"],
  ["USE BY: SEP-26", "2026-09-30"],
  // Combined headings: earlier date is manufacture, later is expiry, whatever the order.
  ["MFD/EXP: 05.11.26 04.05.27", "2027-05-04"],
  ["EXP/MFG 04.05.27 05.11.26", "2027-05-04"],
  ["EXPORT QUALITY 12/05/2026", null],
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
  assert.deepEqual(fitWithin(4000, 3000), { width: 2400, height: 1800, scaled: true });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1800, height: 2400, scaled: true });
  assert.deepEqual(fitWithin(1200, 900), { width: 1200, height: 900, scaled: false });
  assert.deepEqual(fitWithin(2400, 2400), { width: 2400, height: 2400, scaled: false });
  assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1, scaled: false });
  assert.equal(MAX_IMAGE_EDGE, 2400);
  // Hosts reject bodies around 4.5 MB; the client limit must stay below that.
  assert.ok(MAX_UPLOAD_BYTES < 4.5 * 1024 * 1024);
});

for (const [label, expected] of [
  // More ways packs print an expiry.
  ["Use-By 15/06/2027", "2027-06-15"],
  ["BEST BY 15 JUN 2027", "2027-06-15"],
  ["EXP JUN 15, 2027", "2027-06-15"],
  ["EXP 2027/06/15", "2027-06-15"],
  ["EXP: 15062027", "2027-06-15"],
  ["EXP 20270615", "2027-06-15"],
  ["EXP 2027-06", "2027-06-30"],
  ["Consume before 15.06.27", "2027-06-15"],
  ["BBE 15 06 2027", "2027-06-15"],
  ["Valid until 06/2027", "2027-06-30"],
  // Stray numbers must still never become an expiry.
  ["Net wt 20270615", null],
  ["Tel 15062027", null],
]) {
  test(`OCR formats: ${label}`, () => assert.equal(parseOcrText(`Test product\n${label}`, today).expiry_date, expected));
}

test("shelf life relative to a printed manufacture date is computed, never guessed", () => {
  const rel = (t) => parseOcrText(`Biscuits\n${t}`, today).expiry_date;
  assert.equal(rel("MFG 15/01/2026\nBest before 6 months from the date of manufacture"), "2026-07-15");
  assert.equal(rel("PKD 31/08/2026 Use within 12 months of packing"), "2027-08-31");
  assert.equal(rel("MFG 31/08/2026 Best before 6 months from manufacture"), "2027-02-28");
  assert.equal(rel("MFD 10/10/2026 Use within 30 days of manufacture"), "2026-11-09");
  assert.equal(rel("Best before 6 months from the date of manufacture"), null);
});

test("long-form labels classify manufacture and expiry correctly", () => {
  const r = parseOcrText("Date of Manufacturing: 01/06/2026\nExpiry Date: 12/2027", today);
  assert.equal(r.manufacture_date, "2026-06-01");
  assert.equal(r.expiry_date, "2027-12-31");
});

test("product name skips pack boilerplate and keeps care/veg product names", () => {
  assert.equal(parseOcrText("FSSAI Lic No 1234\nMarketed by Acme Foods\nBaby Care Lotion\nEXP 06/2027", today).product_name, "Baby Care Lotion");
  assert.equal(parseOcrText("Ingredients: wheat, sugar\nVeg Hakka Noodles\nEXP 06/2027", today).product_name, "Veg Hakka Noodles");
});

test("verbatim date text is read deterministically", () => {
  const { parseDateText } = require("../lib/ocr-parser.ts");
  assert.equal(parseDateText("05/06/2027", "exp"), "2027-06-05");
  assert.equal(parseDateText("JUN 2027", "exp"), "2027-06-30");
  assert.equal(parseDateText("06/27", "exp"), "2027-06-30");
  assert.equal(parseDateText("20/O5/2O27", "exp"), "2027-05-20");
  assert.equal(parseDateText("6 months from mfg", "exp"), null);
  assert.equal(parseDateText("01/06/2026", "mfg"), "2026-06-01");
});

test("reconcile fixes a model day/month swap using the transcribed text", () => {
  const { reconcileExtraction } = require("../lib/reconcile-extraction.ts");
  const base = { product_name: "Milk", category: "food" };
  const r = reconcileExtraction({ ...base, expiry_date: "2027-05-06", expiry_text: "05/06/2027" }, today);
  assert.equal(r.expiry_date, "2027-06-05");
  // Text the parser cannot read (relative shelf life) leaves the model's computed date alone.
  const k = reconcileExtraction({ ...base, expiry_date: "2027-07-15", expiry_text: "6 months from mfg" }, today);
  assert.equal(k.expiry_date, "2027-07-15");
  // With a manufacture date, the relative period is computed here instead of trusting the model.
  const rel = reconcileExtraction({ ...base, expiry_date: "2027-01-15", manufacture_date: "2026-06-01", expiry_text: "Best before 9 months from packaging" }, today);
  assert.equal(rel.expiry_date, "2027-03-01");
  // A packing date copied into the expiry is thrown out so the user is asked.
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2026-06-01", manufacture_date: "2026-06-01" }, today).expiry_date, null);
});

test("reconcile drops dates that cannot be right instead of guessing", () => {
  const { reconcileExtraction } = require("../lib/reconcile-extraction.ts");
  const base = { product_name: "Milk", category: "food" };
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2026-01-01", manufacture_date: "2026-06-01" }, today).expiry_date, null);
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2099-01-01" }, today).expiry_date, null);
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2027-01-01", manufacture_date: "2030-01-01" }, today).manufacture_date, null);
  // Month-only manufacture dates resolve to month end and are still valid this month.
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2027-05-31", manufacture_date: "2026-10-31" }, today).manufacture_date, "2026-10-31");
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2027-01-01", manufacture_date: "2030-01-01" }, today).expiry_date, "2027-01-01");
  // An already-expired but plausible date is kept: the app flags it as expired.
  assert.equal(reconcileExtraction({ ...base, expiry_date: "2025-01-10" }, today).expiry_date, "2025-01-10");
});

test("reconcile prefers a labelled date in OCR text over the model's reading of it", () => {
  const { reconcileExtraction } = require("../lib/reconcile-extraction.ts");
  const r = reconcileExtraction({ product_name: "Milk", category: "food", expiry_date: "2027-05-06" }, today, "Milk\nEXP 05/06/2027");
  assert.equal(r.expiry_date, "2027-06-05");
});
