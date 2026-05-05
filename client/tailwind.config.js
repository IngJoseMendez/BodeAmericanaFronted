/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        cream: 'var(--color-cream)',
        surface: 'var(--color-surface)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        'on-primary': 'var(--color-on-primary)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        heading: ['"Outfit"', 'sans-serif'],
        body: ['"Outfit"', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 4px 12px rgba(15, 23, 42, 0.08)',
        'card-hover': '0 12px 32px rgba(15, 23, 42, 0.12), 0 0 40px rgba(99, 102, 241, 0.15)',
        'glow': '0 0 40px rgba(99, 102, 241, 0.2)',
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