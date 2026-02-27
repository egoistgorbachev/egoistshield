/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./renderer/index.html",
    "./renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(var(--es-brand) / <alpha-value>)",
          light: "rgb(var(--es-brand-light) / <alpha-value>)",
          hot: "rgb(var(--es-brand-hot) / <alpha-value>)",
        },
        success: "rgb(var(--es-success) / <alpha-value>)",
        danger: "rgb(var(--es-danger) / <alpha-value>)",
        warning: "rgb(var(--es-warning) / <alpha-value>)",
        surface: {
          app: "rgb(var(--es-bg-app) / <alpha-value>)",
          DEFAULT: "rgb(var(--es-bg-surface) / <alpha-value>)",
          card: "rgb(var(--es-bg-card) / <alpha-value>)",
          elevated: "rgb(var(--es-bg-elevated) / <alpha-value>)",
        },
      },
      textColor: {
        primary: "rgb(var(--es-text-primary) / <alpha-value>)",
        secondary: "rgb(var(--es-text-secondary) / <alpha-value>)",
        muted: "rgb(var(--es-text-muted) / <alpha-value>)",
      },
      borderRadius: {
        card: "20px",
        button: "14px",
        badge: "8px",
        pill: "9999px",
      },
      spacing: {
        "topbar": "var(--es-topbar-h)",
        "bottomnav": "var(--es-bottomnav-h)",
      },
      transitionTimingFunction: {
        spring: "var(--es-ease-spring)",
      },
      transitionDuration: {
        fast: "var(--es-duration-fast)",
        normal: "var(--es-duration-normal)",
      },
      boxShadow: {
        card: "var(--es-shadow)",
        glow: "var(--es-glow)",
      },
    },
  },
  plugins: [],
}
