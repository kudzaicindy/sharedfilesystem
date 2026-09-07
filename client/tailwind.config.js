/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0B1F3A',
          'navy-soft': '#132A4A',
          'navy-muted': '#1E3A5F',
          maroon: '#7A1E2C',
          'maroon-dark': '#5A1520',
          'maroon-light': '#F7E9EC',
          ink: '#0F172A',
          mist: '#F4F6F9',
          sand: '#E8ECF2',
        },
        cloudy: {
          green: '#7A1E2C',
          'green-light': '#F7E9EC',
          'green-dark': '#5A1520',
          muted: '#6b7280',
          border: '#e5e7eb',
          bg: '#f9fafb',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(11 31 58 / 0.04), 0 4px 12px rgb(11 31 58 / 0.04)',
        lift: '0 12px 40px -16px rgba(11, 31, 58, 0.28)',
        sidebar: '8px 0 32px -12px rgba(11, 31, 58, 0.35)',
        soft: '0 2px 8px -2px rgba(11, 31, 58, 0.08)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { opacity: '0', transform: 'translateX(-6px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.4s ease-out both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'slide-in': 'slide-in 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};
