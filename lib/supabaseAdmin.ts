import { createClient } from "@supabase/supabase-js";

// This client uses the service_role key and must never be imported into
// client components ("use client" files) or exposed to the browser.
// It is only ever used inside app/api/**/route.ts files, which run on the server.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  // Next.js patches the global `fetch` to cache requests by default (a
  // separate layer from route-level `dynamic = "force-dynamic"`, which only
  // stops the route's own output from being cached — it does NOT stop
  // fetch() calls made inside the route, and that cache persists across
  // deployments). Force every Supabase request to skip it, so this client
  // always reads live data.
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});

export default supabaseAdmin;
