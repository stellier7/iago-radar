import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stops `next dev` from generating AGENTS.md / CLAUDE.md in the repo root.
  agentRules: false,
};

export default nextConfig;
