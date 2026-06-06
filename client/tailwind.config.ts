import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Jr Chargers brand palette
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover:   'rgb(var(--brand-hover) / <alpha-value>)',
          pressed: 'rgb(var(--brand-pressed) / <alpha-value>)',
          subtle:  '#FDF0F0',
        },
        // Dark theme neutrals
        bg: {
          primary:   '#0A0A0A',
          secondary: '#1A1A1A',
          surface:   '#242424',
        },
        border: {
          DEFAULT: 'rgba(255,255,255,0.08)',
          strong:  'rgba(255,255,255,0.16)',
        },
        // Status colors
        status: {
          sent:       '#E5A567',
          accepted:   '#66C97A',
          declined:   '#E07070',
          waitlisted: '#6BAEFF',
          draft:      '#888888',
          expired:    '#666666',
          rejected:   '#555555',
        },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        body:    ['Barlow', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Courier New"', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in':  'fadeIn 180ms ease-out',
        'slide-up': 'slideUp 220ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
