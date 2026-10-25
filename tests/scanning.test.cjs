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
