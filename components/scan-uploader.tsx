"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanLine } from "lucide-react";
import type { Extraction } from "@/lib/validators";
import { fetchJson } from "@/lib/fetch-json";
import { ScanRejected } from "@/components/scan-rejected";
import { ImageCapture } from "@/components/image-capture";
import { Button } from "@/components/ui/button";

type ScanResponse = { extraction?: Extraction; source?: string; rejected?: boolean; detected?: string | null };

/** Mobile networks drop uploads; one automatic retry saves the user from re-taking the photo. */
async function scanWithRetry(body: FormData): Promise<ScanResponse> {
  const started = Date.now();
  try {
    return await fetchJson<ScanResponse>("/api/scan", { method: "POST", body, signal: AbortSignal.timeout(65_000) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    // Retry a dropped connection, not a slow scan that already used most of its time.
    if (!/network/i.test(message) || Date.now() - started > 20_000) throw err;
    return fetchJson<ScanResponse>("/api/scan", { method: "POST", body, signal: AbortSignal.timeout(65_000) });
  }
}

export function ScanUploader({ onExtracted }: {
  onExtracted: (extraction: Extraction, file: File) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const [rejected, setRejected] = useState<{ detected: string | null } | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function scan(target: File) {
    if (busy.current) return;
    busy.current = true;
    setScanning(true);
    try {
      const body = new FormData();
      body.append("file", target);
      const json = await scanWithRetry(body);
      // The user may have left this screen while the photo was being read.
      if (!alive.current) return;
      if (json.rejected) {
        setRejected({ detected: json.detected ?? null });
        return;
      }
      if (!json.extraction) throw new Error("Couldn’t read the image.");
      toast.success("Photo read — check the details before saving");
      onExtracted(json.extraction, target);
    } catch (err) {
      if (alive.current) toast.error(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      busy.current = false;
      if (alive.current) setScanning(false);
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
        onPick={(picked) => {
          setFile(picked);
          // Reading starts as soon as the photo is taken or chosen — no extra tap.
          void scan(picked);
        }}
        onClear={() => setFile(null)}
        disabled={scanning}
        hint="Fill the frame with the product name and the printed expiry date. Good light helps. You’ll check everything before saving."
      />
      {file && (
        <Button className="w-full" onClick={() => scan(file)} disabled={scanning}>
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
          {scanning ? "Reading the label…" : "Read label again"}
        </Button>
      )}
      {scanning && <p role="status" className="text-center text-sm text-muted">This usually takes a few seconds. Keep this screen open.</p>}
    </div>
  );
}
