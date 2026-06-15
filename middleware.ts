import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Landing + Clerk pages are public. /api routes self-protect (return 401), so the middleware
// doesn't redirect them. Everything else requires a signed-in Clerk user.
const isPublic = createRouteMatcher(["/", "/login(.*)", "/sign-up(.*)", "/api(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
