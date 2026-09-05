/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Every API route always reflects live Supabase data — never let the
        // browser or Vercel's CDN cache these, on top of the per-route
        // `export const dynamic = "force-dynamic"` (which stops Next.js's
        // own data cache, a different layer from HTTP caching).
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
