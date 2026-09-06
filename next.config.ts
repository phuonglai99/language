import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'mammoth', 'xlsx'],
};

export default nextConfig;
