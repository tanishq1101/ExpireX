const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// server-only throws outside a React Server bundle; the code under test is plain server logic.
const original = Module._load;
const stubs = {
  "server-only": {},
  "@google/generative-ai": {
    SchemaType: { STRING: "string", NUMBER: "number", BOOLEAN: "boolean", OBJECT: "object" },
    GoogleGenerativeAI: class {
      getGenerativeModel({ model }) {
        return {
          generateContent: async () => {
            globalThis.__models.push(model);
            const outcome = globalThis.__outcomes[model];
            if (outcome instanceof Error) throw outcome;
            return { response: { text: () => outcome } };
          },
        };
      }
    },
  },
};
Module._load = function (id, ...rest) {
  return Object.hasOwn(stubs, id) ? stubs[id] : original.call(this, id, ...rest);
};
let lookupBarcode, gemini;
try {
  ({ lookupBarcode } = require("../services/openfoodfacts/index.ts"));
  process.env.GEMINI_API_KEY = "test";
  process.env.GEMINI_MODELS = "model-new,model-old";
  gemini = require("../services/gemini/index.ts");
} finally {
  Module._load = original;
}
const { retrieveShelfLife } = require("../lib/shelf-life.ts");

const offHit = { status: 1, product: { product_name: "Aloo Bhujia", brands: "Haldiram", categories_tags: ["en:snacks"] } };
const json = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

test("barcode lookup answers as soon as the richest source hits, without waiting for slow ones", async () => {
  const realFetch = global.fetch;
  global.fetch = (url) => {
    const u = String(url);
    if (u.includes("world.openfoodfacts.org")) return Promise.resolve(json(offHit));
    // Every other source hangs well past the test's patience.
    return new Promise((resolve) => setTimeout(() => resolve(json({ status: 0 })), 3000));
  };
  try {
    const started = Date.now();
    const result = await lookupBarcode("8901234500011");
    assert.equal(result.found, true);
    assert.equal(result.name, "Aloo Bhujia");
    assert.ok(Date.now() - started < 500, `took ${Date.now() - started} ms`);
  } finally {
    global.fetch = realFetch;
  }
});

test("unknown barcodes are remembered briefly so a rescan does not wait on every database again", async () => {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = () => { calls++; return Promise.resolve(json({ status: 0, items: [] })); };
  try {
    assert.equal((await lookupBarcode("8900000000009")).found, false);
    const after = calls;
    assert.equal((await lookupBarcode("8900000000009")).found, false);
    assert.equal(calls, after);
  } finally {
    global.fetch = realFetch;
  }
});

test("retrieval grounds AI estimates in the closest curated entries", () => {
  assert.equal(retrieveShelfLife("Haldiram Aloo Bhujia Namkeen", "food")[0].row[6], "Namkeen");
  assert.equal(retrieveShelfLife("Epigamia Greek Yogurt Blueberry", "food")[0].row[6], "Yogurt");
  // Category filter: a face cream never retrieves dairy cream.
  assert.ok(retrieveShelfLife("Nivea Face Cream", "cosmetics").every(({ row }) => row[1] === "cosmetics"));
  assert.deepEqual(retrieveShelfLife("", "food"), []);
});

test("a rate-limited or retired model falls through to the next model instead of failing the scan", async () => {
  globalThis.__models = [];
  globalThis.__outcomes = {
    "model-new": Object.assign(new Error("[429 Too Many Requests] quota"), { status: 429 }),
    "model-old": JSON.stringify({ product_name: "Milk", expiry_date: "2027-01-31", category: "food", item_type: "food" }),
  };
  const ex = await gemini.geminiExtractFromImage("AAAA", "image/jpeg", "2026-11-08");
  assert.deepEqual(globalThis.__models, ["model-new", "model-old"]);
  assert.equal(ex.expiry_date, "2027-01-31");

  globalThis.__models = [];
  globalThis.__outcomes["model-new"] = new Error("[404 Not Found] model is no longer available");
  await gemini.geminiExtractFromImage("AAAA", "image/jpeg", "2026-11-08");
  assert.deepEqual(globalThis.__models, ["model-new", "model-old"]);
});

test("messy database titles become readable names and the pack size moves to quantity", () => {
  const { composeProductName, parseSize } = require("../lib/product-name.ts");
  const title = "Nivea All in 1 Facewash 10X Whitening Effect With Cooling Menthol 50 Gram Tube (B00LC2V3F6)";
  assert.equal(composeProductName(title, "NiveaIndia"), "Nivea All in 1 Facewash 10X Whitening Effect With Cooling Menthol");
  assert.deepEqual(parseSize(title), { quantity: 50, unit: "g" });
  assert.equal(composeProductName("MAGGI 2-MINUTE MASALA NOODLES 70G", "Nestle"), "Nestle Maggi 2-Minute Masala Noodles");
  assert.equal(composeProductName("Lay's Potato Chips", "Lay's"), "Lay's Potato Chips");
  assert.equal(composeProductName("Amul Butter - 500 g (Pack of 2)", "Amul"), "Amul Butter");
  assert.deepEqual(parseSize("Dove Shampoo 1.5 L"), { quantity: 1.5, unit: "L" });
});
