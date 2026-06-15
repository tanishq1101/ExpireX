"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImageUp, Loader2, RotateCcw, X, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";

type Facing = "environment" | "user";

/**
 * Reusable camera + upload capture. Calls onPick(file) when an image is ready and
 * onClear() when the user retakes. Parent renders its own primary action below.
 */
export function ImageCapture({
  onPick,
  onClear,
  hint,
}: {
  onPick: (file: File) => void;
  onClear: () => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }
  useEffect(() => () => stopCamera(), []);

  async function startCamera(facingMode: Facing = facing) {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera needs a secure (https) connection. Upload a photo instead.");
      return;
    }
    setStarting(true);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError")
        toast.error("Camera blocked. Allow camera access in your browser’s settings.");
      else if (name === "NotFoundError") toast.error("No camera found. Upload a photo instead.");
      else toast.error("Couldn’t start the camera. Upload a photo instead.");
    } finally {
      setStarting(false);
    }
  }

  function flipCamera() {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    startCamera(next);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const captured = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        setPreview(URL.createObjectURL(captured));
        onPick(captured);
        stopCamera();
      },
      "image/jpeg",
      0.9
    );
  }

  function pickFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image.");
      return;
    }
    setPreview(URL.createObjectURL(f));
    onPick(f);
  }

  function reset() {
    setPreview(null);
    onClear();
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {cameraOn && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="mx-auto max-h-72 w-full object-contain" />
            <button
              type="button"
              onClick={flipCamera}
              aria-label="Flip camera"
              className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={stopCamera}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button className="flex-1" onClick={capture}>
              <Camera className="h-4 w-4" /> Capture
            </Button>
          </div>
        </div>
      )}

      {!cameraOn && preview && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Selected"
            className="mx-auto max-h-72 rounded-xl border border-border object-contain"
          />
          <Button variant="outline" className="w-full" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Retake
          </Button>
        </div>
      )}

      {!cameraOn && !preview && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => startCamera()}
              disabled={starting}
              className="glass flex flex-col items-center gap-2 p-8 text-muted transition hover:border-primary/40 disabled:opacity-60"
            >
              {starting ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
              <span className="text-sm">Use camera</span>
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="glass flex flex-col items-center gap-2 p-8 text-muted transition hover:border-primary/40"
            >
              <ImageUp className="h-7 w-7" />
              <span className="text-sm">Upload photo</span>
            </button>
          </div>
          {hint && <p className="text-center text-xs text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}
