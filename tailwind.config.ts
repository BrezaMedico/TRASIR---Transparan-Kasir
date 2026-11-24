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
          navy: "#202531",
          navyDark: "#151922",
          navyLight: "#EBEBEB",
          cyan: "#01DAD7",
          cyanDark: "#202531",
          cyanLight: "#E6FBFB",
          canvas: "#EBEBEB",
          rose: "#FF2A63",
          roseDark: "#D41448",
          roseLight: "#FFF0F4",
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

