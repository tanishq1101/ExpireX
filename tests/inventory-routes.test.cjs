const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { createClient } = require("@supabase/supabase-js");
const dates = require("../lib/dates.ts");
const inventory = require("../lib/inventory.ts");
const csv = require("../lib/csv.ts");
const validators = require("../lib/validators.ts");
const shelfLife = require("../lib/shelf-life.ts");

const state = { userId: "test-user", limited: false, count: 0, fail: false, calls: [], estimates: 0, receipt: [] };
const client = createClient("https://example.supabase.co", "test-anon-key", {
  accessToken: async () => "test-session-token",
  global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    state.calls.push({ url, headers: new Headers(init.headers) });
    if (state.fail) return new Response(JSON.stringify({ message: "Database unavailable" }), { status: 500, headers: { "Content-Type": "application/json" } });
    const offset = Number(url.searchParams.get("offset"));
    const length = Math.min(500, Math.max(0, state.count - offset));
    const data = Array.from({ length }, (_, i) => ({ id: String(i + offset), name: `Item ${i + offset}`, category: "food", expiry_date: "2026-11-01" }));
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Content-Range": `${offset}-${offset + length - 1}/${state.count}` } });
  } },
});
const deps = {
  "@clerk/nextjs/server": { auth: async () => ({ userId: state.userId }) },
  "@/services/supabase/server": { createClient: async () => client },
  "@/lib/dates": { ...dates, todayKolkata: () => "2026-10-27" },
  "@/lib/inventory": inventory,
  "@/lib/csv": csv,
  "@/lib/validators": validators,
  "@/lib/shelf-life": shelfLife,
  "@/lib/rate-limit": { rateLimit: () => !state.limited },
  "@/services/gemini": {
    geminiEstimateShelfLife: async () => { state.estimates++; return { expiry_date: "2027-01-01", confidence: "low", basis: "Test estimate" }; },
    geminiExtractReceipt: async () => state.receipt,
  },
};
const original = Module._load;
Module._load = function (id, ...rest) { return Object.hasOwn(deps, id) ? deps[id] : original.call(this, id, ...rest); };
let exportGET, estimatePOST, receiptPOST;
try {
  ({ GET: exportGET } = require("../app/api/items/export/route.ts"));
  ({ POST: estimatePOST } = require("../app/api/estimate/route.ts"));
  ({ POST: receiptPOST } = require("../app/api/receipt/route.ts"));
} finally { Module._load = original; }

const exportRequest = () => new Request("http://localhost/api/items/export?q=Milk&location=Fridge&sort=name");
const estimateRequest = (body) => new Request("http://localhost/api/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("export authorization, batching, filtering, cache policy and failure states", async (t) => {
  await t.test("anonymous and throttled requests never query the database", async () => {
    state.calls = [];
    state.userId = null;
    assert.equal((await exportGET(exportRequest())).status, 401);
    state.userId = "test-user";
    state.limited = true;
    assert.equal((await exportGET(exportRequest())).status, 429);
    state.limited = false;
    assert.equal(state.calls.length, 0);
  });
  await t.test("all filtered results are exported across batches using the session token", async () => {
    state.count = 501;
    state.calls = [];
    const response = await exportGET(exportRequest());
    assert.equal(response.status, 200);
    assert.equal(state.calls.length, 2);
    assert.equal(state.calls[0].headers.get("Authorization"), "Bearer test-session-token");
    assert.equal(state.calls[0].url.searchParams.get("name"), "ilike.%Milk%");
    assert.equal(state.calls[1].url.searchParams.get("offset"), "500");
    assert.equal(state.calls[1].url.searchParams.get("location"), "eq.Fridge");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.match(response.headers.get("Content-Disposition"), /expirex-items-2026-10-27.csv/);
    const body = await response.text();
    assert.equal(body.split("\r\n").length, 502);
    assert.ok(body.includes("Item 500"));
  });
  await t.test("large exports fail explicitly instead of silently dropping rows", async () => {
    state.count = 5001;
    assert.equal((await exportGET(exportRequest())).status, 413);
  });
  await t.test("database errors do not return a successful CSV", async () => {
    state.fail = true;
    assert.equal((await exportGET(exportRequest())).status, 500);
    state.fail = false;
  });
});

test("expiry estimate validation and medicine guard", async (t) => {
  await t.test("medicine and documents never call the model", async () => {
    state.estimates = 0;
    for (const category of ["medicine", "documents"]) {
      const response = await estimatePOST(estimateRequest({ name: "Product", category }));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).expiry_date, null);
    }
    assert.equal(state.estimates, 0);
  });
  await t.test("rejects malformed payloads and impossible base dates", async () => {
    for (const body of [null, [], { name: "x".repeat(201) }, { name: "Milk", category: "food", base_date: "2026-02-30" }]) {
      assert.equal((await estimatePOST(estimateRequest(body))).status, 400);
    }
    assert.equal(state.estimates, 0);
  });
  await t.test("normal food estimates still work", async () => {
    const response = await estimatePOST(estimateRequest({ name: "Milk", category: "food" }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).source, "ai");
    assert.equal(state.estimates, 1);
  });
});

test("receipt extraction leaves medicine expiry blank for printed-date confirmation", async () => {
  state.receipt = [{ name: "Tablets", category: "medicine", expiry_date: "2028-10-27", quantity: 1 }, { name: "Milk", category: "food", expiry_date: "2026-11-03", quantity: 1 }];
  const body = new FormData();
  body.append("file", new File([new Uint8Array(10)], "receipt.jpg", { type: "image/jpeg" }));
  const response = await receiptPOST(new Request("http://localhost/api/receipt", { method: "POST", body }));
  const { items } = await response.json();
  assert.equal(items[0].expiry_date, null);
  assert.equal(items[1].expiry_date, "2026-11-03");
});
