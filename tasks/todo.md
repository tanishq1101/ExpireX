# Landing redesign + light/dark theme + green rebrand

## Plan
- [ ] 1. Theme tokens: convert hardcoded colors to CSS variables (light `:root` + `.dark`), green palette
- [ ] 2. tailwind.config: map colors to `rgb(var(--x)/<alpha>)`, add `surface` token + animation keyframes
- [ ] 3. globals.css: theme-aware `.glass` / `.glass-input`, green animated aurora + grid + blobs
- [ ] 4. ThemeProvider (no-flash script, localStorage, system pref) + useTheme
- [ ] 5. ThemeToggle button (sun/moon, animated, accessible)
- [ ] 6. Fix `white/*` surfaces in button / skeleton / stat-card / app-nav so light mode works
- [ ] 7. Rich animated Background (green, perf-gated)
- [ ] 8. LandingNav (sticky, glass, mobile hamburger menu + toggle, mobile-aligned)
- [ ] 9. Redesign landing.tsx (hero + preview, stats, features, how-it-works, FAQ/description, CTA, footer)
- [ ] 10. Wire layout.tsx (provider, no-flash, themed Toaster, adaptive themeColor)
- [ ] 11. Verify: `npm run build` clean + manual check both themes / mobile

## Review
All 11 steps done. Shipped:
- **Theme system**: CSS-variable tokens (light `:root` + `.dark`) in `app/globals.css`; Tailwind
  colors remapped to `rgb(var(--x)/<alpha>)` so every existing `/15`, `/40`, `/90` opacity utility
  stays theme-aware. New `surface` token replaces the dark-only `white/[0.0x]` surfaces in
  button / skeleton / stat-card / app-nav so light mode renders correctly.
- **No-flash light/dark**: `themeInitScript` in `<head>` sets the class before paint;
  `ThemeProvider` persists choice in localStorage + follows OS until the user picks; `ThemeToggle`
  (animated sun/moon) added to the landing nav and the in-app header; `ThemedToaster` follows theme;
  adaptive `viewport.themeColor`.
- **Green rebrand**: emerald→teal palette across primary/accent/aurora/blobs.
- **Landing**: new `LandingNav` (sticky glass bar, mobile hamburger sheet, scroll-locked) +
  full redesign — animated hero with live "Your shelf" preview card, stats strip, feature grid,
  3-step how-it-works with connector line, FAQ accordion (`<details>`, no JS), gradient CTA, footer.
- **Background**: richer perf-gated green aurora + dotted grid + floating blobs (auto-calmed on
  mobile / reduced-motion).

Verification: `npm run build` clean (twice); live prod HTML at https://expire-x-three.vercel.app
confirmed serving redesigned content + theme script + green aurora (HTTP 200). NOTE: the sandboxed
preview browser had no network route to the dev server (every nav → chrome-error), so visual QA was
done via SSR HTML + build, not screenshots — user should eyeball both themes on their phone.

Bug caught in review: CTA decorative blob used `.bg-blob` (position:fixed) → wouldn't clip to the
card; switched to a contained `absolute … blur-3xl` element.
