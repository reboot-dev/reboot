// To use server components in Next.js that use Reboot, you must include
// this option, serverExternalPackages: ["@reboot-dev/reboot"].
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@reboot-dev/reboot"],
};

export default nextConfig;
