import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@origineo/shared'],
  experimental: {
    optimizePackageImports: ['@xyflow/react'],
  },
};

export default nextConfig;
