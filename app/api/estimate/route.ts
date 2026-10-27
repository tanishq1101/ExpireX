import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiEstimateShelfLife } from "@/services/gemini";
import { estimateShelfLifeLocal } from "@/lib/shelf-life";
import { categorySchema, dateString } from "@/lib/validators";
import { rateLimit } from "@/lib/rate-limit";
import { todayKolkata } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/estimate { name, category, base_date? } -> { expiry_date, confidence, basis, source }
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`estimate:${userId}`, 30, 60_000))
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });

  let body: { name?: unknown; category?: unknown; base_date?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) return NextResponse.json({ error: "Product name must be 1–200 characters" }, { status: 400 });

  const cat = categorySchema.safeParse(body.category);
  const category = cat.success ? cat.data : "other";
  if (category === "medicine" || category === "documents") {
    return NextResponse.json({ expiry_date: null, confidence: null, basis: "Enter the date printed on the item.", source: "manual" });
  }

  const today = todayKolkata();
  let baseDate = today;
  if (body.base_date !== undefined) {
    const base = dateString.safeParse(body.base_date);
    if (!base.success) return NextResponse.json({ error: "Invalid base date" }, { status: 400 });
    baseDate = base.data;
  }

  // Primary: Gemini reasons about the product. Fallback: local heuristic table.
  // Only accept an estimate that is in the future (an estimate can never be "already expired").
  try {
    const ai = await geminiEstimateShelfLife(name, category, baseDate);
    if (ai.expiry_date && ai.expiry_date > today) return NextResponse.json({ ...ai, source: "ai" });
  } catch {
    // fall through to local
  }
  const local = estimateShelfLifeLocal(name, category, baseDate);
  return NextResponse.json({ ...local, source: "local" });
}
