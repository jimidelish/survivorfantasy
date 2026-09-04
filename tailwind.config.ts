import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        jungle: "#161F1A",
        surface: "#212B24",
        surface2: "#2A362E",
        ember: "#E2622A",
        gold: "#C9A24C",
        parchment: "#EDE6D2",
        muted: "#8FA294",
        rust: "#8F3B2E",
      },
      fontFamily: {
        display: ["var(--font-oswald)", "sans-serif"],
        body: ["var(--font-worksans)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
