"use client";

import { useEffect, useState } from "react";

// Shape returned by oauth2-proxy's /oauth2/userinfo endpoint.
export type SessionUser = {
  user: string;
  email: string;
  preferredUsername?: string;
};

export type Session =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };

export const SIGN_IN_URL = "/oauth2/start?rd=/todos";
export const SIGN_OUT_URL = "/oauth2/sign_out?rd=/";

export function useSession(): Session {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/oauth2/userinfo", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as SessionUser) : null))
      .catch(() => null)
      .then((user) => {
        if (cancelled) return;
        setSession(user ? { status: "authenticated", user } : { status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}

export function displayName(user: SessionUser): string {
  return user.preferredUsername || user.user || user.email;
}
