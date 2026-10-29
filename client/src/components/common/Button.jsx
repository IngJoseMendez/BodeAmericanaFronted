import { useRef } from 'react';

// ── POR QUE ESTE COMPONENTE IMPORTA MAS DE LO QUE PARECE ────────────
//
// Los 48 botones de icono del sistema estan escritos como <button> a pelo, y 41
// de ellos no tenian nombre para un lector de pantalla. No fue descuido: este
// componente no tenia forma de hacer un boton cuadrado de icono, asi que quien
// necesitaba un lapiz en una fila de tabla no tenia mas remedio que bajar a
// HTML plano. Y a mano es donde se olvidan el tamano tactil, el anillo de foco
// y la etiqueta: las tres cosas que aqui ya vienen puestas.
//
// De ahi `size="icono"` y la guarda de desarrollo de mas abajo.

// Un boton sin texto visible necesita `aria-label`, o para quien lo escucha es
// un boton sin nombre. Esto solo corre en desarrollo: Vite reemplaza
// import.meta.env.DEV por false al construir y el bloque entero desaparece del
// paquete. No lanza, avisa: el objetivo es que se vea al escribirlo.
const avisados = new Set();
function avisarSiNoTieneNombre({ children, size, props }) {
  if (!import.meta.env?.DEV) return;
  const sinTexto = children === undefined || children === null
    || children === false || children === '';
  if (!sinTexto && size !== 'icono') return;
  if (props['aria-label'] || props['aria-labelledby'] || props.title) return;
  if (!sinTexto) return;
  const firma = String(props['data-testid'] || props.type || 'boton') + ':' + String(size);
  if (avisados.has(firma)) return;
  avisados.add(firma);
  console.warn(
    '[Button] Un boton sin texto dentro necesita aria-label: sin el, un lector '
    + 'de pantalla lo anuncia como «boton» y no dice que hace. '
    + '(size=' + String(size) + ')'
  );
}

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  disabled = false,
  loading = false,
  icon: Icon,
  className = '', 
  onClick,
  ...props 
}) {
  const clickedRef = useRef(false);
  
  // Antes decia "transition" seguido de "all", que animaba tambien las
  // propiedades que mueven la maquetacion. Aqui se listan las cinco que de
  // verdad cambian en este componente: color, fondo, borde, sombra y opacidad.
  // La escala va aparte, abajo, con su propia duracion mas corta.
  //
  // (El nombre de la clase vieja va escrito a trozos a proposito: un barrido
  // mecanico que la buscara para reemplazarla reescribiria este comentario y lo
  // dejaria diciendo una incoherencia. Ya paso.)
  //
  // Y 200ms en vez de 300: trescientos en un boton que se pulsa se sienten como
  // que la tableta responde tarde.
  //
  // `motion-reduce`: quien tenga puesto «reducir movimiento» en su sistema no
  // quiere que el boton se encoja al pulsarlo.
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl '
    + 'transition-[color,background-color,border-color,box-shadow,opacity] duration-200 '
    + 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface '
    + 'disabled:opacity-50 disabled:cursor-not-allowed '
    + 'active:scale-[0.97] active:transition-transform active:duration-75 '
    + 'motion-reduce:transition-none motion-reduce:active:scale-100';
  
  const variants = {
    primary:   'bg-secondary text-on-primary hover:opacity-90 focus:ring-secondary shadow-md hover:shadow-lg hover:shadow-glow font-semibold',
    secondary: 'bg-secondary text-on-primary hover:opacity-90 focus:ring-secondary shadow-md hover:shadow-lg font-semibold',
    accent:    'bg-accent text-white hover:opacity-90 focus:ring-accent shadow-md hover:shadow-accent/20',
    ghost:     'bg-transparent text-primary hover:bg-primary/5 focus:ring-primary/20',
    danger:    'bg-error text-white hover:opacity-90 focus:ring-error shadow-md hover:shadow-error/20',
    outline:   'border-2 border-primary text-primary hover:bg-primary/10 focus:ring-primary',
    info:      'bg-info text-white hover:opacity-90 focus:ring-info shadow-md hover:shadow-info/20 font-semibold',
    success:   'bg-success text-white hover:opacity-90 focus:ring-success shadow-md hover:shadow-success/20 font-semibold',
  };
  
  const sizes = {
    sm: 'px-3 py-2.5 text-xs gap-1.5 min-h-[36px]',
    md: 'px-4 py-3 text-sm gap-2 min-h-[44px]',
    lg: 'px-6 py-3.5 text-base gap-2 min-h-[48px]',
    xl: 'px-8 py-4 text-lg gap-2.5 min-h-[52px]',
    // Cuadrado de 44x44, el minimo tactil de Apple HIG. El relleno es simetrico
    // porque `px-4 py-3` en un cuadrado deja el icono descentrado, que es la
    // razon por la que nadie usaba este componente para un boton de icono.
    // El tamano lo fija el MINIMO DE CAJA y no el relleno: los iconos del
    // sistema van de 13 a 20px, asi que con relleno fijo cada boton saldria de
    // un tamano distinto.
    icono: 'p-2.5 min-w-11 min-h-11',
  };

  const handleClick = (e) => {
    // preventDefault es lo que realmente frena el doble envío: sin él, un botón
    // type="submit" seguía disparando el submit nativo del formulario aunque
    // este guard bloqueara el onClick.
    if (loading || disabled || clickedRef.current) {
      e.preventDefault();
      return;
    }
    clickedRef.current = true;
    if (onClick) onClick(e);
    setTimeout(() => { clickedRef.current = false; }, 1000);
  };
  
  avisarSiNoTieneNombre({ children, size, props });

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size] ?? sizes.md} ${className}`}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {!loading && Icon && (
        <Icon
          size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16}
          // El icono es decorativo: lo que nombra al boton es su texto o su
          // aria-label. Sin esto, un lector podria leer dos veces lo mismo.
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}