/** @type {import('tailwindcss').Config} */
module.exports = {
  corePlugins: {
    preflight: false
  },
  content: [
    "./*.html",
    "./*.js",
    "./supabase/functions/**/*.{ts,js}"
  ],
  theme: {
    extend: {
      colors: {
        centralis: {
          page: "var(--page)",
          surface: "var(--surface)",
          ink: "var(--ink)",
          muted: "var(--muted)",
          line: "var(--line)",
          accent: "var(--accent)",
          strong: "var(--accent-strong)",
          field: "var(--field)"
        }
      },
      fontFamily: {
        display: [
          "\"Space Grotesk\"",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "\"Segoe UI\"",
          "sans-serif"
        ]
      },
      borderRadius: {
        centralis: "8px"
      }
    }
  },
  plugins: []
};
