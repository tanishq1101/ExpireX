import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0B0B0B",
        foreground: "#EDEDED",
        muted: "#9CA3AF",
        border: "rgba(255,255,255,0.08)",
        input: "rgba(255,255,255,0.06)",
        ring: "#2D7DFF",
        primary: { DEFAULT: "#2D7DFF", foreground: "#FFFFFF" },
        accent: { DEFAULT: "#22D3EE", foreground: "#04121A" },
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
      },
      borderRadius: { xl: "0.9rem", "2xl": "1.25rem" },
      keyframes: {
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: { "gradient-pan": "gradient-pan 18s ease infinite" },
    },
  },
  plugins: [],
};

export default config;
