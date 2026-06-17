import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/services/supabase/admin";
import { z } from "zod";
import { categorySchema } from "@/lib/validators";

export const runtime = "nodejs";

const bodySchema = z.object({
  barcode: z.string().min(6).max(64),
  name: z.string().min(1).max(200),
  brand: z.string().max(100).nullable().optional(),
  size: z.string().max(60).nullable().optional(),
  category: categorySchema.nullable().optional(),
  image_url: z.string().url().nullable().optional(),
});

// POST /api/catalog/confirm
// Called after a user saves an item that has a barcode.
// Atomically upserts the barcode_catalog: inserts on first confirmation,
// increments confirmed_count on subsequent ones.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { barcode, name, brand, size, category, image_url } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.rpc("confirm_barcode_scan", {
    p_barcode:   barcode,
    p_name:      name,
    p_brand:     brand ?? null,
    p_size:      size ?? null,
    p_category:  category ?? null,
    p_image_url: image_url ?? null,
  });

  if (error) {
    console.error("confirm_barcode_scan error:", error.message);
    return NextResponse.json({ error: "Catalog update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
