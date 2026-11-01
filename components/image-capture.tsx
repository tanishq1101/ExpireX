"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImageUp, Loader2, RotateCcw, X, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fitWithin, MAX_ORIGINAL_BYTES, MAX_UPLOAD_BYTES, prepareImage } from "@/lib/image-resize";

type Facing = "environment" | "user";

/**
 * Reusable camera + upload capture. Calls onPick(file) when an image is ready and
 * onClear() when the user retakes. Photos are shrunk in the browser first, so large
 * gallery pictures upload quickly and never hit server size limits.
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
  const [preparing, setPreparing] = useState(false);
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
      toast.error("Camera needs a secure (https) connection. Choose a photo instead.");
      return;
    }
    if (disabled) return;
    const request = ++cameraRequest.current;
    setStarting(true);
    setCameraOn(false);
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Ask for a sharp stream: the browser default is often 640x480, too soft to read printed dates.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (request !== cameraRequest.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      try {
        await stream.getVideoTracks()[0]?.applyConstraints({
          advanced: [{ focusMode: "continuous" } as unknown as MediaTrackConstraintSet],
        });
      } catch {
        /* autofocus control is not available everywhere */
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      if (request !== cameraRequest.current) return;
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError")
        toast.error("Camera blocked. Allow camera access in your browser’s settings.");
      else if (name === "NotFoundError") toast.error("No camera found. Choose a photo instead.");
      else toast.error("Couldn’t start the camera. Choose a photo instead.");
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
    const size = fitWithin(video.videoWidth, video.videoHeight);
    canvas.width = size.width;
    canvas.height = size.height;
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

  async function pickFile(f: File | null) {
    if (!f || disabled) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Please choose an image.");
      return;
    }
    if (f.size > MAX_ORIGINAL_BYTES) {
      toast.error("This photo is too large. Choose one smaller than 25 MB.");
      return;
    }
    setPreparing(true);
    const ready = await prepareImage(f);
    setPreparing(false);
    if (ready.size > MAX_UPLOAD_BYTES) {
      toast.error("This photo is too large to upload. Try a different one.");
      return;
    }
    setPreview(URL.createObjectURL(ready));
    onPick(ready);
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
          void pickFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {cameraOn && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="mx-auto max-h-[60vh] w-full object-contain" />
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
            className="mx-auto max-h-[50vh] rounded-xl border border-border object-contain"
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
              disabled={starting || disabled || preparing}
              className="glass flex min-h-32 flex-col items-center justify-center gap-2 p-5 text-foreground transition active:scale-[0.98] hover:border-primary/40 disabled:opacity-60"
            >
              {starting ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <Camera className="h-7 w-7 text-primary" />}
              <span className="text-sm font-medium">Open camera</span>
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={starting || disabled || preparing}
              className="glass flex min-h-32 flex-col items-center justify-center gap-2 p-5 text-foreground transition active:scale-[0.98] hover:border-primary/40 disabled:opacity-60"
            >
              {preparing ? <Loader2 className="h-7 w-7 animate-spin text-primary" /> : <ImageUp className="h-7 w-7 text-primary" />}
              <span className="text-sm font-medium">{preparing ? "Preparing…" : "Choose photo"}</span>
            </button>
          </div>
          {hint && <p className="text-center text-xs text-muted">{hint}</p>}
        </>
      )}
    </div>
  );
}
