/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./renderer/**/*.{html,tsx,ts,jsx,js}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Outfit"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        void: { DEFAULT: '#030308', surface: '#0A0A14', card: '#0F0F1A', elevated: '#141422' },
        brand: { DEFAULT: '#818CF8', light: '#A5B4FC', hot: '#6366F1', dim: '#4F46E5' },
        accent: { DEFAULT: '#A78BFA', light: '#C4B5FD' },
        neon: { emerald: '#34D399', amber: '#FBBF24', red: '#F87171' },
      },
      boxShadow: {
        'glow-brand': '0 0 30px rgba(99,102,241,0.15), 0 0 60px rgba(99,102,241,0.05)',
        'glow-emerald': '0 0 30px rgba(52,211,153,0.15), 0 0 60px rgba(52,211,153,0.05)',
        'glass': 'inset 0 1px 0 rgba(255,255,255,0.03), 0 4px 24px rgba(0,0,0,0.5)',
        'card': '0 2px 12px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)',
      },
      animation: {
        'shield-breathe': 'shield-breathe 3s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'morph-blob': 'morph-blob 8s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 4s ease-in-out infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};
