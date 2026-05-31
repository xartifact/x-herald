import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));

let gitHash = process.env.GIT_HASH?.slice(0, 7) || '';
if (!gitHash) {
  try {
    gitHash = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    gitHash = 'unknown';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  transpilePackages: ['@x-llm-gateway/ui'],
  env: {
    APP_VERSION: `${pkg.version}+${gitHash}`,
  },
  logging: {
    incomingRequests: false,
  },
  turbopack: {},
  // Use webpack instead of Turbopack for better Node.js built-in module support
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        perf_hooks: false,
        worker_threads: false,
        'node:fs': false,
        'node:net': false,
        'node:tls': false,
        'node:perf_hooks': false,
        'node:worker_threads': false,
      };
    }
    return config;
  },
};

export default nextConfig;
