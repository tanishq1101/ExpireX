"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImageUp, Loader2, ScanLine, X, RotateCcw } from "lucide-react";
import type { Extraction } from "@/lib/validators";
import { Button } from "@/components/ui/button";

export function ScanUploader({
  onExtracted,
}: {
  onExtracted: (extraction: Extraction, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Release the camera when we leave the component or stop using it.
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }
  useEffect(() => () => stopCamera(), []);

  async function startCamera() {
    // getUserMedia needs a secure context (https or localhost).
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera needs a secure (https) connection. Upload a photo instead.");
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, // rear cam on phones, webcam on laptops
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      // Wait a tick for the <video> to mount, then attach the stream.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError")
        toast.error("Camera blocked. Allow camera access in your browser’s site settings.");
      else if (name === "NotFoundError") toast.error("No camera found. Upload a photo instead.");
      else toast.error("Couldn’t start the camera. Upload a photo instead.");
    } finally {
      setStarting(false);
    }
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
        const captured = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
        setFile(captured);
        setPreview(URL.createObjectURL(captured));
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
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function reset() {
    setFile(null);
    setPreview(null);
  }

  async function scan() {
    if (!file) return;
    setScanning(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/scan", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Scan failed");
      toast.success(`Scanned with ${json.source === "gemini" ? "Gemini" : "offline OCR"}`);
      onExtracted(json.extraction as Extraction, file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {/* Live camera */}
      {cameraOn && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} playsInline muted className="mx-auto max-h-72 w-full object-contain" />
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

      {/* Preview of a captured/uploaded image */}
      {!cameraOn && preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Selected product"
          className="mx-auto max-h-72 rounded-xl border border-border object-contain"
        />
      )}

      {/* Idle: choose camera or upload */}
      {!cameraOn && !preview && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={startCamera}
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
      )}

      {/* Actions for a captured/uploaded image */}
      {!cameraOn && preview && (
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={reset} disabled={scanning}>
            <RotateCcw className="h-4 w-4" /> Retake
          </Button>
          <Button className="flex-1" onClick={scan} disabled={scanning}>
            {scanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" /> Scan
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
