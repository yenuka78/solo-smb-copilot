import nextPwa from "@ducanh2912/next-pwa";

const withPWA = nextPwa({
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

export default withPWA(nextConfig);
