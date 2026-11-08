import { readJson } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiEstimateShelfLife } from "@/services/gemini";
import { estimateShelfLifeLocal, storageFromLocation, type Storage } from "@/lib/shelf-life";
import { categorySchema, dateString } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";
import { addDays, todayKolkata } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 30;

const STORAGES: Storage[] = ["pantry", "fridge", "freezer"];
// No unopened consumable we track keeps longer than this; anything later is a model mistake.
const MAX_ESTIMATE_DAYS = 5 * 365;

// POST /api/estimate { name, category, base_date?, storage?, location?, hints? }
//   -> { expiry_date, confidence, basis, tips, storage, open_days, source }
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await rateLimit(`estimate:${userId}`, 30, 60_000))
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  let body: { name?: unknown; category?: unknown; base_date?: unknown; storage?: unknown; location?: unknown; hints?: unknown };
  try {
    body = await readJson(request) as typeof body;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "Product name must be 1–200 characters" }, { status: 400 });

  const cat = categorySchema.safeParse(body.category);
  const category = cat.success ? cat.data : "other";

  const today = todayKolkata();
  let baseDate = today;
  if (body.base_date !== undefined && body.base_date !== null && body.base_date !== "") {
    const base = dateString.safeParse(body.base_date);
    if (!base.success) return NextResponse.json({ error: "Invalid base date" }, { status: 400 });
    // A manufacture date in the future is a typo; measure from today instead.
    baseDate = base.data > today ? today : base.data;
  }
  const storage: Storage | null =
    typeof body.storage === "string" && STORAGES.includes(body.storage as Storage)
      ? (body.storage as Storage)
      : storageFromLocation(typeof body.location === "string" ? body.location.slice(0, 60) : null, name);
  const hints = Array.isArray(body.hints)
    ? body.hints.filter((h): h is string => typeof h === "string").map((h) => h.slice(0, 80)).slice(0, 30)
    : [];

  const local = estimateShelfLifeLocal(name, category, baseDate, { storage, hints });
  if (category === "medicine" || category === "documents") {
    return NextResponse.json({ ...local, expiry_date: null, confidence: null, basis: "Enter the date printed on the item.", source: "manual" });
  }

  // A confident dataset match is consistent and instant; the model is consulted for products
  // the dataset can't place (and its answer is bounded so a bad guess can't slip through).
  if (local.expiry_date && local.confidence === "high") return NextResponse.json({ ...local, source: "guide" });

  try {
    const ai = await geminiEstimateShelfLife(name, category, baseDate, {
      storage,
      reference: local.expiry_date && local.basis ? local.basis : null,
    });
    if (ai.expiry_date && ai.expiry_date >= baseDate && ai.expiry_date <= addDays(baseDate, MAX_ESTIMATE_DAYS)) {
      return NextResponse.json({
        ...ai,
        storage,
        open_days: local.open_days ?? null,
        tips: ai.tips?.length ? ai.tips : local.tips ?? null,
        source: "ai",
      });
    }
  } catch {
    // fall through to the dataset
  }
  return NextResponse.json({ ...local, source: "local" });
}
