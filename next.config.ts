import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "lucide-react"],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
