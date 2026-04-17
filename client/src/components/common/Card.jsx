export function Card({ children, className = '', hover = false, padding = true, ...props }) {
  return (
    <div
      className={`
        bg-surface rounded-2xl border border-border/50 shadow-card
        ${hover ? 'transition-all duration-300 ease-out hover:shadow-card-hover hover:border-secondary/30' : ''}
        ${padding ? 'p-5' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`pb-4 border-b border-border/50 ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3 className={`font-display text-xl text-primary ${className}`}>
      {children}
    </h3>
  );
}

export function CardDescription({ children, className = '' }) {
  return (
    <p className={`text-sm text-muted mt-1 ${className}`}>
      {children}
    </p>
  );
}