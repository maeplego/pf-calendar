import { NextRequest, NextResponse } from "next/server";

import { clearOn, readRequestCookie } from "../../lib/oidc/cookies";
import { oidcEnabled, publicOrigin } from "../../lib/oidc/env";

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  if (!oidcEnabled()) {
    return NextResponse.redirect(new URL("/host", origin));
  }
  const res = NextResponse.redirect(new URL("/host", origin));
  for (const name of ["rp_access", "rp_id", "rp_refresh", "rp_state", "rp_nonce", "rp_verifier"]) {
    if (readRequestCookie(req, name)) {
      clearOn(res, name);
    }
  }
  return res;
}
