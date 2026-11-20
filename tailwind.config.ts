import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#334E6B",
          navyDark: "#24384E",
          navyLight: "#E8EEF4",
          cyan: "#3DC2CA",
          cyanDark: "#0F766E",
          cyanLight: "#F0FDFA",
          canvas: "#F5F5F5",
          rose: "#FC5086",
          roseDark: "#9F1239",
          roseLight: "#FFF1F2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

