import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // self-contained server bundle so the Docker runtime image needs no node_modules
  output: 'standalone',
};

export default nextConfig;
