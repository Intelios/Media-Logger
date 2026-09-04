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
        surface: {
          DEFAULT: "var(--color-surface, #1E1E1E)",
          hover: "var(--color-surface-hover, #2A2A2A)",
        },
        background: {
          DEFAULT: "var(--color-background, #121212)",
          alt: "var(--color-background-alt, #0A0A0A)",
        },
        "text": "var(--color-text, #FFFFFF)",
        "text-muted": "var(--color-text-muted, #9CA3AF)",
        "text-subtle": "var(--color-text-subtle, #6B7280)",
        "border-theme": "var(--color-border, rgba(255, 255, 255, 0.1))",
        "border-subtle": "var(--color-border-subtle, rgba(255, 255, 255, 0.05))",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        // Review surfaces only. Nothing else in the app sets a serif, so
        // overriding Tailwind's default `serif` key collides with nothing.
        serif: ['"Instrument Serif"', "Georgia", "serif"],
      }
    },
  },
  plugins: [],
}
