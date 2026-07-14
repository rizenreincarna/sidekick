import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trustHostHeader: true,
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "http://127.0.0.1:81",
    "http://localhost:81",
    "http://21.0.17.240:3000",
    "http://21.0.17.240:81",
    "http://21.0.21.25:3000",
    "http://21.0.21.25:81",
  ],
};

export default nextConfig;
