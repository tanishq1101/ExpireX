"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, ScanBarcode, X, Keyboard, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Facing = "environment" | "user";

// Minimal type for the native Barcode Detection API (not in the TS DOM lib yet).
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorInstance = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorInstance;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

export function BarcodeScanner({
  onDetected,
  onCancel,
}: {
  onDetected: (code: string) => void;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const doneRef = useRef(false);

  const [starting, setStarting] = useState(true);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [usingNative, setUsingNative] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");
  const [code, setCode] = useState("");

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function finish(value: string) {
    if (doneRef.current) return;
    doneRef.current = true;
    if ("vibrate" in navigator) navigator.vibrate?.(60);
    cleanup();
    onDetected(value.trim());
  }

  useEffect(() => {
    let cancelled = false;

    async function startNative(Detector: BarcodeDetectorCtor) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      setUsingNative(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const detector = new Detector({ formats: FORMATS });
      const tick = async () => {
        if (doneRef.current || cancelled) return;
        try {
          if (video.readyState >= 2) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) return finish(codes[0].rawValue);
          }
        } catch {
          /* transient decode error — keep scanning */
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    async function startZxing() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (cancelled) return;
      const reader = new BrowserMultiFormatReader();
      zxingControlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result) => {
          if (result) finish(result.getText());
        }
      );
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Camera needs a secure (https) connection.");
        setCameraFailed(true);
        setShowManual(true);
        setStarting(false);
        return;
      }
      try {
        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
          .BarcodeDetector;
        if (Detector) await startNative(Detector);
        else await startZxing();
        if (!cancelled) setStarting(false);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "";
        if (name === "NotAllowedError")
          toast.error("Camera blocked. Allow camera access in your browser’s settings.");
        else if (name === "NotFoundError") toast.error("No camera found. Enter the code manually.");
        else toast.error("Couldn’t start the scanner. Enter the code manually.");
        setCameraFailed(true);
        setShowManual(true);
        setStarting(false);
      }
    }

    start();
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6,14}$/.test(code.trim())) {
      toast.error("Enter a valid numeric barcode (6–14 digits).");
      return;
    }
    finish(code);
  }

  // Flip is supported on the native path (we own the stream). zxing manages its own.
  async function flipCamera() {
    if (!usingNative || !videoRef.current) return;
    const next: Facing = facing === "environment" ? "user" : "environment";
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
      setFacing(next);
    } catch {
      toast.error("Couldn't switch camera.");
    }
  }

  return (
    <div className="space-y-3">
      {!cameraFailed && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={videoRef} playsInline muted className="mx-auto max-h-72 w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-28 w-4/5 rounded-lg border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
              <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-primary" />
            </div>
          </div>
          {usingNative && !starting && (
            <button
              type="button"
              onClick={flipCamera}
              aria-label="Flip camera"
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          )}
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
            </div>
          )}
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/80">
            Point at the product barcode
          </p>
        </div>
      )}

      {showManual && (
        <form onSubmit={submitManual} className="space-y-2">
          <Input
            inputMode="numeric"
            placeholder="Enter barcode digits"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus={cameraFailed}
          />
          <Button type="submit" className="w-full">
            <ScanBarcode className="h-4 w-4" /> Look up product
          </Button>
        </form>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            <X className="h-4 w-4" /> Cancel
          </Button>
        )}
        {!cameraFailed && (
          <Button variant="ghost" className="flex-1" onClick={() => setShowManual((m) => !m)}>
            <Keyboard className="h-4 w-4" /> {showManual ? "Hide manual" : "Enter manually"}
          </Button>
        )}
      </div>
    </div>
  );
}
