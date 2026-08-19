import { useEffect, useState } from 'react';

const WIDTHS = ['w-1/4', 'w-1/2', 'w-3/4', 'w-2/3', 'w-1/3', 'w-3/5'];

export function TableSkeleton({ cols = 4, rows = 5 }) {
  // Una región viva (role="status") sólo se anuncia cuando su contenido CAMBIA
  // estando ya en el DOM. Si el texto llega en el mismo commit que la región
  // —como estaba— el lector de pantalla no lee nada y el aviso es decorativo.
  // Montamos la región vacía y escribimos dentro en un segundo commit; de paso,
  // si la tabla carga en menos de 120 ms no se interrumpe a nadie por nada.
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAviso('Cargando datos…'), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* Aviso solo para lectores de pantalla: las filas de abajo son un marcador
          de posición. Sin esto se leían como celdas vacías, es decir, como si la
          tabla ya hubiera cargado y no hubiera datos. */}
      <tr>
        <td colSpan={cols} className="p-0 border-0">
          <span role="status" className="sr-only">{aviso}</span>
        </td>
      </tr>
      {Array.from({ length: rows }).map((_, ri) => (
        // aria-hidden para que el lector de pantalla no recorra celdas falsas.
        <tr key={ri} aria-hidden="true" className="border-b border-border/30">
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} className="px-4 py-3">
              {/* /10 y no /8: la escala de opacidad de Tailwind va de 5 en 5, así
                  que 'bg-primary/8' nunca llegaba al CSS y las barras salían
                  transparentes (la tabla parecía vacía durante la carga). */}
              <div className={`h-3.5 bg-primary/10 rounded-full animate-pulse ${WIDTHS[(ri * cols + ci) % WIDTHS.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
