/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./renderer/**/*.{html,tsx,ts,jsx,js}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Outfit"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"]
      },
      spacing: {
        "es-1": "var(--es-space-1)", // 4px
        "es-2": "var(--es-space-2)", // 8px
        "es-3": "var(--es-space-3)", // 12px
        "es-4": "var(--es-space-4)", // 16px
        "es-5": "var(--es-space-5)", // 20px
        "es-6": "var(--es-space-6)", // 24px
        "es-8": "var(--es-space-8)", // 32px
        "es-10": "var(--es-space-10)", // 40px
        "es-12": "var(--es-space-12)" // 48px
      },
      fontSize: {
        "es-xs": ["var(--es-text-xs)", { lineHeight: "var(--es-leading-tight)" }],
        "es-sm": ["var(--es-text-sm)", { lineHeight: "var(--es-leading-normal)" }],
        "es-base": ["var(--es-text-base)", { lineHeight: "var(--es-leading-normal)" }],
        "es-md": ["var(--es-text-md)", { lineHeight: "var(--es-leading-normal)" }],
        "es-lg": ["var(--es-text-lg)", { lineHeight: "var(--es-leading-tight)" }],
        "es-xl": ["var(--es-text-xl)", { lineHeight: "var(--es-leading-tight)" }],
        "es-2xl": ["var(--es-text-2xl)", { lineHeight: "var(--es-leading-tight)" }],
        "es-display": ["var(--es-text-display)", { lineHeight: "1.1" }]
      },
      zIndex: {
        base: "var(--es-z-base)",
        dropdown: "var(--es-z-dropdown)",
        sticky: "var(--es-z-sticky)",
        overlay: "var(--es-z-overlay)",
        modal: "var(--es-z-modal)",
        toast: "var(--es-z-toast)",
        max: "var(--es-z-max)"
      },
      colors: {
        void: {
          DEFAULT: "#051520",
          surface: "#0A1E2E",
          card: "#122838",
          elevated: "#1A3040",
          hover: "#213B4D"
        },
        brand: {
          DEFAULT: "var(--es-brand)",
          light: "var(--es-brand-light)",
          hot: "var(--es-brand-hot)",
          dim: "var(--es-brand-dim)",
          glow: "var(--es-brand-glow)"
        },
        accent: { DEFAULT: "#FF8A6C", light: "#FFD6A5" },
        neon: {
          emerald: "#22D3EE",
          amber: "#FBBF24",
          red: "#EF4444"
        },
        surface: { app: "#0A1E2E" },
        // Glass backgrounds
        glass: {
          subtle: "rgba(10,30,46,0.3)",
          light: "rgba(10,30,46,0.45)",
          medium: "rgba(10,30,46,0.55)"
        },
        // Glass borders
        "glass-border": {
          subtle: "rgba(30,50,69,0.35)",
          light: "rgba(30,50,69,0.5)",
          medium: "rgba(30,50,69,0.65)"
        },
        // HSL contrast tones (WCAG AA compliant on #050508)
        muted: "#7B8FA0",
        subtle: "#7A8D9E",
        whisper: "#6B7D8E"
      },
      boxShadow: {
        "glow-brand": "0 0 30px rgba(255,76,41,0.18), 0 0 60px rgba(255,76,41,0.06)",
        "glow-emerald": "0 0 30px rgba(34,211,238,0.15), 0 0 60px rgba(34,211,238,0.05)",
        "glow-cyan": "0 0 30px rgba(34,211,238,0.15), 0 0 60px rgba(34,211,238,0.05)",
        glass: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)",
        card: "0 2px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)",
        "brand-btn": "0 4px 20px rgba(255,76,41,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
        "brand-btn-hover": "0 6px 28px rgba(255,76,41,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
        "connected-btn": "0 4px 16px rgba(224,64,30,0.4)",
        "connecting-btn": "0 4px 16px rgba(245,158,11,0.4)",
        "server-active": "0 4px 24px rgba(255,76,41,0.15), inset 0 1px 0 rgba(255,255,255,0.03)"
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #E0401E, #FF4C29, #FF6B47)",
        "brand-gradient-hover": "linear-gradient(135deg, #FF4C29, #FF6B47, #FF8A6C)",
        "connected-gradient": "linear-gradient(135deg, #C03010, #FF4C29)",
        "connecting-gradient": "linear-gradient(135deg, #F59E0B, #D97706)",
        "active-bar": "linear-gradient(180deg, #FF6B47, #E0401E)",
        "sidebar-bg": "linear-gradient(180deg, rgba(8,32,50,0.95), rgba(8,32,50,0.85))",
        "titlebar-bg": "linear-gradient(180deg, rgba(8,32,50,0.98), rgba(8,32,50,0.7))"
      },
      animation: {
        "shield-breathe": "shield-breathe 3s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        "morph-blob": "morph-blob 8s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        float: "float 4s ease-in-out infinite",
        "spin-slow": "spin-slow 20s linear infinite",
        "ember-pulse": "ember-pulse 4s ease-in-out infinite",
        "slide-up": "slide-up 0.3s ease-out",
        "status-pulse": "status-pulse 2s ease-in-out infinite"
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-back": "cubic-bezier(0.34, 1.56, 0.64, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)"
      },
      borderRadius: {
        "4xl": "2rem",
        card: "16px",
        panel: "24px",
        button: "12px",
        input: "12px",
        modal: "2rem"
      }
    }
  },
  plugins: []
};
