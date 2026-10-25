"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanLine } from "lucide-react";
import type { Extraction } from "@/lib/validators";
import { fetchJson } from "@/lib/fetch-json";
import { ScanRejected } from "@/components/scan-rejected";
import { ImageCapture } from "@/components/image-capture";
import { Button } from "@/components/ui/button";

export function ScanUploader({ onExtracted }: {
  onExtracted: (extraction: Extraction, file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [rejected, setRejected] = useState<{ detected: string | null } | null>(null);

  async function scan() {
    if (!file) return;
    setScanning(true);
    try {
      const body = new FormData();
      body.append("file", file);
      // Respect the user's OCR-engine preference (Settings): "ai" (default) or "tesseract".
      let engine = "ai";
      try {
        if (localStorage.getItem("ocrEngine") === "tesseract") engine = "tesseract";
      } catch {
        /* ignore */
      }
      const json = await fetchJson<{
        extraction?: Extraction;
        source?: string;
        rejected?: boolean;
        detected?: string | null;
      }>(`/api/scan?engine=${engine}`, { method: "POST", body });
      if (json.rejected) {
        setRejected({ detected: json.detected ?? null });
        return;
      }
      if (!json.extraction) throw new Error("Couldn’t read the image.");
      toast.success("Photo read — check the details before saving");
      onExtracted(json.extraction, file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  if (rejected) {
    return <ScanRejected detected={rejected.detected} onRetry={() => {
      setRejected(null);
      setFile(null);
    }} />;
  }

  return (
    <div className="space-y-4" aria-busy={scanning}>
      <ImageCapture
        onPick={setFile}
        onClear={() => setFile(null)}
        disabled={scanning}
        hint="Take a clear close-up of the product name and printed expiry date. You’ll check the details before saving."
      />
      {file && (
        <Button className="w-full" onClick={scan} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          {scanning ? "Reading photo…" : "Read label"}
        </Button>
      )}
      {scanning && <p role="status" className="text-center text-sm text-muted">This may take a little while. Keep this screen open.</p>}
    </div>
  );
}
