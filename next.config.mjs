/** @type {import('next').NextConfig} */
const nextConfig = {
  // Tesseract is a Node-only WASM package; keep it out of the bundle trace.
  serverExternalPackages: ["tesseract.js", "@tesseract.js-data/eng"],
  outputFileTracingIncludes: {
    "/api/scan": [
      "./node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz",
      "./node_modules/tesseract.js/src/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
