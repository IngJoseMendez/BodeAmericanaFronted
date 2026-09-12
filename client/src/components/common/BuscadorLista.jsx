// ── BUSCADOR DE LISTA (combobox) ────────────────────────────────────────────
//
// Un <select> con doscientas referencias obliga a bajar rodando hasta encontrar
// la que es. Aquí se escribe y la lista se va quedando con las coincidencias.
//
// POR QUÉ NO ES UN <input list> CON <datalist>
// Era la opción barata y se descartó: el navegador decide solo cómo filtra (en
// Chrome sólo por el principio de la palabra), no se puede recorrer con flechas
// de forma consistente, no hay manera de marcar un valor como «fuera del
// catálogo» y en Firefox la lista sale con otro aspecto. Este módulo ya arrastra
// un bug de datalist documentado en Cotizaciones.
//
// POR QUÉ LA LISTA SE PINTA EN UN PORTAL
// Estos campos viven dentro de tablas con overflow-auto y dentro de modales. Una
// lista en position:absolute la recorta el contenedor que scrollea y se queda
// media lista invisible, sin ningún error. Con el portal y position:fixed la
// lista flota sobre todo; el precio es tener que recolocarla al rodar la
// pantalla, que es lo que hace el efecto de abajo.
//
// LO QUE NO HACE, A PROPÓSITO: no deja inventar valores. Estos campos alimentan
// el cruce del catálogo al finalizar el contenedor, y una referencia escrita a
// mano que no existe se pierde ahí sin avisar. Lo que SÍ conserva es un valor ya
// guardado que no esté en el catálogo: se muestra tal cual y se etiqueta, que es
// como se comportaba el <select> al que sustituye.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

// La misma regla de búsqueda que usan los buscadores de la Matriz, importada y
// no copiada: dos comparadores que se parecen son dos comparadores que algún día
// dejarán de parecerse, y entonces el mismo texto encontraría cosas distintas
// según en qué campo se escriba.
import { coincideBusqueda, normTxt as norm } from '../../lib/matriz';

export function BuscadorLista({
  value = '',
  onChange,
  opciones = [],
  grupos = null,
  placeholder = 'Seleccionar…',
  className = '',
  disabled = false,
  id,
  ...rest
}) {
  const generado = useId();
  const idCampo = id || `buscador-${generado}`;
  const idLista = `${idCampo}-lista`;

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [marcada, setMarcada] = useState(0);
  const [caja, setCaja] = useState(null);

  const refCampo = useRef(null);
  const refLista = useRef(null);

  const actual = String(value ?? '').trim();
  const listas = useMemo(() => grupos ?? [{ label: null, opciones }], [grupos, opciones]);

  // Todas las opciones en plano, con su grupo al lado. La lista se recorre con
  // flechas de arriba abajo sin que los rótulos de grupo estorben.
  const planas = useMemo(() => {
    const out = [];
    for (const g of listas) for (const o of (g.opciones || [])) out.push({ valor: o, grupo: g.label || null });
    return out;
  }, [listas]);

  // El valor guardado puede diferir del catálogo sólo en mayúsculas o espacios
  // («chaqueta» contra «Chaqueta»). En ese caso NO es un valor ajeno: se enseña
  // la versión del catálogo.
  const equivalente = useMemo(
    () => planas.find((p) => norm(p.valor) === norm(actual))?.valor || '',
    [planas, actual],
  );
  const hayCatalogo = planas.length > 0;
  const fueraDeCatalogo = actual !== '' && equivalente === '' && hayCatalogo;

  const visibles = useMemo(
    () => (norm(texto) ? planas.filter((p) => coincideBusqueda(p.valor, texto)) : planas),
    [planas, texto],
  );

  // Recolocar la lista bajo el campo. Se recalcula al abrir y mientras esté
  // abierta, porque con position:fixed la lista NO viaja con el contenedor que
  // rueda: se quedaría flotando sobre otra fila.
  const recolocar = useCallback(() => {
    const el = refCampo.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const espacioAbajo = window.innerHeight - r.bottom;
    const alto = Math.min(260, Math.max(120, espacioAbajo - 12));
    // Si abajo no cabe y arriba sí, se abre hacia arriba en vez de salirse de
    // la pantalla.
    const haciaArriba = espacioAbajo < 160 && r.top > espacioAbajo;
    setCaja({
      left: r.left,
      width: r.width,
      top: haciaArriba ? undefined : r.bottom + 4,
      bottom: haciaArriba ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: haciaArriba ? Math.min(260, r.top - 12) : alto,
    });
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return undefined;
    recolocar();
    // `true` en la captura: hay que enterarse también del scroll de los
    // contenedores de dentro, no sólo del de la ventana.
    window.addEventListener('scroll', recolocar, true);
    window.addEventListener('resize', recolocar);
    return () => {
      window.removeEventListener('scroll', recolocar, true);
      window.removeEventListener('resize', recolocar);
    };
  }, [abierto, recolocar]);

  // Cerrar al pulsar fuera. Va en `mousedown` y no en `click` para que cerrar
  // no se coma el primer clic que la usuaria dé en otro campo.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (ev) => {
      if (refCampo.current?.contains(ev.target)) return;
      if (refLista.current?.contains(ev.target)) return;
      setAbierto(false);
      setTexto('');
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  useEffect(() => { setMarcada(0); }, [texto, abierto]);

  // La opción marcada se mantiene a la vista al recorrer con las flechas.
  useEffect(() => {
    if (!abierto) return;
    refLista.current?.querySelector('[data-marcada="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [marcada, abierto]);

  const escoger = (v) => {
    onChange?.(v);
    setAbierto(false);
    setTexto('');
    refCampo.current?.querySelector('input')?.focus();
  };

  const alTeclear = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!abierto) { setAbierto(true); return; }
      const paso = e.key === 'ArrowDown' ? 1 : -1;
      setMarcada((m) => {
        if (!visibles.length) return 0;
        return (m + paso + visibles.length) % visibles.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      if (!abierto) return;
      e.preventDefault();
      const elegida = visibles[marcada];
      if (elegida) escoger(elegida.valor);
      return;
    }
    if (e.key === 'Escape') {
      if (!abierto) return;
      // Sólo cierra: NO borra lo que ya estaba escogido. Esc que además vacía el
      // campo es la forma más rápida de perder un dato sin querer.
      e.preventDefault();
      e.stopPropagation();
      setAbierto(false);
      setTexto('');
      return;
    }
    if (e.key === 'Tab') setAbierto(false);
  };

  // Lo que se ve: mientras escribe, lo escrito; con la lista cerrada, lo elegido.
  const mostrado = abierto ? texto : (equivalente || actual);

  const lista = abierto && caja ? createPortal(
    <ul
      ref={refLista}
      id={idLista}
      role="listbox"
      // z-[9998]: por encima de los modales (50 + 10·profundidad) y por debajo
      // de los toasts y del diálogo de confirmación, que son z-[9999].
      className="fixed z-[9998] overflow-y-auto rounded-xl border border-border bg-surface shadow-lg py-1"
      style={{ left: caja.left, width: caja.width, top: caja.top, bottom: caja.bottom, maxHeight: caja.maxHeight }}
    >
      {visibles.length === 0 ? (
        <li className="px-3 py-2 text-xs text-muted">
          {texto ? `Nada que se parezca a «${texto}».` : 'No hay nada en esta lista todavía.'}
        </li>
      ) : visibles.map((p, i) => {
        const elegida = norm(p.valor) === norm(actual);
        return (
          <li key={`${p.grupo || ''}-${p.valor}`} role="none">
            <button
              type="button"
              role="option"
              aria-selected={elegida}
              data-marcada={i === marcada ? '1' : '0'}
              // mousedown y no click: el blur del campo llegaría antes que el
              // click y cerraría la lista bajo el dedo.
              onMouseDown={(ev) => { ev.preventDefault(); escoger(p.valor); }}
              onMouseEnter={() => setMarcada(i)}
              className={`w-full text-left px-3 py-1.5 text-sm ${
                i === marcada ? 'bg-secondary/10 text-primary' : 'text-primary'
              } ${elegida ? 'font-semibold' : ''}`}
            >
              {p.valor}
              {p.grupo && <span className="block text-[10px] text-muted leading-tight">{p.grupo}</span>}
            </button>
          </li>
        );
      })}
    </ul>,
    document.body,
  ) : null;

  return (
    <div ref={refCampo} className="relative">
      <input
        {...rest}
        id={idCampo}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-autocomplete="list"
        disabled={disabled}
        value={mostrado}
        placeholder={placeholder}
        title={fueraDeCatalogo ? `«${actual}» no está en el catálogo` : rest.title}
        onFocus={() => { if (!disabled) setAbierto(true); }}
        // AL SALIR DEL CAMPO SE OLVIDA LO ESCRITO. Sin esto, escribir algo que
        // no casa y marcharse con el tabulador dejaba el filtro puesto en el
        // estado: al volver al campo la lista salía VACÍA, con el aspecto de que
        // el catálogo se hubiera quedado sin opciones. Es seguro ponerlo aquí
        // porque escoger una opción y pulsar la × usan onMouseDown con
        // preventDefault, así que ninguno de los dos llega a quitar el foco.
        onBlur={() => { setAbierto(false); setTexto(''); }}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onKeyDown={alTeclear}
        className={`${className} ${fueraDeCatalogo ? 'border-warning' : ''} pr-7`}
      />

      {/* Limpiar: es el equivalente de volver a la opción vacía del <select>. */}
      {actual && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Quitar la selección"
          onMouseDown={(ev) => { ev.preventDefault(); onChange?.(''); setTexto(''); }}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded text-muted hover:text-error"
        >
          <X size={12} aria-hidden="true" />
        </button>
      )}
      {!actual && (
        <ChevronDown
          size={14}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          aria-hidden="true"
        />
      )}

      {lista}
    </div>
  );
}

export default BuscadorLista;
