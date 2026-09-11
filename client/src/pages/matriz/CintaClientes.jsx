// ── LA CINTA DE CLIENTES ────────────────────────────────────────────────────
//
// Es la fila 2 de su Excel y es el injerto más importante de la Fase 2. La
// pantalla reparte PRODUCTO por producto; la cotización que le llega al cliente
// es por CLIENTE. Sin esta cinta, mientras decide cuántas chaquetas le da a
// MARIA no hay forma de ver a MARIA entera —cuántas pacas lleva de toda la
// ronda, cuánto le queda faltando y cuánta plata suma—, y así es como se le
// manda a alguien una cotización de dos pacas con flete de dos pacas y se entera
// cuando el cliente reclama.
//
// Lleva además un aviso que ninguna propuesta tenía y que sale del negocio real:
// el flete es POR PACA y el descuento también, así que recortarle a alguien le
// cambia el total por tres lados a la vez. Si un cliente termina con tres pacas
// o menos y hay transporte por paca, la tarjeta lo dice con la cuenta hecha.
//
// PULSAR UNA TARJETA RESALTA, NUNCA ESCONDE. Filtrar la tabla al cliente
// escogido dejaría fuera de la vista el resto del reparto de ese producto, que
// es justo contra lo que ella está decidiendo. Se resaltan sus filas y se lleva
// el foco a la primera; el trabajo de los demás sigue ahí.

import { memo, useEffect, useState } from 'react';
import { formatCOP } from '../../lib/money';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const CLAVE_PLEGADA = 'bodeamericana.matriz.cinta.plegada';

const leerPlegada = () => {
  try {
    return window.localStorage.getItem(CLAVE_PLEGADA) === '1';
  } catch {
    // Con el almacenamiento del sitio bloqueado, LEER localStorage lanza
    // SecurityError; si eso ocurriera durante el render la pantalla se quedaría
    // en blanco con la matriz dentro. Sin memoria, la cinta nace desplegada.
    return false;
  }
};

// `vertical` la convierte en lista para la franja lateral del reparto. En
// horizontal era una tira que rodaba de lado en cuanto pasaban de seis o siete
// clientes; en columna caben todos, los nombres largos no se estrechan y la
// lista se lee de un vistazo, que es para lo que existe.
const CintaClientes = memo(function CintaClientes({
  clientes, totales, seleccionado, problemas, onSeleccionar, vertical = false,
}) {
  const [plegada, setPlegada] = useState(leerPlegada);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_PLEGADA, plegada ? '1' : '0');
    } catch {
      // Sin almacenamiento la cinta funciona igual, sólo no lo recuerda.
    }
  }, [plegada]);

  // Sólo los clientes que participan en esta ronda. Los cientos que no pidieron
  // nada no tienen tarjeta: la cinta es el resumen de lo que se está repartiendo,
  // no el listado de clientes.
  const enRonda = clientes.filter((c) => {
    const t = totales.get(c.id) || totales.get(String(c.id));
    return t && (t.pedidas > 0 || t.repartidas > 0);
  });

  if (!enRonda.length) return null;

  return (
    <div className={`border-t border-border/60 pt-2 ${vertical ? "xl:flex xl:flex-col xl:min-h-0 xl:flex-1 mt-2 xl:mt-0" : "mt-2"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Cómo va cada cliente
        </p>
        <button
          type="button"
          onClick={() => setPlegada((v) => !v)}
          aria-expanded={!plegada}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline underline-offset-2"
        >
          {plegada ? 'Ver la cinta' : 'Plegar'}
          {plegada ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronUp size={13} aria-hidden="true" />}
        </button>
      </div>

      {!plegada && (
        <div
          className={vertical
            // La lista es lo único que rueda dentro de la franja, y sólo
            // cuando de verdad no caben: con ocho clientes no aparece scroll.
            ? "flex gap-2 overflow-x-auto pb-1 mt-1 xl:flex-col xl:gap-1.5 xl:overflow-x-hidden xl:overflow-y-auto xl:min-h-0 xl:flex-1 xl:pb-0 xl:pr-0.5"
            : "flex gap-2 overflow-x-auto pb-1 mt-1"}
          role="status"
        >
          {enRonda.map((c) => {
            const t = totales.get(c.id) || totales.get(String(c.id)) || {};
            const repartidas = t.repartidas || 0;
            const pedidas = t.pedidas || 0;
            const faltando = t.faltando || 0;
            const sinNada = repartidas === 0;
            const conProblema = Boolean(problemas?.[String(c.id)]?.length);
            // El flete es por paca: con dos pacas puede salir más caro despachar
            // que dejarlo para la próxima. La cuenta va hecha en el title porque
            // es una decisión de negocio y no un error que haya que corregir.
            const fleteCaro = repartidas > 0 && repartidas <= 3 && (t.transporteUnitario || 0) > 0;
            const elegido = seleccionado != null && String(seleccionado) === String(c.id);

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSeleccionar(elegido ? null : c.id)}
                aria-pressed={elegido}
                title={
                  `${c.nombre}: ${repartidas} de ${pedidas} paca(s)`
                  + (faltando > 0 ? ` · le quedan faltando ${faltando}` : '')
                  + ` · ${formatCOP(t.total || 0)}`
                  + (fleteCaro
                    ? `. Con ${repartidas} paca(s) el flete son ${formatCOP((t.transporteUnitario || 0) * repartidas)}`
                      + ` sobre ${formatCOP(t.total || 0)}. Revisa si vale la pena despacharle.`
                    : '')
                }
                className={`flex-shrink-0 min-w-[128px] max-w-[196px]${vertical ? " xl:w-full xl:max-w-none xl:min-w-0" : ""} text-left rounded-xl border px-2 py-1.5 transition-colors ${
                  conProblema
                    ? 'border-error/50 bg-error/10'
                    : elegido
                      ? 'border-secondary bg-secondary/10'
                      : 'border-border/70 bg-surface hover:bg-primary/[0.03]'
                } ${sinNada ? 'opacity-60' : ''}`}
              >
                {/* Ancho elástico entre 128 y 196 en vez de fijo a 136, y el
                    nombre en dos líneas como mucho en vez de cortado: con el
                    ancho clavado, «DISTRIBUIDORA…» y «DISTRIBUCIONES…» se veían
                    igual, y son dos clientes distintos a los que se les está
                    repartiendo mercancía distinta. */}
                <p className="text-[11px] font-semibold text-primary leading-tight line-clamp-2">{c.nombre}</p>
                <p className="text-[11px] text-muted tabular-nums leading-tight">
                  <span className="font-semibold text-primary">{repartidas}</span>/{pedidas}
                  {faltando > 0 && (
                    <span className="ml-1 font-semibold text-warning">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning align-middle mr-0.5" aria-hidden="true" />
                      {faltando}
                    </span>
                  )}
                </p>
                <p className="text-[11px] font-semibold text-primary tabular-nums leading-tight">
                  {formatCOP(t.total || 0)}
                </p>
                {sinNada && (
                  <span className="inline-flex items-center text-[10px] font-medium text-warning bg-warning/15 px-1.5 py-0.5 rounded-full mt-0.5">
                    sin nada
                  </span>
                )}
                {!sinNada && fleteCaro && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/15 px-1.5 py-0.5 rounded-full mt-0.5">
                    <AlertTriangle size={9} aria-hidden="true" /> {repartidas} paca(s)
                  </span>
                )}
                {conProblema && (
                  <span className="inline-flex items-center text-[10px] font-semibold text-error bg-error/15 px-1.5 py-0.5 rounded-full mt-0.5">
                    no se creó
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default CintaClientes;
