import { useId } from 'react';
import { Search, X } from 'lucide-react';

// ── EL CAMPO DE BÚSQUEDA DE LA CASA ─────────────────────────────────────────
//
// No existía, y por eso cada pantalla que necesitaba uno bajaba a HTML plano y
// lo volvía a escribir: la Matriz y Repartido tienen hoy el mismo bloque de
// quince líneas copiado, con su lupa colocada a mano, su botón de limpiar y sus
// clases largas. Esto es exactamente lo que el trinquete del sistema de diseño
// (tests/sistema-de-diseno.check.mjs) llama «lo que hoy obliga a bajar a HTML
// plano», y su comentario dice que el camino es que el sistema lo absorba y que
// lo nuevo nazca usándolo. Así que vive aquí una vez.
//
// LO QUE TRAE PUESTO, que es lo que se olvida al escribirlo a mano:
//
//   · 44 PÍXELES DE ALTO (`min-h-11`). Esto se usa en una tableta sin ratón, y
//     un campo de 36 px se falla al tocarlo.
//   · LA X SIEMPRE VISIBLE cuando hay texto, no al pasar el ratón por encima.
//     En la tableta no hay «encima», así que un botón que aparece con el hover
//     no existe. Y es un blanco de 44 px por lo mismo.
//   · ANILLO DE FOCO. Lleva `focus:outline-none`, que quita el del navegador, y
//     por tanto TIENE que poner uno propio; cuando esto se escribe a mano es lo
//     primero que se queda sin reemplazo.
//   · NOMBRE PARA EL LECTOR DE PANTALLA. Si no hay etiqueta visible, el
//     `aria-label` es obligatorio: una lupa no se lee en voz alta.
//   · ESCAPE LIMPIA. Es lo que ya hace el campo de búsqueda del navegador, y
//     con teclado es más rápido que ir a buscar la X con el ratón.
//
// EL `onChange` ENTREGA EL VALOR PELADO, no el evento, igual que BuscadorLista
// y al contrario que Input. Se parece al hermano con el que se va a confundir
// —los dos se llaman Buscador y los dos van en una barra de filtros— y no al
// que está en otro archivo.
//
// NO LLEVA RETARDO A PROPÓSITO. Quien filtre una lista que ya está en memoria
// quiere ver el efecto en la misma tecla; el retardo hace falta cuando cada
// letra es una petición al servidor, y eso lo pone quien llama (Inventario lo
// hace así) porque es su decisión, no la del campo.
export function Buscador({
  value,
  onChange,
  etiqueta,
  placeholder = 'Buscar…',
  id,
  className = '',
  envoltorio = '',
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const hayTexto = String(value ?? '') !== '';

  // DOS DIVS Y NO UNO, con el `relative` en el de DENTRO. La lupa y el aspa se
  // colocan en `absolute` respecto a su padre posicionado, así que si ese padre
  // fuera el bloque entero —etiqueta incluida— los dos quedarían centrados
  // sobre etiqueta+campo y no sobre el campo: medio icono fuera de la caja. Con
  // el envoltorio de fuera sin posicionar y el de dentro `relative`, el centrado
  // es `top-1/2` en los dos casos y no hace falta ningún número a mano que haya
  // que recalcular el día que la etiqueta cambie de tamaño.
  return (
    <div className={envoltorio}>
      {etiqueta && (
        <label htmlFor={inputId} className="block text-xs font-medium text-muted mb-1">
          {etiqueta}
        </label>
      )}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          // Escape limpia, pero SÓLO si hay algo escrito: si no, se deja pasar
          // para que lo recoja quien esté detrás —un modal se cierra con Escape, y
          // un campo que se lo trague dejaría la tecla sin efecto.
          onKeyDown={(e) => {
            if (e.key === 'Escape' && hayTexto) {
              e.preventDefault();
              e.stopPropagation();
              onChange('');
            }
          }}
          placeholder={placeholder}
          // Sin autocorrector ni mayúscula automática: en la tableta, escribir
          // «mixta» y que se convierta en «Mixta» da igual -la búsqueda no
          // distingue- pero corregir una referencia a una palabra del diccionario
          // sí rompe la búsqueda, y pasa con nombres como «buzo» o «jogger».
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          className={`w-full pl-10 ${hayTexto ? 'pr-12' : 'pr-3'} py-2.5 rounded-xl border border-border
            bg-surface text-sm min-h-11
            focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary
            disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
          {...rest}
        />
        {hayTexto && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Limpiar la búsqueda"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center
              justify-center w-11 h-11 rounded-lg
              text-muted hover:text-primary hover:bg-primary/5
              focus:outline-none focus:ring-2 focus:ring-secondary/30"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
