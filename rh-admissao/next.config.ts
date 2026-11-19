import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O token da admissão nunca deve vazar no Referer para outros sites.
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Content-Type-Options", value: "nosniff" }] }];
  },
};

export default nextConfig;
