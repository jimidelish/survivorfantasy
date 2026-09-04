"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppUser, LOCAL_STORAGE_KEY } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(data))
      .finally(() => setLoading(false));
  }, []);

  function selectUser(user: AppUser) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
    router.push("/");
    router.refresh();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }
    selectUser(data);
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-semibold">Who's playing?</h1>
      <p className="mt-2 text-sm text-muted">
        This league uses simple name-based sign-in for a trusted group of friends —
        no password required. Pick your name, or add it if this is your first visit.
      </p>

      <div className="mt-8 rope-divider" />

      {loading ? (
        <p className="mt-6 text-sm text-muted">Loading players…</p>
      ) : (
        <ul className="mt-6 space-y-2">
          {users.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => selectUser(u)}
                className="w-full rounded-md border border-surface2 bg-surface px-4 py-3 text-left text-parchment transition-colors hover:border-gold/60"
              >
                {u.name}
                {u.is_admin && <span className="ml-2 text-xs text-gold">admin</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 rope-divider" />

      <form onSubmit={createUser} className="mt-6 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add your name"
          className="flex-1 rounded-md border border-surface2 bg-surface px-4 py-3 text-parchment placeholder:text-muted focus:border-gold"
        />
        <button
          type="submit"
          className="rounded-md bg-ember px-5 py-3 font-medium text-jungle transition-opacity hover:opacity-90"
        >
          Join
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-rust">{error}</p>}
    </div>
  );
}
