"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import GitHubIcon from "./GitHubIcon";
import {
  SIGN_IN_URL,
  SIGN_OUT_URL,
  SessionUser,
  displayName,
  useSession,
} from "../lib/session";

function Avatar({ user, size }: { user: SessionUser; size: number }) {
  const [failed, setFailed] = useState(false);
  const name = displayName(user);

  if (failed || !user.user) {
    return (
      <span className="avatar avatar-fallback" style={{ width: size, height: size }}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // GitHub serves every user's avatar at github.com/<login>.png
    <img
      className="avatar"
      src={`https://github.com/${encodeURIComponent(user.user)}.png?size=${size * 2}`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}

function ProfileMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="profile" ref={ref}>
      <button
        className="profile-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar user={user} size={28} />
        <span className="profile-name">{displayName(user)}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-header">
            <Avatar user={user} size={44} />
            <div>
              <div className="profile-title">{displayName(user)}</div>
              <div className="profile-email">{user.email}</div>
            </div>
          </div>
          <dl className="profile-details">
            <dt>Username</dt>
            <dd>{user.user}</dd>
            <dt>Email</dt>
            <dd>{user.email}</dd>
            <dt>Signed in with</dt>
            <dd className="provider">
              <GitHubIcon size={14} /> GitHub
            </dd>
          </dl>
          <Link href="/todos" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            My todos
          </Link>
          <a href={SIGN_OUT_URL} className="menu-item danger" role="menuitem">
            Sign out
          </a>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const session = useSession();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">✓</span> Todo App
        </Link>

        <div className="nav-right">
          {session.status === "authenticated" && (
            <>
              <Link href="/todos" className="nav-link">
                My todos
              </Link>
              <ProfileMenu user={session.user} />
            </>
          )}
          {session.status === "anonymous" && (
            <a href={SIGN_IN_URL} className="btn btn-github btn-small">
              <GitHubIcon size={16} /> Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
