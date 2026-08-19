// Un único mapa para toda la app. Faltaban dos grupos enteros y por eso casi todos
// los badges salían del mismo gris: (1) 'despachada', que sí existe en
// types/index.js y se pinta con el estado crudo en Pacas, y (2) las variantes
// semánticas ('warning', 'success', 'error', 'primary'…) que pasan Cotizaciones,
// Pedidos, Usuarios y Analytics — con lo que "aprobado" y "rechazado" se veían
// idénticos. Además 'border-gray/20' ni siquiera era una clase válida (gray sin
// tono), así que ese borde nunca se pintaba.
const variants = {
  // Estados de paca (types/index.js → PACA_ESTADOS)
  disponible: 'bg-success/15 text-success border-success/20',
  separada: 'bg-warning/15 text-warning border-warning/20',
  vendida: 'bg-accent/15 text-accent border-accent/20',
  despachada: 'bg-secondary/15 text-secondary border-secondary/20',
  reservada: 'bg-info/15 text-info border-info/20',
  // Clientes y usuarios
  activo: 'bg-success/15 text-success border-success/20',
  inactivo: 'bg-muted/15 text-primary border-muted/30',
  mayorista: 'bg-primary/10 text-primary border-primary/20',
  minorista: 'bg-secondary/15 text-primary border-secondary/20',
  // Forma de pago
  contado: 'bg-success/15 text-success border-success/20',
  credito: 'bg-warning/15 text-warning border-warning/20',
  // Semánticas genéricas
  success: 'bg-success/15 text-success border-success/20',
  warning: 'bg-warning/15 text-warning border-warning/20',
  error: 'bg-error/15 text-error border-error/20',
  info: 'bg-info/15 text-info border-info/20',
  primary: 'bg-primary/10 text-primary border-primary/20',
  secondary: 'bg-secondary/15 text-secondary border-secondary/20',
  accent: 'bg-accent/15 text-accent border-accent/20',
  default: 'bg-muted/15 text-primary border-muted/30',
};

export function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const variantStyles = variants[variant] || variants.default;

  const sizes = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };
  
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full font-medium border
        ${variantStyles} ${sizes[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}