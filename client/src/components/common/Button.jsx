import { useRef } from 'react';

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
  
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] active:transition-transform active:duration-75';
  
  const variants = {
    primary:   'bg-secondary text-primary hover:opacity-90 focus:ring-secondary shadow-md hover:shadow-lg hover:shadow-glow font-semibold',
    secondary: 'bg-secondary text-primary hover:opacity-90 focus:ring-secondary shadow-md hover:shadow-lg font-semibold',
    accent:    'bg-accent text-white hover:opacity-90 focus:ring-accent shadow-md hover:shadow-accent/20',
    ghost:     'bg-transparent text-primary hover:bg-primary/5 focus:ring-primary/20',
    danger:    'bg-error text-white hover:opacity-90 focus:ring-error shadow-md hover:shadow-error/20',
    outline:   'border-2 border-primary text-primary hover:bg-primary/10 focus:ring-primary',
  };
  
  const sizes = {
    sm: 'px-3 py-2.5 text-xs gap-1.5 min-h-[36px]',
    md: 'px-4 py-3 text-sm gap-2 min-h-[44px]',
    lg: 'px-6 py-3.5 text-base gap-2 min-h-[48px]',
    xl: 'px-8 py-4 text-lg gap-2.5 min-h-[52px]',
  };

  const handleClick = (e) => {
    if (loading || disabled || clickedRef.current) return;
    clickedRef.current = true;
    if (onClick) onClick(e);
    setTimeout(() => { clickedRef.current = false; }, 1000);
  };
  
  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
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
      {!loading && Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />}
      {children}
    </button>
  );
}