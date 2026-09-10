/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // "Organic" design system: Caprasimo display headings + Figtree body.
        sans: ['"Figtree"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Caprasimo"', "Georgia", "ui-serif", "serif"],
      },
      colors: {
        // Warm, organic identity — cream paper, terracotta primary, sage accent.
        paper: "#f5ead8",
        surface: "#ebddc5",
        ink: "#201e1d",
        muted: "#6f6a63",
        line: "#d8ccb4",
        // Terracotta (primary) — ramp 100→900 from the handoff.
        brand: {
          50: "#fff7f1",
          100: "#fff2eb",
          200: "#f6d9c6",
          300: "#eab99b",
          400: "#d9915f",
          500: "#c67139",
          600: "#a95a2b",
          700: "#8a4a24",
          800: "#5f3318",
          900: "#402310",
        },
        // Sage (secondary / positive) — ramp 100→900 from the handoff.
        sage: {
          50: "#f6fbec",
          100: "#f0fae1",
          200: "#dce8c4",
          300: "#bccb98",
          400: "#9aae74",
          500: "#7a8a5e",
          600: "#63744a",
          700: "#4c5a39",
          800: "#39442b",
          900: "#272e1b",
        },
        // Warm brick red for errors / destructive actions (harmonizes with terracotta).
        danger: {
          50: "#fbeeec",
          100: "#f6d9d3",
          200: "#ecb6ab",
          300: "#dd8b7b",
          400: "#c96150",
          500: "#b23a26",
          600: "#9a2f1e",
          700: "#7c271a",
          800: "#5c2015",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(32,30,29,.05), 0 2px 6px rgba(32,30,29,.06)",
        card: "0 14px 34px -16px rgba(32,30,29,.24)",
        lift: "0 22px 48px -18px rgba(166,90,43,.34)",
      },
      borderRadius: {
        xl2: "28px",
        pill: "999px",
      },
      backgroundImage: {
        "paper-glow":
          "radial-gradient(120% 80% at 82% -5%, var(--tw-gradient-from,#ebddc5), transparent 55%)",
      },
    },
  },
  plugins: [],
};
