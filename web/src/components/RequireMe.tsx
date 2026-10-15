import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { signInHref, useMe, type Me } from "../lib/me.js";

/** Renders children for a signed-in user; sends everyone else to sign-in and back. */
export default function RequireMe({ children }: { children: (me: Me) => ReactNode }) {
  const { state } = useMe();
  const loc = useLocation();
  if (state.status === "loading") return <p>Loading</p>;
  if (state.status === "out") return <Navigate to={signInHref(loc.pathname, loc.search)} replace />;
  return <>{children(state.me)}</>;
}
