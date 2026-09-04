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
      className={`text-sm tracking-wide transition-colors ${
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
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        // ignore malformed storage
      }
    }
    fetch("/api/seasons/current")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSeason)
      .catch(() => {});
  }, []);

  return (
    <header className="border-b border-surface2 bg-surface/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <Link href="/" className="font-display text-xl font-semibold text-parchment">
          Survivor Fantasy Draft{season ? ` — Season ${season.number}` : ""}
        </Link>
        <nav className="flex items-center gap-6">
          <NavLink href="/" label="Home" />
          <NavLink href="/picks" label="My Picks" />
          <NavLink href="/scores" label="Scores" />
          {user && <NavLink href="/events" label="Enter Events" />}
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
