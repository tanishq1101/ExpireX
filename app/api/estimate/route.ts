import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiEstimateShelfLife } from "@/services/gemini";
import { estimateShelfLifeLocal } from "@/lib/shelf-life";
import { categorySchema } from "@/lib/validators";
import { todayKolkata } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/estimate { name, category, base_date? } -> { expiry_date, confidence, basis, source }
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: unknown; category?: unknown; base_date?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Product name is required" }, { status: 400 });

  const cat = categorySchema.safeParse(body.category);
  const category = cat.success ? cat.data : "other";

  const today = todayKolkata();
  let baseDate = today;
  if (typeof body.base_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.base_date)) {
    baseDate = body.base_date;
  }

  // Primary: Gemini reasons about the product. Fallback: local heuristic table.
  try {
    const ai = await geminiEstimateShelfLife(name, category, baseDate);
    if (ai.expiry_date) return NextResponse.json({ ...ai, source: "ai" });
  } catch {
    // fall through to local
  }
  const local = estimateShelfLifeLocal(name, category, baseDate);
  return NextResponse.json({ ...local, source: "local" });
}
