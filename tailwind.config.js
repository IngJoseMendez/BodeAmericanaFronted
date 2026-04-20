/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
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
        info: 'var(--color-info)',
        cream: 'var(--color-cream)',
        surface: 'var(--color-surface)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        background: 'var(--color-cream)',
        'on-primary': 'var(--color-on-primary)',
        'on-surface': 'var(--color-on-surface)',
        'sidebar-bg': 'var(--color-sidebar-bg)',
        'sidebar-text': 'var(--color-sidebar-text)',
        'sidebar-border': 'var(--color-sidebar-border)',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        heading: ['"Outfit"', 'sans-serif'],
        body: ['"Outfit"', 'sans-serif'],
      },
      boxShadow: {
        'card': 'var(--shadow-md)',
        'card-hover': 'var(--shadow-lg)',
        'glow': 'var(--shadow-glow)',
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
