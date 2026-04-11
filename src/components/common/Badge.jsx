const variants = {
  disponible: 'bg-success/15 text-success border-success/20',
  separada: 'bg-warning/15 text-warning border-warning/20',
  vendida: 'bg-accent/15 text-accent border-accent/20',
  activo: 'bg-success/15 text-success border-success/20',
  inactivo: 'bg-gray-100 text-muted border-gray/20',
  mayorista: 'bg-primary/10 text-primary border-primary/20',
  minorista: 'bg-secondary/15 text-primary border-secondary/20',
  contado: 'bg-success/15 text-success border-success/20',
  credito: 'bg-warning/15 text-warning border-warning/20',
};

export function Badge({ children, variant = 'default', size = 'md', className = '' }) {
  const variantStyles = variants[variant] || 'bg-gray-100 text-muted border-gray/20';
  
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