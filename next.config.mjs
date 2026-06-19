/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the Neon driver and `ws` OUT of webpack's server bundle. Bundling `ws`
  // mangles its internal frame masking ("t.mask is not a function") and breaks
  // the WebSocket path used by interactive transactions. Externalized, they are
  // require()d intact at runtime.
  experimental: {
    serverComponentsExternalPackages: ["@neondatabase/serverless", "ws"],
  },
};

export default nextConfig;
