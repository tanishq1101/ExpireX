const test = require("node:test");
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { dateString, itemFormSchema } = require("../lib/validators.ts");
const { addDays, daysBetween, todayKolkata, formatDate } = require("../lib/dates.ts");
const { getStatus, countdown } = require("../lib/status.ts");
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
  assert.equal(estimateShelfLifeLocal("Milk", "food", "2026-10-27").expiry_date, "2026-10-30");
  // Medicine still gets "once opened" guidance even though its expiry is never inferred.
  assert.equal(estimateShelfLifeLocal("Refresh Tears Eye Drops", "medicine", "2026-10-27").open_days, 28);
});

test("shelf-life table picks what the product is, not its flavour", () => {
  const label = (name, category) => estimateShelfLifeLocal(name, category, "2026-10-27").label;
  for (const [name, category, expected] of [
    ["Lay's Classic Salted Potato Chips 52g", "food", "Chips / crisps"],
    ["Tomato Ketchup", "food", "Ketchup / sauce"],
    ["Apple Juice 1L", "food", "Packaged juice"],
    ["Egg Noodles", "food", "Dry pasta / noodles"],
    ["Cadbury Dairy Milk Silk", "food", "Chocolate"],
    ["Chocolate Milk", "food", "Flavoured milk drink"],
    ["Britannia Good Day Butter Cookies", "food", "Biscuits / cookies"],
    ["Maggi 2-Minute Noodles Masala", "food", "Instant noodles"],
    ["Nivea Soft Moisturising Cream", "cosmetics", "Face cream / moisturiser"],
    ["Amul Fresh Cream", "food", "Dairy cream"],
    ["Frozen Green Peas", "food", "Frozen vegetables"],
  ]) assert.equal(label(name, category), expected, name);
  assert.equal(estimateShelfLifeLocal("Unknown gadget food", "food", "2026-10-27").expiry_date, null);
});

test("shelf-life follows storage and never leaves raw meat at room temperature", () => {
  assert.equal(estimateShelfLifeLocal("Chicken breast", "food", "2026-10-27", { storage: "pantry" }).expiry_date, "2026-10-27");
  assert.equal(estimateShelfLifeLocal("Bread", "food", "2026-10-27", { storage: "freezer" }).expiry_date, "2027-01-25");
  assert.equal(estimateShelfLifeLocal("Curd", "food", "2026-10-27", { storage: "freezer" }).storage, "fridge");
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

test("list countdown reads naturally across the whole range", () => {
  const today = "2026-10-27";
  const at = (days) => countdown(today, addDays(today, days));
  assert.deepEqual(at(-3), { value: "3d", caption: "overdue", status: "expired" });
  assert.deepEqual(at(-90), { value: "3mo", caption: "overdue", status: "expired" });
  assert.deepEqual(at(0), { value: "Today", caption: "", status: "expiring" });
  assert.deepEqual(at(1), { value: "Tomorrow", caption: "", status: "expiring" });
  assert.deepEqual(at(5), { value: "5", caption: "days left", status: "expiring" });
  assert.deepEqual(at(21), { value: "3", caption: "weeks left", status: "expiring" });
  assert.deepEqual(at(31), { value: "4", caption: "weeks left", status: "ok" });
  assert.deepEqual(at(120), { value: "4", caption: "months left", status: "ok" });
  assert.deepEqual(at(800), { value: "2", caption: "years left", status: "ok" });
});

test("dates format identically on server and browser", () => {
  assert.equal(formatDate("2027-03-12"), "12 Mar 2027");
  assert.equal(formatDate("2028-02-29"), "29 Feb 2028");
  assert.equal(formatDate("not-a-date"), "not-a-date");
});

test("urgent view includes overdue items: only an upper bound, never a lower one", async () => {
  assert.equal(inventoryFilters({ status: "urgent" }).status, "urgent");
  let captured = "";
  const client = createClient("https://example.supabase.co", "test-anon-key", {
    global: { fetch: async (input) => {
      captured = String(input);
      return new Response("[]", { headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" } });
    } },
  });
  await inventoryQuery(client, { status: "urgent" }, "2026-10-27").range(0, 23);
  // Overdue rows must be returned: a `gte` bound here would hide expired items again.
  assert.deepEqual(new URL(captured).searchParams.getAll("effective_expiry"), ["lte.2026-11-03"]);
});
