import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  // database driver and PDF renderer stay plain Node modules on the server
  serverExternalPackages: ["@prisma/adapter-pg", "pg", "@react-pdf/renderer", "bcryptjs"],
};

export default nextConfig;
