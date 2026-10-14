import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Para GitHub Pages: sitio estático puro, sin server-side runtime.
  output: "export",
  trailingSlash: true,
  // GitHub Pages sirve bajo /<repo>/, no bajo raíz.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "/sqli-demo",
  images: { unoptimized: true },
};

export default nextConfig;