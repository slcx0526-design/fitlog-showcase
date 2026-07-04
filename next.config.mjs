import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  devIndicators: false,
  // 纯前端 MVP：lint 不阻断构建，类型检查保留（构建会真实校验 TS）
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
