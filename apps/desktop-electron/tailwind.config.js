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
        void: {
          DEFAULT: '#050508',
          surface: '#0A0A0F',
          card: '#111118',
          elevated: '#1A1A24',
          hover: '#222230',
        },
        brand: {
          DEFAULT: '#FF6B00',
          light: '#FF8C38',
          hot: '#FF4D00',
          dim: '#CC5500',
          glow: 'rgba(255, 107, 0, 0.55)',
        },
        accent: { DEFAULT: '#FFB366', light: '#FFD199' },
        neon: {
          emerald: '#22D3EE',
          amber: '#FBBF24',
          red: '#EF4444',
        },
        surface: { app: '#0A0A0F' },
        // Glass backgrounds
        glass: {
          subtle: 'rgba(255,255,255,0.025)',
          light: 'rgba(255,255,255,0.04)',
          medium: 'rgba(255,255,255,0.06)',
        },
        // Glass borders
        'glass-border': {
          subtle: 'rgba(255,255,255,0.06)',
          light: 'rgba(255,255,255,0.08)',
          medium: 'rgba(255,255,255,0.12)',
        },
        // HSL contrast tones (WCAG AA compliant on #050508)
        muted: '#64748b',
        subtle: '#4a5568',
        whisper: '#3f4a5c',
      },
      boxShadow: {
        'glow-brand': '0 0 30px rgba(255,107,0,0.18), 0 0 60px rgba(255,107,0,0.06)',
        'glow-emerald': '0 0 30px rgba(34,211,238,0.15), 0 0 60px rgba(34,211,238,0.05)',
        'glow-cyan': '0 0 30px rgba(34,211,238,0.15), 0 0 60px rgba(34,211,238,0.05)',
        'glass': 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.5)',
        'card': '0 2px 12px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)',
        'brand-btn': '0 4px 20px rgba(255,107,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
        'brand-btn-hover': '0 6px 28px rgba(255,107,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
        'connected-btn': '0 4px 16px rgba(16,185,129,0.4)',
        'connecting-btn': '0 4px 16px rgba(245,158,11,0.4)',
        'server-active': '0 4px 24px rgba(255,107,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #FF4D00, #FF6B00, #FF8C38)',
        'brand-gradient-hover': 'linear-gradient(135deg, #FF6B00, #FF8C38, #FFB366)',
        'connected-gradient': 'linear-gradient(135deg, #059669, #10B981)',
        'connecting-gradient': 'linear-gradient(135deg, #F59E0B, #D97706)',
        'active-bar': 'linear-gradient(180deg, #FF8C38, #FF4D00)',
        'sidebar-bg': 'linear-gradient(180deg, rgba(8,8,12,0.95), rgba(8,8,12,0.85))',
        'titlebar-bg': 'linear-gradient(180deg, rgba(5,5,8,0.98), rgba(5,5,8,0.7))',
      },
      animation: {
        'shield-breathe': 'shield-breathe 3s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'morph-blob': 'morph-blob 8s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'float': 'float 4s ease-in-out infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
        'ember-pulse': 'ember-pulse 4s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'status-pulse': 'status-pulse 2s ease-in-out infinite',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      borderRadius: {
        '4xl': '2rem',
        'card': '16px',
        'panel': '24px',
        'button': '12px',
        'input': '12px',
        'modal': '2rem',
      },
    },
  },
  plugins: [],
};
