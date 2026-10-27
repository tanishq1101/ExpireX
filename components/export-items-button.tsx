"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function ExportItemsButton() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`/api/items/export?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? "Export failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "expirex-items.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn’t export items.");
    } finally {
      setBusy(false);
    }
  }
  return <Button variant="outline" size="sm" disabled={busy} onClick={download}>
    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
  </Button>;
}
