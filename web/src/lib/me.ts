import { useCallback, useEffect, useState } from "react";

export interface Me {
  uid: number;
  name: string;
  onboarded: boolean;
  isAdmin: boolean;
  handle: string | null;
}

export type MeState = { status: "loading" } | { status: "out" } | { status: "in"; me: Me };

/** Link to the sign-in page that returns here afterwards (root needs no next). */
export function signInHref(pathname: string, search: string): string {
  const here = pathname + search;
  return here === "/" ? "/signin" : `/signin?next=${encodeURIComponent(here)}`;
}

/** Fetches /api/me once; `signOut` clears the session cookie then flips to signed out. */
export function useMe(): { state: MeState; signOut: () => Promise<void> } {
  const [state, setState] = useState<MeState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetch("/api/me", { headers: { accept: "application/json" } })
      .then(async (res) => (res.ok ? ((await res.json()) as Me) : null))
      .then(
        (me) => live && setState(me ? { status: "in", me } : { status: "out" }),
        () => live && setState({ status: "out" }),
      );
    return () => {
      live = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    } finally {
      setState({ status: "out" });
    }
  }, []);

  return { state, signOut };
}
