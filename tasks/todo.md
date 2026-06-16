# Redesign v2: navy/light-blue reskin + splash screen + HUD scanner

Decisions: navy primary (#1D4ED8) + light-blue accent (#38BDF8); full HUD scanner with HONEST stats (real expiry days + real AI confidence + AI tips, no fake telemetry); splash once per browser session.

## Plan
- [ ] 1. Color reskin green→navy/light-blue: globals.css tokens (light+dark), aurora, blobs; Clerk colorPrimary; viewport themeColor; logo gradients
- [ ] 2. Emails: digest + reminders recolour to navy; redeploy weekly-digest
- [ ] 3. Splash screen (image 1): logo + wordmark + progress bar + TRACK.SAVE.SUSTAIN.; once/session (sessionStorage); reduced-motion safe; mount in root layout
- [ ] 4. AI tips: extend geminiEstimateShelfLife + shelfLifeSchema + /api/estimate to return short tips[]
- [ ] 5. HUD scanner (image 2): reticle brackets + scan-line + 'AI SYSTEM ACTIVE' status strip on BarcodeScanner
- [ ] 6. ProductAnalysisCard: name/image/EXP days/confidence/tips/"View full analysis" → confirm form; wire into BarcodeAdd
- [ ] 7. Hover/animation polish on landing + dashboard (glow lifts)
- [ ] 8. Build + deploy + verify; commit + push

## Review (DONE, live)
- **Navy/light-blue reskin**: globals.css tokens (light+dark) green→navy(#1D4ED8)/sky(#38BDF8); aurora + blobs reblued; Clerk colorPrimary #2563EB; viewport themeColor; landing gradients. `--success` stays green (status semantics). Verified live: navy tokens in CSS, only green hit is `--success`.
- **Splash** (`components/splash-screen.tsx`): logo (gradient square + dashed ring + X) + wordmark + animated progress bar + TRACK·SAVE·SUSTAIN; once per session (sessionStorage), reduced-motion safe, mounted in root layout over everything.
- **AI tips**: shelfLifeSchema + geminiEstimateShelfLife + /api/estimate now return `tips[]`.
- **HUD scanner**: barcode-scanner reticle = corner brackets + sweeping scan-line + "AI SYSTEM ACTIVE / EXPIRE X" status strip; new `scanline`/`pulse-ring` keyframes.
- **ProductAnalysisCard** (image 2): product image/icon, name, EXP: N DAYS (toned by urgency), honest "AI MATCH: HIGH/MED/LOW" confidence (no fake %/telemetry), 1-2 AI tips, dashed "View full analysis" → confirm form. Wired into barcode-add as an `analysis` step (identified products only; unknown barcodes skip to form).
- **Hover/animation**: `.hover-glow` (lift + navy glow + accent border) on scan-hub tiles, landing feature cards, how-it-works cards.
- **Emails**: digest recoloured navy + redeployed (weekly-digest v2). reminders h2 recoloured in source (cosmetic blue→blue, not redeployed).

Verify: build clean (type+lint) x2; deployed; `/` 200; navy tokens confirmed in live CSS; digest fn v2 ACTIVE. Visual QA blocked by sandbox preview networking — user to eyeball splash + scanner on mobile.

## Still pending (Wave 2, user said later)
Inventory depth: storage locations, opened-date/PAO, batch tracking, household sharing. Also PWA + web push.
