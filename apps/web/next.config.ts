import type { NextConfig } from 'next';

const useStandaloneOutput = process.platform !== 'win32';

const nextConfig: NextConfig = {
  ...(useStandaloneOutput ? { output: 'standalone' as const } : {}),
  transpilePackages: ['@origineo/shared'],
  experimental: {
    optimizePackageImports: ['@xyflow/react'],
  },
};

export default nextConfig;
