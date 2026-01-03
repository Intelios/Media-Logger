/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#5E35B1", 
        secondary: "#1E88E5",
        surface: "#1E1E1E",
      }
    },
  },
  plugins: [],
}