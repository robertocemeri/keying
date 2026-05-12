/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0a0a0c",
          900: "#111114",
          800: "#1a1a1f",
          700: "#26262d",
          600: "#3a3a44",
          500: "#5a5a68",
          400: "#8a8a98",
          300: "#b6b6c2",
          200: "#d8d8df",
          100: "#ececf0",
        },
        accent: {
          400: "#a3e635",
          500: "#84cc16",
          600: "#65a30d",
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
