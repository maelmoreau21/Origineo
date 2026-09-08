import type { NextConfig } from 'next';
import path from 'path';

const useStandaloneOutput = process.platform !== 'win32';

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, '../../'),
  ...(useStandaloneOutput ? { output: 'standalone' as const } : {}),
  transpilePackages: ['@origineo/shared'],
  experimental: {
    optimizePackageImports: ['@xyflow/react'],
  },
};

export default nextConfig;
