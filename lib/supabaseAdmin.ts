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
});

export default supabaseAdmin;
