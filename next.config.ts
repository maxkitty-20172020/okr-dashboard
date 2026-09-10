import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["okr.zungyunai.top"],
    },
  },
};

export default nextConfig;
