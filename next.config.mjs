/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel deployment optimizations
  experimental: {
    serverComponentsExternalPackages: ['@anthropic-ai/sdk'],
  },
};

export default nextConfig;
