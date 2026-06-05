import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { usePreview } from './PreviewProvider';

/**
 * Enlace clickeable hacia otra entidad del sistema (trazabilidad / auditoría).
 * Por defecto abre una VISTA PREVIA flotante de la entidad (cotización,
 * contenedor, cliente, despacho, cuenta) con un botón "Ir" para navegar al
 * panel destino. Si no hay PreviewProvider o el tipo no se reconoce, navega
 * directo a `${to}?${param}=${id}`.
 *
 * Props:
 *  - to:    ruta destino (ej. '/cotizaciones', '/contenedores', '/cartera')
 *  - id:    id de la entidad a enfocar
 *  - param: nombre del query param (por defecto 'focus'; CxP usa 'contenedor')
 *  - icon:  muestra el ícono de enlace externo (por defecto true)
 *  - title: tooltip
 */
export function RefLink({ to, id, param = 'focus', children, icon = true, title, className = '' }) {
  const navigate = useNavigate();
  const preview = usePreview();
  if (id == null || id === '') {
    return <span className={className}>{children}</span>;
  }
  const handleClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (preview) preview.openPreview({ to, id, param });
    else navigate(`${to}?${param}=${encodeURIComponent(id)}`);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      title={title || 'Vista previa'}
      className={`inline-flex items-center gap-1 text-secondary hover:text-secondary/80 hover:underline underline-offset-2 font-medium transition-colors cursor-pointer ${className}`}
    >
      {children}
      {icon && <ExternalLink size={12} className="flex-shrink-0 opacity-70" />}
    </button>
  );
}
