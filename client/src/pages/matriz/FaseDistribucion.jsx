// ── FASE 2 · REPARTO ────────────────────────────────────────────────────────
//
// «Reparte lo que hay. Lo que no alcance queda como faltante del cliente.»
//
// La Fase 1 captura la demanda entera, aunque no alcance —ese es el cambio
// semántico que sostiene el módulo—. Aquí se decide, producto por producto, a
// quién le toca cuánto. Es la MISMA tabla densa de la Fase 1 con el agrupador
// girado, y esa correspondencia columna a columna es deliberada: es la mitad del
// aprendizaje gratis.
//
// TRES REGLAS QUE NO SE NEGOCIAN Y QUE ESTÁN REPARTIDAS POR TODO ESTE ARCHIVO:
//
//  1. Lo escaso llega EN CERO, sin sugerencia. Ella reparte a dedo justamente
//     cuando no alcanza; precargarle un número la obligaría a leer y desmentir
//     cifras que no puso. Lo que sí alcanza llega repartido al 100% y nace
//     «listo»: devolverle también ese trabajo sería trabajo inventado.
//  2. El dinero NO se calcula aquí. Sale de `totalesDeReparto`, que proyecta el
//     mismo estado `filas` de la Fase 1 con las cantidades repartidas y lo pasa
//     por la `totalesFila` de siempre. Este repo ya tuvo el bug de dos fórmulas
//     cobrando distinto y está documentado en cotizacion.js.
//  3. Dejar mercancía sin repartir NO bloquea nada. Puede estar guardándose
//     pacas a propósito, y eso es una decisión de negocio. Se avisa en el
//     contador y en el confirm, que es donde se avisa lo que no se prohíbe.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardBody, Button, EmptyState } from '../../components/common';
import { claveAsignacion, claveStock, normTxt } from '../../lib/matriz';
import { formatCOP } from '../../lib/money';
import { RAYA_CABECERA } from './comun';
import GrupoProducto from './GrupoProducto';
import CintaClientes from './CintaClientes';
import {
  ArrowLeft, Search, Save, Package, Users, AlertTriangle, RefreshCw, PackageOpen,
} from 'lucide-react';

// El mismo useDebounce que ya tienen Clientes, Pacas, Ventas y Catálogo. Se
// copia en cada pantalla que lo necesita porque este proyecto no tiene carpeta
// de hooks y añadir una para tres líneas no compensa; es el patrón del repo.
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** «10:42» — la hora de la lectura del inventario, que va SIEMPRE a la vista. */
const horaDe = (iso) => {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
};

// ── POR QUÉ ESTE COMPONENTE ES UN React.memo ────────────────────────────────
//
// Estaba sin memoizar y era el agujero de rendimiento más caro de la pantalla.
// La Fase 2 NO se desmonta al volver a los pedidos: se oculta con `hidden`,
// porque desmontar y remontar cientos de <tbody> con sus <select> en cada ida y
// vuelta es un congelón perceptible y el diseño promete que volver es gratis.
// El precio de esa promesa es que, sin memo, a partir del primer «Volver a los
// pedidos» CADA TECLA de la Fase 1 volvía a ejecutar este componente entero —la
// barra, la cinta de clientes, la cabecera, el pie y el recorrido de los veinte
// productos— para pintar exactamente lo mismo, oculto. No fallaba nada: la
// pantalla se volvía melaza justo en el escenario que el diseño vende como
// gratuito, que es la peor forma de fallar porque nadie sabe a qué culpar.
//
// EL MEMO SÓLO AGUANTA SI TODAS LAS PROPS QUE BAJA EL ORQUESTADOR TIENEN
// IDENTIDAD ESTABLE. Ninguna puede ser una función en línea, un objeto literal
// ni un array recreado en el render del padre. Por eso allí los memos del dinero
// (`preciosPorAsignacion`, `descuentosPorCliente`, `totalesReparto`) devuelven el
// objeto anterior mientras se está en la Fase 1, y por eso `crearCotizaciones` lee
// `filas`, la tasa, el transporte y la validez de sus refs espejo en vez de
// llevarlos en las dependencias del useCallback: cualquiera de ellos en las
// dependencias devuelve el problema entero sin que nada se vea roto.
const FaseDistribucion = memo(function FaseDistribucion({
  oculto, productos, asignado, precios, descuentos, totales, clientes,
  listos, cambiados, tocados, abiertos, faltantesFallo, sinFaltante,
  problemas, problemasSueltos, stockLeidoEn, avisoStock, ajustados,
  enviando, releyendo, numeroReparto,
  onVolver, onReleer, onCantidad, onCriterio, onVaciar, onListo, onAbrir,
  onCuentaFaltante, onAceptarPropuestas, onCrear,
}) {
  const [buscar, setBuscar] = useState('');
  const [soloNoAlcanzan, setSoloNoAlcanzan] = useState(false);
  const [clienteResaltado, setClienteResaltado] = useState(null);
  const buscarLento = useDebounce(buscar, 300);

  // ── Las cantidades de cada grupo, con identidad estable ───────────────────
  // Mismo truco de firma que `cacheAvisos` en la Fase 1, y por el mismo motivo:
  // `GrupoProducto` es un React.memo y el arreglo de valores es su prop más
  // gorda. Si se recreara en cada tecla, teclear en un producto repintaría los
  // veinte, con sus cientos de <input> dentro, y no fallaría nada: sólo se
  // volvería melaza.
  const cacheValores = useRef(new Map());
  const valoresPorProducto = useMemo(() => {
    const out = new Map();
    for (const p of productos) {
      const clave = claveStock(p.referencia, p.calidad);
      const arr = (p.clientes || []).map(
        (c) => Math.max(0, num(asignado.get(claveAsignacion(c.cliente_id, p.referencia, p.calidad)))),
      );
      const firma = arr.join(',');
      const previo = cacheValores.current.get(clave);
      if (previo && previo.firma === firma) {
        out.set(clave, previo.valor);
      } else {
        cacheValores.current.set(clave, { firma, valor: arr });
        out.set(clave, arr);
      }
    }
    return out;
  }, [productos, asignado]);

  // Cuentas por producto que necesitan la barra, el orden y el pie. Se hacen de
  // una pasada y no dentro de cada grupo: la barra tiene que saber cuántas
  // decisiones faltan y si alguien se pasó ANTES de pintar la tabla.
  const cuentas = useMemo(() => {
    const m = new Map();
    for (const p of productos) {
      const clave = claveStock(p.referencia, p.calidad);
      const vals = valoresPorProducto.get(clave) || [];
      const pedido = (p.clientes || []).reduce((s, c) => s + Math.max(0, num(c.pedida)), 0);
      const repartido = vals.reduce((s, n) => s + Math.max(0, num(n)), 0);
      const disponibles = Math.max(0, num(p.disponibles));
      m.set(clave, {
        clave, pedido, repartido, disponibles,
        alcanza: pedido <= disponibles,
        exceso: Math.max(0, repartido - disponibles),
        falta: Math.max(0, pedido - disponibles),
      });
    }
    return m;
  }, [productos, valoresPorProducto]);

  // ── Las cuentas de la barra y del pie, memoizadas ─────────────────────────
  // Vivían a cuerpo de componente y se rehacían ENTERAS en cada render, y este
  // componente re-renderiza con cada tecla del reparto: tres recorridos de todos
  // los productos para pintar tres números que casi nunca cambian al teclear.
  //
  // «porDecidir» se llamaba con la palabra prohibida del módulo, la que en esta
  // aplicación ya significa otras tres cosas (pedido del portal, cotización y
  // despacho por confirmar). El nombre del identificador importa tanto como el
  // texto: un nombre que se lee distinto de lo que dice la interfaz es cómo la
  // palabra vuelve a colarse a la pantalla en el cambio siguiente, cuando a
  // alguien le parezca natural pintar la variable tal como se llama.
  const porDecidir = useMemo(
    () => productos.filter((p) => !listos.has(claveStock(p.referencia, p.calidad))),
    [productos, listos],
  );
  const excesos = useMemo(
    () => productos.filter((p) => (cuentas.get(claveStock(p.referencia, p.calidad))?.exceso || 0) > 0),
    [productos, cuentas],
  );
  const noAlcanzan = useMemo(
    () => productos.filter((p) => !(cuentas.get(claveStock(p.referencia, p.calidad))?.alcanza)),
    [productos, cuentas],
  );

  // Los que se reajustaron solos y ella todavía no ha revisado. Alimenta el chip
  // pulsable de la barra; sale de `cambiados` y no de `ajustados` a propósito,
  // porque `cambiados` se vacía producto a producto según los va marcando listos
  // y el chip tiene que apagarse cuando ya no queda nada que revisar. Se filtra
  // sobre `productos` y no sobre `ordenados` para que el chip siga contando lo
  // que el buscador esté escondiendo: de eso se encarga `irAlProducto`.
  const paraRevisar = useMemo(
    () => productos.filter((p) => cambiados.has(claveStock(p.referencia, p.calidad))),
    [productos, cambiados],
  );

  // ── ORDEN, rígido y no configurable ───────────────────────────────────────
  // 1. Los que cambiaron (el inventario se movió o ella volvió a tocar pedidos).
  // 2. Los que no alcanzan, por faltante descendente; empate por pedido.
  // 3. Los que alcanzan, alfabéticos.
  //
  // Ojo con lo que NO entra en las dependencias: `asignado`. El orden no se
  // recalcula mientras teclea. Ver la fila irse al final con el dedo puesto en
  // la pantalla es exactamente cómo se pierde el sitio y se confirma el que no
  // era. Un producto marcado «listo» tampoco baja: sólo cambia de aspecto.
  const ordenados = useMemo(() => {
    const q = normTxt(buscarLento);
    const lista = productos.filter((p) => {
      const clave = claveStock(p.referencia, p.calidad);
      const c = cuentas.get(clave);
      if (soloNoAlcanzan && c?.alcanza) return false;
      if (!q) return true;
      // El buscador filtra DE VERDAD. La regla heredada de la Fase 1 («nunca
      // esconder lo que ya tiene trabajo») protege allí trabajo YA HECHO; aquí
      // protegería trabajo POR HACER, que no es lo mismo, y un buscador que
      // sigue enseñando tres productos que no son «mixta» dejó de servir. Lo que
      // se esconde se cuenta debajo del buscador.
      if (normTxt(p.referencia).includes(q) || normTxt(p.calidad).includes(q)) return true;
      return (p.clientes || []).some((cl) => normTxt(cl.cliente_nombre).includes(q));
    });

    const rango = (p) => {
      const clave = claveStock(p.referencia, p.calidad);
      if (cambiados.has(clave)) return 0;
      return cuentas.get(clave)?.alcanza ? 2 : 1;
    };

    return lista.sort((a, b) => {
      const ra = rango(a);
      const rb = rango(b);
      if (ra !== rb) return ra - rb;
      const ca = cuentas.get(claveStock(a.referencia, a.calidad)) || {};
      const cb = cuentas.get(claveStock(b.referencia, b.calidad)) || {};
      if (ra !== 2) {
        if ((cb.falta || 0) !== (ca.falta || 0)) return (cb.falta || 0) - (ca.falta || 0);
        if ((cb.pedido || 0) !== (ca.pedido || 0)) return (cb.pedido || 0) - (ca.pedido || 0);
      }
      return String(a.referencia).localeCompare(String(b.referencia), 'es')
        || String(a.calidad || '').localeCompare(String(b.calidad || ''), 'es');
    });
    // `cuentas` cambia con cada tecla (lleva lo repartido), pero el orden sólo
    // usa de él lo que NO se mueve al teclear: `alcanza` y `falta` salen de lo
    // pedido y lo disponible. Se deja fuera de las dependencias a propósito para
    // que la lista no se reordene bajo el dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, listos, cambiados, soloNoAlcanzan, buscarLento]);

  // El primero de los reajustados TAL COMO SE VE en la tabla, que es a donde
  // tiene que saltar el chip. Los reajustados suben al principio del orden, así
  // que casi siempre es el primer <tbody>; se cae a la lista sin ordenar por si
  // el buscador los está escondiendo a todos, y de ahí ya se encarga
  // `irAlProducto` de quitar el filtro.
  const primeroPorRevisar = useMemo(
    () => ordenados.find((o) => cambiados.has(claveStock(o.referencia, o.calidad))) || paraRevisar[0] || null,
    [ordenados, cambiados, paraRevisar],
  );

  // Decisiones de reparto que el filtro está escondiendo. Sin esta línea, un
  // filtro puesto y olvidado deja el contador diciendo «te faltan 3» con la
  // tabla vacía y sin ninguna explicación. Es un filter anidado sobre todos los
  // productos, así que va en un useMemo: sólo puede cambiar cuando cambia el
  // filtro o cuando ella marca un producto como listo, nunca al teclear.
  // (Este comentario había quedado colgado sobre el hook de al lado al meter el
  // chip entre los dos; descrito el cálculo que no era, se revierte solo.)
  const ocultasPorDecidir = useMemo(() => porDecidir.filter(
    (p) => !ordenados.some((o) => claveStock(o.referencia, o.calidad) === claveStock(p.referencia, p.calidad)),
  ).length, [porDecidir, ordenados]);

  // Los que se quedan sin nada, con NOMBRE: es la línea que evita que se entere
  // el cliente antes que ella. Es el cálculo más caro del componente —recorre
  // TODOS los clientes, hace dos lookups de Map por cliente y arma una plantilla
  // de texto por cada uno—, así que va memoizado: sólo se rehace cuando cambian
  // de verdad los totales del reparto, no en cada render.
  const sinNada = useMemo(() => clientes
    .filter((c) => {
      const t = totales.clientes.get(c.id) || totales.clientes.get(String(c.id));
      return t && t.pedidas > 0 && t.repartidas === 0;
    })
    .map((c) => {
      const t = totales.clientes.get(c.id) || totales.clientes.get(String(c.id)) || {};
      return `${c.nombre} no recibe nada: le quedan faltando ${t.faltando || 0}`;
    }), [clientes, totales]);

  const hora = horaDe(stockLeidoEn);
  const puedeCrear = excesos.length === 0 && (totales.unidades > 0 || totales.faltando > 0);

  // Lo que necesitan los manejadores estables sin convertirse ellos mismos en
  // inestables. `GrupoProducto` y `CintaClientes` son React.memo: un manejador
  // que cambiara de identidad en cada render los repintaría todos con cada
  // tecla, que es el bug silencioso número uno de esta pantalla.
  const vivoRef = useRef({ ordenados, listos, clienteResaltado });
  vivoRef.current = { ordenados, listos, clienteResaltado };

  // Al volver a los pedidos se le dice al orquestador DE QUÉ CLIENTE venía, para
  // que allá se recupere el scroll de la Fase 1 y se resalte dos segundos su
  // fila. Volver a la cabecera de una tabla de doscientos clientes con el dedo
  // puesto en el que estaba mirando es cómo se pierde el sitio; el diseño pide
  // exactamente lo contrario de lo que hacía el `scrollTo({ top: 0 })`.
  const volver = useCallback(() => { onVolver(vivoRef.current.clienteResaltado); }, [onVolver]);

  // Llevar el ojo a un producto concreto: es lo que hacen el chip «N producto(s)
  // para revisar» de la barra y el motivo pulsable del pie. Los dos usan el id
  // `grupo-<claveStock>` que ya está en el DOM, igual que `saltar` con
  // Ctrl+Enter.
  //
  // Si el filtro lo está escondiendo no hay <tbody> al que saltar, y un botón
  // que no hace nada al pulsarlo es peor que no tener botón. Se quita el filtro
  // y el salto queda APUNTADO para cuando la fila exista. No sirve un
  // setTimeout: el buscador tiene 300 ms de retardo, así que el salto llegaría
  // antes que la fila y volvería a no pasar nada.
  const saltoApuntado = useRef(null);
  const irAlProducto = useCallback((clave) => {
    const destino = document.getElementById(`grupo-${clave}`);
    if (destino) {
      destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    saltoApuntado.current = clave;
    setBuscar('');
    setSoloNoAlcanzan(false);
  }, []);

  useEffect(() => {
    const clave = saltoApuntado.current;
    if (!clave) return;
    const destino = document.getElementById(`grupo-${clave}`);
    if (destino) {
      saltoApuntado.current = null;
      destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    // Sin filtro puesto y sin fila: ese producto ya no está en la tabla. El
    // salto se olvida aquí mismo en vez de quedarse esperando y dispararse solo
    // dentro de diez minutos, cuando ella escriba cualquier cosa en el buscador.
    if (!buscarLento && !soloNoAlcanzan) saltoApuntado.current = null;
  }, [ordenados, buscarLento, soloNoAlcanzan]);

  // Pulsar una tarjeta de la cinta resalta las filas de ese cliente y lleva el
  // ojo a la primera. Nunca esconde nada: filtrar la tabla al cliente escogido
  // dejaría fuera de la vista el resto del reparto de ese producto, que es justo
  // contra lo que se está decidiendo.
  const resaltar = useCallback((clienteId) => {
    setClienteResaltado(clienteId);
    if (clienteId == null) return;
    window.setTimeout(() => {
      const fila = document.querySelector(`[data-cliente-fila="${clienteId}"]`);
      if (fila) fila.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
  }, []);

  // Ctrl+Enter: confirma el grupo y salta al siguiente por decidir. Ningún
  // atajo es el único camino —«Listo» y el salto tienen botón visible— porque de
  // pie en la bodega con una tableta no hay Ctrl ni Esc.
  const saltar = useCallback((clave) => {
    onListo(clave, true);
    const { ordenados: lista, listos: hechos } = vivoRef.current;
    const siguiente = lista.find((p) => {
      const k = claveStock(p.referencia, p.calidad);
      return k !== clave && !hechos.has(k);
    });
    if (!siguiente) return;
    const destino = document.getElementById(`grupo-${claveStock(siguiente.referencia, siguiente.calidad)}`);
    if (destino) destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [onListo]);

  return (
    <>
      {/* EL REPARTO ES UNA SOLA PANTALLA, NO UN DOCUMENTO.
          Antes esto era una columna que fluía con la página, y para llegar a un
          producto había que rodar dos ruedas distintas: la de la página y la de
          la tabla. Con la barra pegada a 64px y la tabla limitada a
          calc(100vh-330px), la suma de las dos pasaba del alto de la ventana
          siempre, así que las dos existían a la vez y ninguna llegaba sola al
          final. Ahora la altura se reparte de arriba abajo —cabecera fija,
          tabla flexible, pie fijo— y sólo la tabla scrollea. */}
      <div className={`flex flex-col flex-1 min-h-0 ${oculto ? 'hidden' : ''}`}>
        {/* ── Cabecera del reparto ────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-3 pb-2 bg-cream border-b border-border/60">
          <div className="flex flex-wrap items-center gap-3">
            {/* Sin confirmación: volver no destruye nada y pedirle permiso cada
                vez la enseñaría a no leer los diálogos. Y no dice «Atrás»: tiene
                que prometer que lo capturado sigue ahí. */}
            <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={volver} disabled={enviando}>
              Volver a los pedidos
            </Button>

            <div className="flex-1 min-w-[200px] max-w-md">
              <label htmlFor="matriz-buscar-reparto" className="sr-only">Buscar producto o cliente</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <input
                  id="matriz-buscar-reparto"
                  type="search"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar producto o cliente…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={soloNoAlcanzan}
                onChange={(e) => setSoloNoAlcanzan(e.target.checked)}
                className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/30"
              />
              <span className="text-xs font-medium text-primary">
                Sólo los que no alcanzan ({noAlcanzan.length})
              </span>
            </label>

            {/* EL SELLO DE LA LECTURA VA SIEMPRE, no sólo cuando falla. En el
                caso normal —que es el peligroso— ella no tiene otra forma de
                saber si su verdad es de hace un minuto o de hace una hora. */}
            <div className="ml-auto flex items-center gap-2 text-[11px] text-muted">
              <span>{hora ? `Inventario leído a las ${hora}` : 'Inventario sin sello de hora'}</span>
              <button
                type="button"
                onClick={onReleer}
                disabled={releyendo || enviando}
                className="inline-flex items-center gap-1 font-semibold text-secondary hover:underline underline-offset-2 disabled:opacity-50"
              >
                <RefreshCw size={12} className={releyendo ? 'animate-spin' : ''} aria-hidden="true" />
                {releyendo ? 'Leyendo…' : 'Volver a leer'}
              </button>
            </div>
          </div>

          {/* Fila 2: el contador. No hay tira de KPIs a propósito: la cinta de
              clientes ES la fila de indicadores y es más útil que cuatro
              tarjetas genéricas repitiendo lo que dice esta línea. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2" role="status">
            {porDecidir.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-warning">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                Te faltan {porDecidir.length} decisión(es) de reparto
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true" />
                Ya está todo repartido
              </span>
            )}
            <span className="text-xs text-muted tabular-nums">
              {totales.pedidas} pedidas · {totales.unidades} repartidas
              {totales.faltando > 0
                ? ` · ${totales.faltando} faltando a ${totales.clientesConFaltante} cliente(s)`
                : ' · nadie queda faltando'}
            </span>
            {/* EL CHIP QUE SALTA AL PRIMER REAJUSTE. La franja de reconciliación
                ya avisa de que se reajustó el reparto de N productos y el orden
                ya los sube al principio, pero con la tabla desplazada —que es
                donde ella está siempre: reajusta al releer el inventario, no al
                abrir la pantalla— el aviso hablaba de un cambio que había que ir
                a buscar a mano por veinte tbody. El chip lo pone a un clic. */}
            {paraRevisar.length > 0 && primeroPorRevisar && (
              <button
                type="button"
                onClick={() => irAlProducto(claveStock(primeroPorRevisar.referencia, primeroPorRevisar.calidad))}
                title={`Ir a ${primeroPorRevisar.referencia} / ${primeroPorRevisar.calidad || 'sin calidad'},`
                  + ' el primero de los que reajusté solo. Se quitan de aquí según los vas marcando listos.'}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning bg-warning/15 hover:bg-warning/25 px-2 py-0.5 rounded-full"
              >
                <AlertTriangle size={11} aria-hidden="true" />
                {paraRevisar.length} producto(s) para revisar
              </button>
            )}
            {porDecidir.length > 0 && (
              // Sí, esto permite despachar la ronda con un clic. Pero es un clic
              // SUYO sobre un botón que dice exactamente lo que hace y con las
              // cifras delante. Lo que no puede pasar es que nadie decida.
              <Button size="sm" variant="ghost" onClick={onAceptarPropuestas} disabled={enviando}>
                Repartir a prorrata los {porDecidir.length} que faltan
              </Button>
            )}
          </div>

          <CintaClientes
            clientes={clientes}
            totales={totales.clientes}
            problemas={problemas}
            seleccionado={clienteResaltado}
            onSeleccionar={resaltar}
          />
        </div>

        {/* Los avisos van en su propia banda, fuera del scroll de la tabla: son
            cortos, se leen una vez y no tienen por qué empujar el reparto fuera
            de la pantalla. Si no hay ninguno, la banda desaparece. */}
        <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-2 space-y-2 empty:hidden">

        {/* ── EL LIBRO DE FALTANTES NO SE PUDO LEER ──────────────────────────
            La bandera llegaba hasta `GrupoProducto` y pintaba el «—» con su
            title en la columna «Le faltaba», pero la Fase 2 no lo decía en
            ninguna parte: quien cruce a repartir sin haber leído el aviso de la
            Fase 1 —que es lo normal, porque cruza media hora después— se
            encuentra veinte guiones seguidos y los lee como «no le debo nada a
            nadie». Es exactamente la mentira que este módulo existe para
            impedir, y la regla de oro que ya cumplen CarteraCliente.jsx y
            ClienteDashboard.jsx: ante un fallo de consulta no se pinta un cero,
            se pinta el fallo. Mismo tono que la franja de la Fase 1. */}
        {faltantesFallo && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning" role="status">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0">
              No pude leer lo que quedó faltando de repartos anteriores, así que la columna
              {' '}«Le faltaba» va en «—» para todo el mundo. Que no aparezca el aviso NO significa
              que no le debas nada a nadie: repartir así puede dejar esperando otra vez a quien ya
              llevaba esperando.
            </span>
          </div>
        )}

        {/* La relectura del inventario falló o es la vieja: se cruza igual, pero
            se dice con todas las letras. Bloquearla aquí la dejaría con la
            matriz entera tecleada y sin salida. */}
        {avisoStock && (
          <div className="flex flex-wrap items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning" role="status">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0">{avisoStock}</span>
            <button
              type="button"
              onClick={onReleer}
              disabled={releyendo}
              className="font-semibold underline underline-offset-2 disabled:opacity-50"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Lo que se reajustó solo. Cambiarle un número a la callada a alguien
            que lleva media hora repartiendo a dedo es exactamente lo que hace
            que deje de confiar en la pantalla. */}
        {ajustados.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning" role="status">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">
                Reajusté el reparto de {ajustados.length} producto(s) porque cambiaron los pedidos o lo disponible.
              </p>
              <p className="text-[11px] mt-0.5">
                {ajustados.slice(0, 3).map((a, i) => (
                  <span key={`${a.referencia}|${a.calidad}`}>
                    {i > 0 && ' · '}
                    <strong className="font-semibold">{a.referencia} / {a.calidad}</strong>
                    {a.descartado ? ' ya no lo pide nadie' : ` de ${a.antes} a ${a.ahora}`}
                  </span>
                ))}
                {ajustados.length > 3 && ` · +${ajustados.length - 3} más`}
              </p>
            </div>
          </div>
        )}

        {problemasSueltos.length > 0 && (
          <div className="p-3 rounded-xl border border-error/40 bg-error/10 space-y-1">
            {problemasSueltos.map((t, i) => (
              <p key={i} className="text-xs text-error flex items-start gap-1.5">
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t}</span>
              </p>
            ))}
          </div>
        )}

        </div>

        {/* ── La tabla del reparto ────────────────────────────────────────── */}
        {productos.length === 0 ? (
          <div className="flex-1 min-h-0 overflow-auto px-4 sm:px-6 lg:px-8 py-3">
            <Card>
              <CardBody>
                <EmptyState
                  icon={PackageOpen}
                  title="No hay nada que repartir"
                  description="Vuelve a los pedidos y anota lo que pidió cada cliente. Aquí sólo aparecen los productos que alguien pidió."
                />
              </CardBody>
            </Card>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-6 lg:px-8 pt-2 pb-3">
            {ocultasPorDecidir > 0 && (
              <p className="text-xs text-warning flex-shrink-0 mb-2">
                {/* «decisión(es) de reparto»: aquí había una palabra prohibida
                    en todo el módulo, la que en esta misma aplicación ya
                    significa otras tres cosas (pedido del portal, cotización y
                    despacho por confirmar). Y con este texto la línea casa
                    palabra por palabra con el contador de la barra —«Te faltan N
                    decisión(es) de reparto»—: son la misma cuenta vista desde
                    dos sitios y tienen que leerse igual. */}
                {ocultasPorDecidir} decisión(es) de reparto ocultas por el filtro.{' '}
                <button
                  type="button"
                  onClick={() => { setBuscar(''); setSoloNoAlcanzan(false); }}
                  className="font-semibold underline underline-offset-2"
                >
                  Quitar el filtro
                </button>
              </p>
            )}

            {/* EL ÚNICO SITIO QUE SCROLLEA DE TODA LA FASE 2.
                `flex-1 min-h-0` en vez de un max-h con un número: el alto sale
                de lo que sobra después de la cabecera y el pie, así que crecer
                un aviso o plegar la cinta reparte el hueco solo, sin recalcular
                ninguna constante. El min-h-0 no es decorativo: sin él el hijo
                se niega a encogerse por debajo de su contenido y el scroll se
                escapa hacia arriba, al <main>. */}
            <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border/60 bg-surface">
              {/* 880 y no 980: con ocho columnas y los nombres partidos en dos
                  líneas en vez de cortados, la tabla entra entera en un portátil
                  de 1280 con el menú desplegado. El mínimo sigue existiendo para
                  que en tableta estrecha ruede de lado en vez de aplastarse. */}
              <table className="w-full min-w-[880px] text-sm">
                <caption className="sr-only">
                  Reparto por producto: dentro de cada producto, una fila por cada cliente que lo pidió
                  y la cantidad que se le entrega.
                </caption>
                <thead className="sticky top-0 z-[1]">
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-3 py-2 w-[22%] min-w-[200px]">Producto</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[170px]">Cliente</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-1 py-2 w-[64px]">Pidió</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-1 py-2 w-[76px]">Le faltaba</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-1 py-2 w-[108px]">Le doy</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[88px]">Queda faltando</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[96px]">Precio</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[112px]">Valor</th>
                  </tr>
                </thead>

                {ordenados.map((p) => {
                  const clave = claveStock(p.referencia, p.calidad);
                  return (
                    <GrupoProducto
                      key={clave}
                      producto={p}
                      valores={valoresPorProducto.get(clave)}
                      precios={precios}
                      descuentos={descuentos}
                      listo={listos.has(clave)}
                      cambiado={cambiados.has(clave)}
                      tocado={tocados.has(clave)}
                      abierto={abiertos.has(clave)}
                      faltantesFallo={faltantesFallo}
                      sinFaltante={sinFaltante}
                      clienteResaltado={clienteResaltado}
                      deshabilitado={enviando}
                      onCantidad={onCantidad}
                      onCriterio={onCriterio}
                      onVaciar={onVaciar}
                      onListo={onListo}
                      onAbrir={onAbrir}
                      onCuentaFaltante={onCuentaFaltante}
                      onSaltar={saltar}
                    />
                  );
                })}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Pie del reparto ─────────────────────────────────────────────────
          Ya no es pegajoso: en una pantalla que no scrollea, «pegajoso» y
          «abajo del todo» son el mismo sitio, y sticky sobre un contenedor sin
          scroll es una promesa que no se cumple. Ahora es una banda fija que
          se lleva el alto que necesita antes de que la tabla reparta el resto. */}
      <div className={`flex-shrink-0 px-4 sm:px-6 lg:px-8 pb-3 ${oculto ? 'hidden' : ''}`}>
        <Card className="border-secondary/40 shadow-lg">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" role="status">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Users size={14} aria-hidden="true" />
                    <strong className="text-primary tabular-nums">{totales.numClientes}</strong> cliente(s)
                  </span>
                  <span className="flex items-center gap-1.5 text-muted">
                    <Package size={14} aria-hidden="true" />
                    <strong className="text-primary tabular-nums">{totales.unidades}</strong> paca(s) repartidas
                  </span>
                  <span className="font-display text-xl font-bold text-primary tabular-nums">
                    {formatCOP(totales.total)}
                  </span>
                  {totales.faltando > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning bg-warning/15 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                      Quedan faltando {totales.faltando} paca(s) a {totales.clientesConFaltante} cliente(s)
                    </span>
                  )}
                </div>
                {sinNada.length > 0 && (
                  <p className="text-[11px] text-muted mt-1">
                    {sinNada.slice(0, 3).join(' · ')}
                    {sinNada.length > 3 ? ` · +${sinNada.length - 3} más` : ''}
                  </p>
                )}
                {numeroReparto && (
                  <p className="text-[11px] text-muted mt-1">Reparto {numeroReparto}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1">
                <Button onClick={onCrear} disabled={enviando || !puedeCrear} loading={enviando} icon={Save}>
                  {enviando
                    ? 'Creando…'
                    : `Crear ${totales.numClientes} cotización(es)`
                      + (totales.faltando > 0 ? ` y anotar ${totales.faltando} faltante(s)` : '')}
                </Button>
                {excesos.length > 0 ? (
                  // EL MOTIVO LLEVA EL FOCO AL PRODUCTO, NO PONE UN FILTRO.
                  // Antes hacía setBuscar(referencia): filtraba la tabla con
                  // 300 ms de retardo, escondía los otros diecinueve productos y
                  // dejaba puesto un filtro que ella tenía que acordarse de
                  // quitar después. Un botón que dice «hay un producto pasado»
                  // tiene que ENSEÑÁRSELO, que es lo que ya hace `saltar` con
                  // Ctrl+Enter y el mismo id `grupo-<claveStock>` del DOM.
                  <button
                    type="button"
                    onClick={() => irAlProducto(claveStock(excesos[0].referencia, excesos[0].calidad))}
                    className="text-[11px] text-warning max-w-xs text-right underline underline-offset-2"
                  >
                    Hay {excesos.length} producto(s) repartido(s) por encima de lo que hay
                    {` (${excesos[0].referencia} / ${excesos[0].calidad || 'sin calidad'})`}
                  </button>
                ) : !puedeCrear ? (
                  <span className="text-[11px] text-warning max-w-xs text-right">
                    Todavía no hay nada repartido ni nada que anotar como faltante.
                  </span>
                ) : (
                  <span className="text-[11px] text-muted max-w-xs text-right">
                    Aquí sí se apartan las pacas: cada cliente sale con lo que le repartiste.
                  </span>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
});

export default FaseDistribucion;
