"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AppUser, Season, LOCAL_STORAGE_KEY } from "@/lib/types";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`text-xs tracking-wide transition-colors sm:text-sm ${
        active ? "text-ember" : "text-parchment/80 hover:text-parchment"
      }`}
    >
      {label}
    </Link>
  );
}

export default function NavBar() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [season, setSeason] = useState<Season | null>(null);

  useEffect(() => {
    function syncUser() {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) {
        setUser(null);
        return;
      }
      try {
        setUser(JSON.parse(raw));
      } catch {
        // ignore malformed storage
      }
    }

    syncUser();
    fetch("/api/seasons/current")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSeason)
      .catch(() => {});

    // Picks up a same-tab user switch from the login page (see its
    // selectUser) — localStorage's own "storage" event doesn't fire here.
    window.addEventListener("survivor-fantasy-user-changed", syncUser);
    return () => window.removeEventListener("survivor-fantasy-user-changed", syncUser);
  }, []);

  return (
    <header className="border-b border-surface2 bg-surface/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-semibold text-parchment sm:text-xl">
          Survivor Fantasy Draft{season ? ` — Season ${season.number}` : ""}
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-6">
          <NavLink href="/" label="Home" />
          <NavLink href="/picks" label="My Picks" />
          <NavLink href="/scores" label="Scores" />
          <NavLink href="/scoring" label="Scoring Guide" />
          {user && <NavLink href="/events" label="Episode Events" />}
          {user?.is_admin && <NavLink href="/admin" label="Admin" />}
          <Link
            href="/login"
            className="rounded-full border border-gold/50 px-3 py-1 text-xs text-gold hover:bg-gold/10"
          >
            {user ? user.name : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
