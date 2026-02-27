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
          accent: "rgb(var(--es-brand-accent) / <alpha-value>)",
          amber: "rgb(var(--es-brand-amber) / <alpha-value>)",
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
        "out-expo": "var(--es-ease-out-expo)",
      },
      transitionDuration: {
        fast: "var(--es-duration-fast)",
        normal: "var(--es-duration-normal)",
        slow: "var(--es-duration-slow)",
      },
      boxShadow: {
        card: "var(--es-shadow)",
        "card-lg": "var(--es-shadow-lg)",
        glow: "var(--es-glow)",
        "glow-strong": "var(--es-glow-strong)",
      },
      backdropBlur: {
        glass: "var(--es-glass-blur)",
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite",
        float: "float 3s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.4s var(--es-ease-spring) forwards",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(255, 102, 0, 0.15)" },
          "50%": { boxShadow: "0 0 40px rgba(255, 102, 0, 0.35)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
}

