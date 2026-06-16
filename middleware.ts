import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Landing + Clerk pages are public. /api routes self-protect (return 401), so the middleware
// doesn't redirect them. Everything else requires a signed-in Clerk user.
const isPublic = createRouteMatcher([
  "/",
  "/login(.*)",
  "/sign-up(.*)",
  "/privacy",
  "/terms",
  "/contact",
  "/api(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: [
    // Skip Next internals, the service worker, manifest, and static asset extensions.
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp|ico|js|json|webmanifest|txt)$).*)",
  ],
};
