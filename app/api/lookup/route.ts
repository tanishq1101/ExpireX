import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { lookupBarcode } from "@/services/openfoodfacts";

export const runtime = "nodejs";

// GET /api/lookup?barcode=8901234567890  -> product identity (name/brand/category/image)
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return NextResponse.json({ error: "Provide a valid numeric barcode" }, { status: 400 });
  }

  const product = await lookupBarcode(barcode);
  return NextResponse.json(product);
}
