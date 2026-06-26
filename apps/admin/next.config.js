/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the shared workspace package (TS source) through Next.
  transpilePackages: ["@lynia/shared"],
};

module.exports = nextConfig;
