import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiExtractReceipt } from "@/services/gemini";
import { rateLimit } from "@/lib/rate-limit";
import { todayKolkata } from "@/lib/dates";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

// POST multipart { file } -> { items: ReceiptItem[] } extracted from a receipt photo.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`receipt:${userId}`, 10, 60_000))
    return NextResponse.json({ error: "Too many receipts — please slow down." }, { status: 429 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!file) return NextResponse.json({ error: "No image provided" }, { status: 400 });
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "Image must be under 8MB" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const items = await geminiExtractReceipt(buffer.toString("base64"), file.type, todayKolkata());
    return NextResponse.json({ items: items.map((item) => item.category === "medicine" ? { ...item, expiry_date: null } : item) });
  } catch {
    return NextResponse.json(
      { error: "Couldn’t read the receipt. Try a clearer photo." },
      { status: 422 }
    );
  }
}
