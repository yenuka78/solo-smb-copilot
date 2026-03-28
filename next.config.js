// @ts-check
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
  fallbacks: {
    document: "/~offline",
  },
});

/** @type {import("next").NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

module.exports = withPWA(nextConfig);
