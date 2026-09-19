// ── FASE 1 · EL PANEL DE EXISTENCIAS ────────────────────────────────────────
//
// «¿Qué me queda de Mixta Invierno?» es la pregunta que se hace con el cliente
// al teléfono, y hasta ahora no tenía dónde contestarse: la lista de referencias
// sumaba las calidades («Mixta Invierno · 30 disp») y la franja ámbar sólo
// enseñaba los tres primeros productos que no alcanzan. Este panel es la hoja
// entera: por referencia, cada calidad con lo que HAY en bodega, lo que PIDEN en
// esta ronda y lo que QUEDA.
//
// TRES DECISIONES QUE NO SON DE ESTILO:
//
//  1. Sin totales por referencia. Sumar calidades es exactamente el error que el
//     panel viene a corregir: 30 pacas de «Mixta Invierno» no le sirven a nadie
//     que pida Primera.
//  2. Tocar un producto NO esconde clientes. La regla de la Fase 1 es que un
//     cliente con ítems nunca desaparece de la tabla —si desapareciera, se
//     enviaría algo que ya no se ve—, así que en vez de filtrar se RESALTAN sus
//     líneas y se lista quién lo pidió, con un botón por cliente que lleva la
//     tabla hasta él.
//  3. Se pliega. La tabla de pedidos necesita sus 920px y en un portátil con el
//     menú abierto no queda sitio para las dos cosas a la vez; en pantalla ancha
//     va al lado, y en tableta flota encima y se cierra al tocar fuera.
//
// Va en `memo` por la misma razón que todo lo demás de este módulo: la Fase 1
// sigue montada mientras se reparte en la Fase 2, y las props que recibe sólo
// cambian cuando cambian los pedidos o el inventario.

import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { coincideBusqueda } from '../../lib/matriz';
import { Search, X } from 'lucide-react';

// Tres columnas de números con ancho fijo y la calidad con lo que sobre: así
// los números de todas las filas quedan alineados aunque la calidad se corte.
const REJILLA = 'grid grid-cols-[minmax(0,1fr)_2.25rem_2.5rem_3rem] items-baseline gap-x-1';

/** «−3» con el signo menos de verdad, no el guion: en tabular-nums se alinea. */
const conSigno = (n) => (n < 0 ? `−${Math.abs(n)}` : String(n));

const PanelExistencias = memo(function PanelExistencias({
  abierto, grupos, seleccionado, onSeleccionar, onIrACliente, onCerrar,
}) {
  const uid = useId();
  const [buscar, setBuscar] = useState('');
  const [soloPedido, setSoloPedido] = useState(false);
  const refBuscar = useRef(null);

  // El foco va al buscador cuando ELLA abre el panel, no al cargar la pantalla
  // con el panel ya abierto de la vez anterior: robarle el foco al entrar la
  // dejaría escribiendo en el buscador lo que iba para otra parte.
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    if (abierto && !abiertoAntes.current) refBuscar.current?.focus({ preventScroll: true });
    abiertoAntes.current = abierto;
  }, [abierto]);

  const visibles = useMemo(() => {
    const q = buscar.trim();
    return (grupos || [])
      .map((g) => ({
        ...g,
        calidades: g.calidades.filter((c) => (!soloPedido || c.piden > 0)
          && (!q || coincideBusqueda(`${g.referencia} ${c.calidad}`, q))),
      }))
      .filter((g) => g.calidades.length > 0);
  }, [grupos, buscar, soloPedido]);

  const vacio = !grupos || grupos.length === 0
    ? 'No hay pacas en bodega ni nada pedido todavía.'
    : buscar.trim()
      ? `Nada que se parezca a «${buscar.trim()}».`
      : 'Todavía no se ha pedido nada en esta ronda.';

  return (
    <>
      {/* En tableta el panel flota: el fondo lo cierra al tocar fuera, que es
          lo que se espera de algo que tapa la tabla. En pantalla ancha no hay
          fondo porque no tapa nada. */}
      {abierto && (
        <div className="fixed inset-0 z-30 bg-primary/20 xl:hidden" onClick={onCerrar} aria-hidden="true" />
      )}

      <aside
        id="matriz-existencias"
        aria-label="Existencias"
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          onCerrar();
        }}
        className={`${abierto ? 'flex' : 'hidden'} flex-col min-h-0 flex-shrink-0 bg-cream border-l border-border/60
          fixed inset-y-0 right-0 z-40 w-[min(320px,88vw)] shadow-xl
          xl:static xl:z-auto xl:w-[264px] xl:shadow-none`}
      >
        <div className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2 border-b border-border/60">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-primary">Existencias</h2>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar el panel de existencias"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-primary hover:bg-primary/5"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <label htmlFor={`${uid}-buscar`} className="sr-only">Buscar una referencia o calidad</label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
            <input
              ref={refBuscar}
              id={`${uid}-buscar`}
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Referencia o calidad…"
              className="w-full h-8 pl-8 pr-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={soloPedido}
              onChange={(e) => setSoloPedido(e.target.checked)}
              className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/30"
            />
            <span className="text-xs font-medium text-primary">Sólo lo pedido en esta ronda</span>
          </label>
        </div>

        {/* La cabecera de las columnas va fuera del scroll: con cincuenta
            referencias, bajar hasta la última y no saber cuál número es cuál
            obliga a volver arriba a mirarlo. */}
        <div className={`${REJILLA} flex-shrink-0 px-3 py-1.5 text-xs text-muted border-b border-border/60`} aria-hidden="true">
          <span>Calidad</span>
          <span className="text-right">Hay</span>
          <span className="text-right">Piden</span>
          <span className="text-right">Quedan</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {visibles.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted">{vacio}</p>
          ) : (
            visibles.map((g) => (
              // Un grupo y no un <section>: con cincuenta referencias, cincuenta
              // regiones con nombre entierran los demás puntos de referencia
              // del lector de pantalla.
              <div key={g.referencia} role="group" aria-label={g.referencia} className="border-b border-border/40 pb-1">
                <h3 className="px-3 pt-2 pb-0.5 text-sm font-semibold text-primary leading-tight break-words">
                  {g.referencia}
                </h3>
                <ul>
                  {g.calidades.map((c) => {
                    const elegido = seleccionado === c.clave;
                    // Ámbar sólo cuando hay algo que mirar: se pidió más de lo
                    // que hay, o queda un margen de 2 o menos de algo que sí se
                    // está pidiendo (el mismo tramo que el chip de la línea). Lo
                    // que nadie pidió va en el color del texto: una columna
                    // entera en verde deja de querer decir nada.
                    const atento = c.quedan < 0 || (c.piden > 0 && c.quedan <= 2);
                    return (
                      <li key={c.clave}>
                        <button
                          type="button"
                          aria-pressed={elegido}
                          aria-label={`${g.referencia} ${c.calidad}: hay ${c.hay}, piden ${c.piden}, quedan ${c.quedan}.`
                            + (elegido ? ' Toca otra vez para quitar el resaltado.' : ' Toca para ver quién lo pidió.')}
                          onClick={() => onSeleccionar(elegido ? null : c.clave)}
                          className={`${REJILLA} w-full px-3 py-1.5 text-left text-sm hover:bg-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary/40 ${
                            elegido ? 'bg-secondary/10' : ''
                          }`}
                        >
                          <span className={`truncate pl-2 ${c.hay === 0 ? 'text-muted' : 'text-primary'}`}>{c.calidad}</span>
                          <span className="text-right tabular-nums text-muted">{c.hay}</span>
                          <span className="text-right tabular-nums text-muted">{c.piden > 0 ? c.piden : '—'}</span>
                          <span className={`text-right tabular-nums font-semibold ${atento ? 'text-warning' : 'text-primary'}`}>
                            {conSigno(c.quedan)}
                          </span>
                        </button>

                        {elegido && (
                          <div className="px-3 pb-2 pt-0.5 bg-secondary/10">
                            {c.clientes.length > 0 ? (
                              <>
                                <p className="text-xs text-muted mb-1">
                                  Lo pidieron {c.clientes.length === 1 ? 'un cliente' : `${c.clientes.length} clientes`}. Sus líneas están resaltadas:
                                </p>
                                <ul className="flex flex-wrap gap-1">
                                  {c.clientes.map((cl) => (
                                    <li key={cl.id}>
                                      <button
                                        type="button"
                                        onClick={() => onIrACliente(cl.id)}
                                        title={`Llevar la tabla hasta ${cl.nombre}`}
                                        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border border-secondary/40 bg-surface text-xs text-primary hover:bg-secondary/10"
                                      >
                                        <span className="truncate max-w-[9rem]">{cl.nombre}</span>
                                        <span className="tabular-nums text-muted">{cl.cantidad}</span>
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="text-xs text-muted">Nadie lo ha pedido en esta ronda.</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <p className="flex-shrink-0 px-3 py-2 border-t border-border/60 text-xs text-muted leading-snug">
          Hay: pacas disponibles ahora. Piden: lo anotado en esta ronda, con las líneas completas. Quedan: hay menos piden.
        </p>
      </aside>
    </>
  );
});

export default PanelExistencias;
