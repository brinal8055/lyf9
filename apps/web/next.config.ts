import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lyf9/shared"],
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
