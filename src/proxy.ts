import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE_NAME } from "@/lib/auth/constants";
import { isMockMode } from "@/lib/env";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/projects");
  const isAuthPage = pathname === "/login";

  if (isMockMode()) {
    const demoUser = request.cookies.get(DEMO_COOKIE_NAME)?.value;
    if (isProtected && !demoUser) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (isAuthPage && demoUser) {
      return NextResponse.redirect(new URL("/projects", request.url));
    }
    return NextResponse.next();
  }

  const { response, user } = await updateSupabaseSession(request);
  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/projects", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/projects/:path*", "/login"],
};
