"use client";

import Link from "next/link";

import GitHubIcon from "./components/GitHubIcon";
import { SIGN_IN_URL, displayName, useSession } from "./lib/session";

const FEATURES = [
  {
    title: "Sign in with GitHub",
    body: "No new password to remember. Authentication is handled by OAuth before a request ever reaches the app.",
  },
  {
    title: "Private to you",
    body: "Every todo is tied to your account. Other users never see your list.",
  },
  {
    title: "Simple by design",
    body: "Add, tick off and delete. Your list is saved in PostgreSQL and is there when you come back.",
  },
];

export default function Landing() {
  const session = useSession();

  return (
    <main className="landing">
      <section className="hero">
        <h1>Get things done, one todo at a time.</h1>
        <p className="lead">
          A small, focused todo list. Sign in with your GitHub account and start
          adding tasks in seconds.
        </p>

        <div className="hero-actions">
          {session.status === "authenticated" ? (
            <>
              <Link href="/todos" className="btn btn-primary">
                Open my todos →
              </Link>
              <p className="muted">Welcome back, {displayName(session.user)}.</p>
            </>
          ) : (
            <a
              href={SIGN_IN_URL}
              className="btn btn-github"
              aria-disabled={session.status === "loading"}
            >
              <GitHubIcon /> Sign in with GitHub
            </a>
          )}
        </div>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <h2>{f.title}</h2>
            <p>{f.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
