/** @type {import('tailwindcss').Config} */

// Los colores del tema viven como variables CSS en src/index.css para poder
// cambiar de modo claro a oscuro sin recompilar. El detalle importante es el
// envoltorio color-mix + <alpha-value>: declarados como `var(--color-x)` a secas,
// Tailwind no sabe inyectar transparencia y descarta en silencio TODA utilidad con
// opacidad (bg-primary/5, border-border/50, bg-success/15…). Eran ~800 clases en
// este proyecto que no llegaban al CSS final, así que los hover, los estados
// activos del menú y los badges suaves no pintaban nada.
//
// Con este envoltorio, `bg-primary` resuelve a alpha 1 y `bg-primary/5` al 5%.
const token = (nombre) =>
  `color-mix(in srgb, var(--color-${nombre}) calc(<alpha-value> * 100%), transparent)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: token('primary'),
        secondary: token('secondary'),
        accent: token('accent'),
        success: token('success'),
        warning: token('warning'),
        error: token('error'),
        'error-fuerte': token('error-fuerte'),
        info: token('info'),
        cream: token('cream'),
        surface: token('surface'),
        muted: token('muted'),
        border: token('border'),
        'on-primary': token('on-primary'),
        'on-surface': token('on-surface'),
        // Alias del fondo de página, usado por los componentes de components/ui.
        background: token('cream'),
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
