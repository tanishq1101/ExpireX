import { readImageForm } from "@/lib/request-body";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { geminiExtractReceipt } from "@/services/gemini";
import { rateLimit } from "@/lib/rate-limit";
import { todayKolkata } from "@/lib/dates";
import { estimateShelfLifeLocal } from "@/lib/shelf-life";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

// POST multipart { file } -> { items: ReceiptItem[] } extracted from a receipt photo.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!await rateLimit(`receipt:${userId}`, 10, 60_000))
    return NextResponse.json({ error: "Too many receipts — please slow down." }, { status: 429 });

  let file: File | null = null;
  try {
    const form = await readImageForm(request);
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
    const today = todayKolkata();
    const result = await geminiExtractReceipt(buffer.toString("base64"), file.type, today);
    return NextResponse.json({
      ...result,
      items: result.items.map((item) => {
        if (item.category === "medicine") return { ...item, expiry_date: null };
        // A confident shelf-life table match is more consistent than a per-line model guess.
        const local = estimateShelfLifeLocal(item.name, item.category ?? "food", today);
        return local.expiry_date && local.confidence === "high" ? { ...item, expiry_date: local.expiry_date } : item;
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn’t read the receipt. Try a clearer photo." },
      { status: 422 }
    );
  }
}
