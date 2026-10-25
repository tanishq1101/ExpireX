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
  disabled = false,
}: {
  onPick: (file: File) => void;
  onClear: () => void;
  hint?: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequest = useRef(0);

  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [facing, setFacing] = useState<Facing>("environment");

  function stopCamera() {
    cameraRequest.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }
  useEffect(() => () => {
    cameraRequest.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOn, facing]);

  async function startCamera(facingMode: Facing = facing) {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera needs a secure (https) connection. Upload a photo instead.");
      return;
    }
    if (disabled) return;
    const request = ++cameraRequest.current;
    setStarting(true);
    setCameraOn(false);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      if (request !== cameraRequest.current) return;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError")
        toast.error("Camera blocked. Allow camera access in your browser’s settings.");
      else if (name === "NotFoundError") toast.error("No camera found. Upload a photo instead.");
      else toast.error("Couldn’t start the camera. Upload a photo instead.");
    } finally {
      if (request === cameraRequest.current) setStarting(false);
    }
  }

  function flipCamera() {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    startCamera(next);
  }

  function capture() {
    const video = videoRef.current;
    if (disabled || !video || !video.videoWidth) return;
    const request = cameraRequest.current;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2000 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob || request !== cameraRequest.current) return;
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
    if (!f || disabled) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image.");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error("This photo is too large. Choose one smaller than 8 MB.");
      return;
    }
    setPreview(URL.createObjectURL(f));
    onPick(f);
  }

  function reset() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    onClear();
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          pickFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {cameraOn && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="mx-auto max-h-72 w-full object-contain" />
            <button
              type="button"
              onClick={flipCamera}
              disabled={starting || disabled}
              aria-label="Flip camera"
              className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
            >
              <SwitchCamera className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={stopCamera}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button className="flex-1" onClick={capture} disabled={starting || disabled}>
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
          <Button variant="outline" className="w-full" onClick={reset} disabled={disabled}>
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
              disabled={starting || disabled}
              className="glass flex flex-col items-center gap-2 p-8 text-muted transition hover:border-primary/40 disabled:opacity-60"
            >
              {starting ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-7 w-7" />}
              <span className="text-sm">Use camera</span>
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={starting || disabled}
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
