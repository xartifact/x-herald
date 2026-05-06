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
  turbopack: {},
  env: {
    APP_VERSION: `${pkg.version}+${gitHash}`,
  },
  logging: {
    incomingRequests: false,
  },
};

export default nextConfig;
