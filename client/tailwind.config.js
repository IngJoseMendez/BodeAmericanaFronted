/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f0f1a',
        secondary: '#d4a373',
        accent: '#bc4749',
        success: '#6a994e',
        warning: '#e9c46a',
        error: '#bc4749',
        cream: '#faf8f5',
        surface: '#ffffff',
        muted: '#6b7280',
        border: '#e5e0db',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        heading: ['"Outfit"', 'sans-serif'],
        body: ['"Outfit"', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 12px rgba(15, 15, 26, 0.08)',
        'card-hover': '0 12px 32px rgba(15, 15, 26, 0.12), 0 0 40px rgba(212, 163, 115, 0.15)',
        'glow': '0 0 40px rgba(212, 163, 115, 0.2)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in-scale': 'fadeInScale 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-left': 'slideInLeft 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'float': 'float 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}