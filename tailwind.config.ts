import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#171719",
        muted: "#6f7480",
        line: "#e9ebf0",
        soft: "#f7f8fb"
      },
      boxShadow: {
        panel: "0 18px 60px rgba(17, 24, 39, 0.08)",
        lift: "0 22px 48px rgba(42, 48, 68, 0.12)"
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Microsoft YaHei",
          "sans-serif"
        ]
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};

export default config;
