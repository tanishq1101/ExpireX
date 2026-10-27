const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { dateString, itemFormSchema } = require("../lib/validators.ts");
const { addDays, daysBetween, todayKolkata } = require("../lib/dates.ts");
const { getStatus } = require("../lib/status.ts");
const { estimateShelfLifeLocal } = require("../lib/shelf-life.ts");
const { csvCell, inventoryCsv } = require("../lib/csv.ts");
const { inventoryFilters, inventoryQuery } = require("../lib/inventory.ts");

const base = { name: "Milk", category: "food", expiry_date: "2026-10-28" };

test("calendar validation rejects normalized impossible dates and accepts leap days", () => {
  for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "invalid"]) assert.equal(dateString.safeParse(date).success, false, date);
  for (const date of ["2024-02-29", "2026-01-31", "2026-12-31"]) assert.equal(dateString.safeParse(date).success, true, date);
});

test("blank quantities remain unknown; zero stays zero; invalid quantities fail", () => {
  for (const quantity of ["", "  ", null]) assert.equal(itemFormSchema.parse({ ...base, quantity }).quantity, null);
  assert.equal(itemFormSchema.parse({ ...base, quantity: "0" }).quantity, 0);
  assert.equal(itemFormSchema.parse({ ...base, quantity: "1.5" }).quantity, 1.5);
  for (const quantity of [-1, Infinity, "unknown"]) assert.equal(itemFormSchema.safeParse({ ...base, quantity }).success, false);
});

test("manufacture dates after expiry fail validation and location survives save payload", () => {
  assert.equal(itemFormSchema.safeParse({ ...base, manufacture_date: "2026-10-29" }).success, false);
  assert.equal(itemFormSchema.parse({ ...base, location: " Pantry " }).location, "Pantry");
});

test("Kolkata day boundaries and status windows agree", () => {
  assert.equal(todayKolkata(new Date("2026-10-27T18:29:59Z")), "2026-10-27");
  assert.equal(todayKolkata(new Date("2026-10-27T18:30:00Z")), "2026-10-28");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(getStatus("2026-10-27", "2026-10-26"), "expired");
  assert.equal(getStatus("2026-10-27", "2026-10-27"), "expiring");
  assert.equal(getStatus("2026-10-27", addDays("2026-10-27", 30)), "expiring");
  assert.equal(getStatus("2026-10-27", addDays("2026-10-27", 31)), "ok");
});

test("medicine and document dates are never inferred from keywords", () => {
  assert.equal(estimateShelfLifeLocal("Vitamin tablets", "medicine", "2026-10-27").expiry_date, null);
  assert.equal(estimateShelfLifeLocal("Milk permit", "documents", "2026-10-27").expiry_date, null);
  assert.equal(estimateShelfLifeLocal("Milk", "food", "2026-10-27").expiry_date, "2026-11-03");
});

test("CSV quoting preserves multiline text and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('Milk, "whole"\n1 L'), '"Milk, ""whole""\n1 L"');
  for (const formula of ["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1+1", "\tformula"]) assert.equal(csvCell(formula).startsWith('"\''), true, formula);
  assert.equal(csvCell(null), '""');
  const csv = inventoryCsv([{ name: "Crème", category: "food", notes: "=HYPERLINK(1)" }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("Crème"));
  assert.ok(csv.includes("\r\n"));
  assert.ok(!csv.includes("user_id"));
});

test("untrusted filters default safely and page sizes are bounded", () => {
  const result = inventoryFilters({ category: "invalid", sort: "__proto__", status: "anything", page: "-2", q: " Milk " });
  assert.equal(result.sort, "expiry");
  assert.equal(result.category, undefined);
  assert.equal(result.status, undefined);
  assert.equal(result.page, 1);
  assert.equal(result.q, "Milk");
  assert.equal(inventoryFilters({ page: "999999999999999999" }).page, 1);
  assert.equal(inventoryFilters({ q: ["Milk", "Bread"] }).q, "Bread");
  assert.equal(inventoryFilters({ page: ["1", "2"] }).page, 2);
});

test("inventory requests combine literal search, expiry window, location and stable sort", async () => {
  let captured = "";
  const client = createClient("https://example.supabase.co", "test-anon-key", {
    global: { fetch: async (input) => {
      captured = String(input);
      return new Response("[]", { headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } });
    } },
  });
  await inventoryQuery(client, { q: "50%_milk", status: "expiring", category: "food", location: "Fridge", sort: "name" }, "2026-10-27").range(24, 47);
  const url = new URL(captured);
  assert.equal(url.searchParams.get("name"), "ilike.%50\\%\\_milk%");
  assert.deepEqual(url.searchParams.getAll("effective_expiry"), ["gte.2026-10-27", "lte.2026-11-26"]);
  assert.equal(url.searchParams.get("category"), "eq.food");
  assert.equal(url.searchParams.get("location"), "eq.Fridge");
  assert.equal(url.searchParams.get("order"), "name.asc,id.asc");
  assert.equal(url.searchParams.get("offset"), "24");
  assert.equal(url.searchParams.get("limit"), "24");
});
