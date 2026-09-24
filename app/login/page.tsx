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
  const [pendingAdmin, setPendingAdmin] = useState<AppUser | null>(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => setUsers(data))
      .finally(() => setLoading(false));
  }, []);

  function selectUser(user: AppUser) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
    // localStorage's own "storage" event only fires in OTHER tabs, not this
    // one, so components that already read it on mount (like NavBar) won't
    // notice a same-tab change on their own — tell them explicitly.
    window.dispatchEvent(new Event("survivor-fantasy-user-changed"));
    router.push("/");
    router.refresh();
  }

  function handlePick(user: AppUser) {
    if (user.is_admin) {
      setPendingAdmin(user);
      setAdminPassword("");
      setPasswordError(null);
    } else {
      selectUser(user);
    }
  }

  async function submitAdminPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingAdmin) return;
    setVerifying(true);
    setPasswordError(null);
    const res = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminPassword }),
    });
    const data = await res.json();
    setVerifying(false);
    if (!res.ok || !data.ok) {
      setPasswordError(data.error || "Incorrect password.");
      return;
    }
    selectUser(pendingAdmin);
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

      {pendingAdmin ? (
        <form onSubmit={submitAdminPassword} className="mt-6 space-y-3">
          <p className="text-sm text-muted">
            <span className="text-gold">{pendingAdmin.name}</span> is an admin account. Enter the
            admin password to continue.
          </p>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            autoFocus
            placeholder="Admin password"
            className="w-full rounded-md border border-surface2 bg-surface px-4 py-3 text-parchment placeholder:text-muted focus:border-gold"
          />
          {passwordError && <p className="text-sm text-rust">{passwordError}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={verifying || !adminPassword}
              className="rounded-md bg-ember px-5 py-3 font-medium text-jungle transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {verifying ? "Checking…" : "Unlock"}
            </button>
            <button
              type="button"
              onClick={() => setPendingAdmin(null)}
              className="rounded-md border border-surface2 px-5 py-3 text-sm text-muted hover:border-gold/50"
            >
              Back
            </button>
          </div>
        </form>
      ) : (
        <>
          {loading ? (
            <p className="mt-6 text-sm text-muted">Loading players…</p>
          ) : (
            <ul className="mt-6 space-y-2">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    onClick={() => handlePick(u)}
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
        </>
      )}
    </div>
  );
}
