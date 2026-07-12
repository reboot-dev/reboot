/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@reboot-dev/reboot"],
  },
};

export default nextConfig;
