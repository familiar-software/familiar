/** @type {import('tailwindcss').Config} */
export default {
  content: ['./docs/**/*.html', './docs/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"SF Pro Text"', '"Helvetica Neue"', '"Segoe UI"', 'sans-serif'],
      },
      colors: {
        // Match Familiar's brand colors
        indigo: {
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
      },
    },
  },
};
