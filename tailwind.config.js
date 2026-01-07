/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary, #5E35B1)",
        secondary: "var(--color-secondary, #1E88E5)",
        surface: "var(--color-surface, #1E1E1E)",
      }
    },
  },
  plugins: [],
}