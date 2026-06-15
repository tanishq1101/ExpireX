/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tesseract is a Node-only WASM package; keep it out of the bundle trace.
  serverExternalPackages: ["tesseract.js"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
