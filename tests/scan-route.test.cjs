const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { parseOcrText } = require("../lib/ocr-parser.ts");

// Exercise the real handler with controlled authentication/OCR adapters.
// These tests verify request handling, not recognition by the external AI service.
const state = { userId: "test-user", limited: false, failAI: false, ocr: "", raw: null };
const deps = {
  "@clerk/nextjs/server": { auth: async () => ({ userId: state.userId }) },
  "@/services/gemini": {
    geminiExtractFromImage: async () => {
      if (state.failAI) throw new Error("AI unavailable");
      return state.raw;
    },
    geminiExtract: async () => { throw new Error("AI unavailable"); },
  },
  "@/services/tesseract": {
    tesseractExtractText: async () => state.ocr,
    parseOcrText,
  },
  "@/lib/rate-limit": { rateLimit: () => !state.limited },
  "@/lib/dates": { todayKolkata: () => "2026-10-25" },
};
const original = Module._load;
Module._load = function (id, ...rest) {
  return Object.hasOwn(deps, id) ? deps[id] : original.call(this, id, ...rest);
};
let POST;
try { ({ POST } = require("../app/api/scan/route.ts")); }
finally { Module._load = original; }

function request(type = "image/jpeg", size = 10) {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(size)], "label.jpg", { type }));
  return new Request("http://localhost/api/scan", { method: "POST", body });
}
const raw = { product_name: "Milk", expiry_date: "2026-11-01", category: "food", item_type: "food" };

test("label scan request and fallback behavior", async (t) => {
  await t.test("rejects anonymous requests", async () => {
    state.userId = null;
    assert.equal((await POST(request())).status, 401);
    state.userId = "test-user";
  });
  await t.test("enforces rate limits", async () => {
    state.limited = true;
    assert.equal((await POST(request())).status, 429);
    state.limited = false;
  });
  await t.test("rejects non-images and oversized uploads", async () => {
    assert.equal((await POST(request("text/plain"))).status, 400);
    assert.equal((await POST(request("image/jpeg", 8 * 1024 * 1024 + 1))).status, 400);
  });
  await t.test("preserves printed expiry dates", async () => {
    state.raw = raw;
    const response = await POST(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).extraction.expiry_date, raw.expiry_date);
  });
  await t.test("does not turn estimates or visual freshness into printed expiry", async () => {
    state.raw = { ...raw, estimated: true, freshness: "fresh" };
    const json = await (await POST(request())).json();
    assert.equal(json.extraction.expiry_date, null);
    assert.equal(json.extraction.freshness, null);
  });
  await t.test("unreadable date stays blank while preserving a readable name", async () => {
    state.raw = { ...raw, expiry_date: null };
    const json = await (await POST(request())).json();
    assert.equal(json.extraction.expiry_date, null);
    assert.equal(json.extraction.product_name, "Milk");
  });
  await t.test("reports empty OCR results as a retryable error", async () => {
    state.failAI = true;
    state.ocr = "";
    assert.equal((await POST(request())).status, 422);
  });
  await t.test("AI outage uses the actual local date parser", async () => {
    state.ocr = "Milk\nMFG 01/10/2026 EXP 03/11/2026";
    const json = await (await POST(request())).json();
    assert.equal(json.source, "tesseract");
    assert.equal(json.extraction.expiry_date, "2026-11-03");
    state.failAI = false;
  });
});
