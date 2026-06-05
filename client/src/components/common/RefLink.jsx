import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

/**
 * Enlace clickeable hacia otra entidad del sistema (trazabilidad / auditoría).
 * Navega a `${to}?focus=${id}` y el panel destino abre el detalle de esa entidad.
 *
 * Props:
 *  - to:    ruta destino (ej. '/cotizaciones', '/contenedores', '/cartera')
 *  - id:    id de la entidad a enfocar
 *  - param: nombre del query param (por defecto 'focus'; CxP usa 'contenedor')
 *  - icon:  muestra el ícono de enlace externo (por defecto true)
 *  - title: tooltip ("ver qué es")
 */
export function RefLink({ to, id, param = 'focus', children, icon = true, title, className = '' }) {
  const navigate = useNavigate();
  if (id == null || id === '') {
    return <span className={className}>{children}</span>;
  }
  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`${to}?${param}=${encodeURIComponent(id)}`);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title={title || 'Ver detalle'}
      className={`inline-flex items-center gap-1 text-secondary hover:text-secondary/80 hover:underline underline-offset-2 font-medium transition-colors cursor-pointer ${className}`}
    >
      {children}
      {icon && <ExternalLink size={12} className="flex-shrink-0 opacity-70" />}
    </button>
  );
}
