import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` ouvert depuis le réseau local (IP du Pi) : rechargement à chaud autorisé
  allowedDevOrigins: ["192.168.0.35"],
};

export default nextConfig;
