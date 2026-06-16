"use client";

import { useEffect } from "react";

/** Registers the service worker so the app is installable and can receive push. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failure is non-fatal */
      });
    }
  }, []);
  return null;
}
