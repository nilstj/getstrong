import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sage: {
          50:  '#f2f5ef',
          100: '#e4ebe0',
          200: '#c9d7c0',
          300: '#afc3a1',
          400: '#9BAF88',
          500: '#8B9B7A',
          600: '#728060',
          700: '#5a6649',
          800: '#424c35',
          900: '#2b3221',
        },
        khaki: {
          50:  '#f9f5eb',
          100: '#f2ebd6',
          200: '#e5d7ad',
          300: '#d8c384',
          400: '#C4B282',
          500: '#a8966a',
          600: '#8c7a52',
          700: '#6e5f3d',
          800: '#50442a',
          900: '#322b18',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
