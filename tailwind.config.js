/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Sora"', '"Plus Jakarta Sans"', "ui-sans-serif", "sans-serif"],
      },
      colors: {
        // Warm, travel-inspired identity — a deep teal brand with a coral accent
        // over warm off-white paper, moving away from the default indigo/gray.
        paper: "#f7f5f1",
        surface: "#ffffff",
        ink: "#1c1917",
        muted: "#6b6660",
        line: "#e7e3dc",
        brand: {
          50: "#effcf9",
          100: "#c9f7ec",
          200: "#96ecda",
          300: "#5cd9c2",
          400: "#2fbfa8",
          500: "#14a48f",
          600: "#0f8375",
          700: "#116a60",
          800: "#12544d",
          900: "#123f3b",
        },
        accent: {
          50: "#fff5ed",
          100: "#ffe6d3",
          200: "#ffc8a5",
          300: "#ffa26d",
          400: "#fb7c40",
          500: "#f2601f",
          600: "#e14a12",
          700: "#bb3611",
          800: "#942d16",
          900: "#772815",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,25,23,.04), 0 1px 3px rgba(28,25,23,.06)",
        card: "0 10px 30px -12px rgba(28,25,23,.14)",
        lift: "0 18px 40px -16px rgba(15,131,117,.28)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #0f8375 0%, #14a48f 55%, #2fbfa8 100%)",
        "paper-glow":
          "radial-gradient(1100px 500px at 15% -10%, rgba(20,164,143,.14), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(242,96,31,.10), transparent 55%)",
      },
    },
  },
  plugins: [],
};
