// ── FASE 2 · un <tbody> por PRODUCTO ────────────────────────────────────────
//
// Es la MISMA tabla de la Fase 1 con el agrupador girado: allí un <tbody> por
// cliente con sus productos dentro; aquí un <tbody> por producto con sus
// clientes dentro. Las ocho columnas se corresponden una a una con las siete de
// la Fase 1 (Producto↔Cliente, Cliente↔Referencia, Pidió↔Calidad, Le doy↔Cant.,
// Precio↔Precio, Valor↔Subtotal), y esa correspondencia es la mitad del
// aprendizaje gratis: el ojo ya sabe dónde mirar.
//
// EL MEMO NO ES DECORATIVO. Una ronda trae veinte productos por decenas de
// clientes y la dueña teclea en una celda cada dos segundos. Sin `memo`, cada
// pulsación repintaría los veinte grupos enteros con sus cientos de <input>. El
// padre le pasa a cada grupo un arreglo `valores` con identidad estable —
// reutiliza el mismo mientras su contenido no cambie, con el truco de firma de
// `cacheAvisos`— así que sólo se repinta el grupo que se está tocando.
//
// LO QUE NO SE HACE AQUÍ, Y ES DELIBERADO: no se calcula dinero de la ronda. La
// columna VALOR de una fila es una multiplicación a la vista (lo repartido por
// el precio con descuento), pero los totales del pie y de la cinta salen de
// `totalesDeReparto`, que proyecta `filas` y la pasa por la `totalesFila` de
// siempre. Este repo YA tuvo el bug de dos fórmulas cobrando distinto en la fila
// y en el total, y está documentado en cotizacion.js.

import { memo, useId, useRef, useState } from 'react';
import { precioConDescuento } from '../../lib/cotizacion';
import { claveAsignacion, claveStock } from '../../lib/matriz';
import { formatCOP, formatNumero } from '../../lib/money';
import { formatFechaCorta } from '../../lib/fecha';
import { campo } from './comun';
import {
  Scale, Package, Check, RotateCcw, ChevronDown, ChevronRight, AlertTriangle, Ban,
} from 'lucide-react';

/** Unidades tecleadas: entero, nunca negativo, nunca NaN. Texto raro = 0. */
const soloEnteros = (v) => {
  const n = Math.round(Number(String(v ?? '').replace(/[^\d]/g, '')));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// LA CELDA «LE DOY», que es el único control editable de toda la Fase 2.
//
// Vive en su propio componente por una razón concreta: necesita estado LOCAL. La
// validación es en dos tiempos y mientras teclea se admite cualquier número —si
// con tope 4 la celda saltara a «4» al primer dígito, el segundo produciría
// basura—, así que el texto crudo tiene que poder ser distinto del número que ya
// está en el reparto. `texto === null` significa «enseña lo que diga el padre»,
// que es el caso normal y el que hace que los tres criterios de reparto (a
// prorrata, por orden, cubrir lo que faltó) se vean al instante en las celdas.
// ─────────────────────────────────────────────────────────────────────────────
function CeldaDoy({
  id, idSiguiente, idListo, valor, pedida, margen, etiqueta, deshabilitado,
  onCantidad, onSaltar,
}) {
  const [texto, setTexto] = useState(null);
  const [aviso, setAviso] = useState(null);
  const alEnfocar = useRef(0);

  // El tope de esta celda es el MENOR de los dos: lo que pidió el cliente y lo
  // que queda sin repartir del producto (contando lo que ya tiene esta misma
  // fila, que puede devolver). Son dos errores distintos y por eso llevan dos
  // mensajes distintos: uno habla del cliente y el otro de la bodega.
  const topePedido = Math.max(0, pedida);
  const topeStock = Math.max(0, valor + margen);
  const tope = Math.min(topePedido, topeStock);
  const visible = texto === null ? String(valor) : texto;
  const excede = soloEnteros(visible) > tope;

  const cerrar = () => {
    const n = soloEnteros(texto === null ? valor : texto);
    let final = n;
    let mensaje = null;
    if (final > topePedido) {
      final = topePedido;
      mensaje = `Lo bajé a ${final}: pidió ${topePedido}, no puedo darle más.`;
    }
    if (final > topeStock) {
      final = Math.max(0, topeStock);
      mensaje = `Lo bajé a ${final}: solo quedan ${Math.max(0, topeStock)} sin repartir.`;
    }
    setTexto(null);
    // EL AVISO SOBREVIVE AL RECORTE. Desaparecer justo en el instante en que se
    // le cambia el número a alguien es al revés de como debe ser: ella tiene que
    // ver qué pasó con lo que escribió, no descubrirlo al cuadrar el pie.
    setAviso(mensaje);
    if (final !== valor) onCantidad(final);
  };

  return (
    <div>
      <div className="flex items-center justify-end gap-1">
        <label htmlFor={id} className="sr-only">{etiqueta}</label>
        {/* type="text" con inputMode="numeric" y NO type="number", a propósito: en
            number la rueda del ratón cambia el valor al hacer scroll, y en una
            tabla de veinte productos se scrollea todo el rato. Un reparto que se
            mueve solo al bajar la página es un bug garantizado que además no deja
            rastro. */}
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={visible}
          disabled={deshabilitado}
          aria-label={etiqueta}
          aria-invalid={excede || undefined}
          onFocus={(e) => {
            alEnfocar.current = valor;
            setAviso(null);
            // Con la precarga, todas las celdas de lo que alcanza llegan con
            // número puesto; sin el select() ella estaría borrando con retroceso
            // cuarenta veces al día.
            e.target.select();
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            onCantidad(soloEnteros(e.target.value));
          }}
          onBlur={cerrar}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Esc devuelve ESA celda al valor que tenía al enfocarla. No es un
              // deshacer general: es la salida de «me equivoqué de fila».
              e.preventDefault();
              setTexto(null);
              setAviso(null);
              if (alEnfocar.current !== valor) onCantidad(alEnfocar.current);
              e.currentTarget.blur();
              return;
            }
            if (e.key !== 'Enter') return;
            e.preventDefault();
            cerrar();
            if (e.ctrlKey || e.metaKey) {
              // Ctrl+Enter confirma el grupo y salta al siguiente por decidir.
              onSaltar();
              return;
            }
            // Enter baja al siguiente cliente; en el último equivale a «Listo»,
            // que es lo que hace que se pueda repartir un producto entero sin
            // soltar el teclado.
            const destino = idSiguiente
              ? document.getElementById(idSiguiente)
              : document.getElementById(idListo);
            if (destino) destino.focus();
          }}
          className={campo(excede, 'w-[56px] px-1 h-9 text-right tabular-nums')}
        />
        {/* «[ 5]/8» se lee «le doy 5 de las 8 que pidió». Sin el sufijo hay que
            irse con el ojo dos columnas a la izquierda en cada fila. */}
        <span className="text-[10px] text-muted tabular-nums w-6 text-left" aria-hidden="true">
          /{topePedido}
        </span>
      </div>
      {/* El aviso del recorte se ve, no se esconde en un lector de pantalla: es
          la única prueba de que el número que ella escribió no es el que quedó.
          Y son DOS textos distintos porque son dos errores distintos —uno habla
          del cliente y el otro de la bodega—; con un solo mensaje genérico
          tendría que ir a mirar dos columnas para saber cuál de los dos topes le
          saltó. */}
      {aviso && (
        <p className="text-[10px] text-warning leading-tight mt-0.5 text-right" role="status">{aviso}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const GrupoProducto = memo(function GrupoProducto({
  producto, valores, precios, descuentos, listo, cambiado, tocado, abierto,
  faltantesFallo, sinFaltante, clienteResaltado, deshabilitado,
  onCantidad, onCriterio, onVaciar, onListo, onAbrir, onCuentaFaltante, onSaltar,
}) {
  const uid = useId();
  const clave = claveStock(producto.referencia, producto.calidad);
  const clientes = producto.clientes || [];

  const disponibles = Math.max(0, num(producto.disponibles));
  const pedidoTotal = clientes.reduce((s, c) => s + Math.max(0, num(c.pedida)), 0);
  const repartido = valores.reduce((s, n) => s + Math.max(0, num(n)), 0);
  const libre = disponibles - repartido;
  const exceso = Math.max(0, repartido - disponibles);
  const alcanza = pedidoTotal <= disponibles;
  // El faltante del grupo NO cuenta las líneas que ella apagó con la casilla
  // «esto no queda debiendo». Sumándolas, la fila de suma prometería anotar más
  // faltantes de los que el servidor va a escribir —`cuenta_faltante` viaja por
  // línea y el backend lo respeta—, y la pantalla mentiría en el sentido caro:
  // enseñando en pantalla una mercancía que en el libro no va a quedar anotada.
  const faltandoTotal = clientes.reduce((s, c, i) => {
    if (sinFaltante && sinFaltante.has(claveAsignacion(c.cliente_id, producto.referencia, producto.calidad))) return s;
    return s + Math.max(0, Math.max(0, num(c.pedida)) - Math.max(0, num(valores[i])));
  }, 0);
  const faltabaTotal = clientes.reduce((s, c) => s + Math.max(0, num(c.faltante_abierto)), 0);
  const hayFaltantesViejos = faltabaTotal > 0;
  const idListo = `${uid}-listo`;

  // El valor de una fila: lo repartido por el precio con descuento del cliente.
  // Las pacas de promoción NO reciben descuento encima —la promoción YA es el
  // precio rebajado— exactamente igual que en `totalesFila`, de donde sale el
  // total del pie. Si estas dos reglas se separaran, la suma de las filas y el
  // total dirían cosas distintas, que es el bug que este repo ya tuvo.
  const valorDeFila = (c, cantidad) => {
    const info = precios.get(claveAsignacion(c.cliente_id, producto.referencia, producto.calidad));
    const precio = info ? info.precio : num(c.precio_unitario);
    const promo = info ? info.esPromocion : Boolean(c.tiene_promocion);
    const desc = descuentos.get(String(c.cliente_id));
    const unitario = promo ? precio : precioConDescuento(precio, desc?.raw || 0, desc?.tipo);
    return { precio, promo, total: Math.max(0, cantidad) * unitario };
  };
  const valorGrupo = clientes.reduce((s, c, i) => s + valorDeFila(c, num(valores[i])).total, 0);

  // ── Los que alcanzan: UNA línea, no una franja plegada ────────────────────
  // La dueña dijo literalmente «tiene que ser todo accesible a la vista
  // enseguida sin tener que desplegar nada», así que estos no se meten los
  // diecisiete juntos dentro de un acordeón: cada uno conserva su propia línea
  // con su cuenta a la vista y un chevron para abrir sus clientes. Retenerle 3
  // pacas a propósito de algo que sí alcanza es una decisión de negocio legítima
  // y no puede exigir buscar dentro de una franja.
  if (alcanza && !abierto && !tocado && !cambiado) {
    return (
      <tbody id={`grupo-${clave}`} className="border-t border-border/70 bg-success/[0.05]">
        <tr>
          <td colSpan={7} className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Check size={13} className="text-success flex-shrink-0" aria-hidden="true" />
              <span className="font-medium text-primary">
                {producto.referencia} <span className="text-muted">· {producto.calidad || 'sin calidad'}</span>
              </span>
              <span className="text-[11px] text-muted tabular-nums">
                {repartido} paca(s) a {clientes.length} cliente(s) · nadie queda faltando
                {' · '}
                <span className={libre > 0 ? 'text-muted' : 'text-success'}>libre {Math.max(0, libre)}</span>
              </span>
              <button
                type="button"
                onClick={() => onAbrir(clave)}
                aria-expanded={false}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline underline-offset-2"
              >
                Ver los clientes <ChevronRight size={13} aria-hidden="true" />
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody
      id={`grupo-${clave}`}
      className={`border-t border-border/70 ${
        exceso > 0 ? 'bg-error/[0.04]' : listo ? 'bg-success/[0.04]' : cambiado ? 'bg-warning/[0.05]' : ''
      }`}
    >
      {clientes.map((c, i) => {
        const pedida = Math.max(0, num(c.pedida));
        const dado = Math.max(0, num(valores[i]));
        const queda = Math.max(0, pedida - dado);
        const faltaba = Math.max(0, num(c.faltante_abierto));
        const { precio, promo, total } = valorDeFila(c, dado);
        const claveLinea = claveAsignacion(c.cliente_id, producto.referencia, producto.calidad);
        // ¿Lo que le quede faltando en ESTA línea se anota en el libro? Por
        // defecto sí —«¿todo lo que no alcanza queda como faltante?» «Sí, todo»,
        // dijo la dueña—, con una casilla escondida para descartar un caso
        // suelto. Ese caso es concreto y pasa en la primera ronda: el cliente que
        // pide 50 sabiendo que hay 10. Sin la casilla, el libro se llena de
        // faltante falso y deja de servir para lo que existe.
        const cuenta = !(sinFaltante && sinFaltante.has(claveLinea));
        const info = precios.get(claveLinea);
        const origen = num(info?.origen ?? c.precio_unitario_origen);
        const puedeRespetar = origen > 0 && precio > origen && !info?.respetado;
        const resaltado = clienteResaltado != null && String(clienteResaltado) === String(c.cliente_id);
        const idCelda = `${uid}-doy-${i}`;
        const idSiguiente = i + 1 < clientes.length ? `${uid}-doy-${i + 1}` : '';
        // Lo que esta fila puede coger de más sin pasarse del disponible: lo que
        // queda libre en el grupo. Va aparte de lo que ya tiene ella misma
        // porque bajar su propio número siempre está permitido.
        const margen = libre;

        return (
          // `data-cliente-fila` es lo que usa la cinta para llevar el ojo (y el
          // scroll) hasta las filas del cliente que se pulsó. Va en el <tr> y no
          // en la celda porque lo que se resalta es la fila entera.
          <tr
            key={`${c.cliente_id}-${i}`}
            data-cliente-fila={c.cliente_id}
            className={resaltado ? 'bg-secondary/10' : ''}
          >
            {/* ── #1 EL PRODUCTO, una vez y cubriendo todas sus filas ─────── */}
            {i === 0 && (
              <td rowSpan={clientes.length + 1} className="px-3 py-2 align-top border-r border-border/40 w-[20%] min-w-[168px]">
                {/* Se parte en dos líneas, no se corta. Una referencia como
                    «mixta invierno dama» cortada a «mixta invier…» obliga a
                    parar el ojo y a pasar el ratón por encima para saber qué
                    está repartiendo, y en tableta no hay ratón que lo saque.
                    El alto de fila lo manda el producto, que es el que más
                    texto tiene, así que dejarlo envolver no descuadra nada. */}
                <p className="font-medium text-primary leading-tight break-words">
                  {producto.referencia}
                </p>
                <p className="text-[11px] text-muted leading-tight break-words">{producto.calidad || 'sin calidad'}</p>

                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {/* El chip de escasez dice el hecho completo en cuatro
                      palabras. «no queda ninguna» es un caso aparte del «no
                      alcanza» porque no hay nada que repartir: el grupo entero
                      es una decisión ya tomada. */}
                  {disponibles === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-error bg-error/15 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle size={9} aria-hidden="true" /> no queda ninguna
                    </span>
                  ) : alcanza ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success bg-success/15 px-1.5 py-0.5 rounded-full">
                      <Package size={9} aria-hidden="true" /> alcanza para todos
                    </span>
                  ) : (
                    <span
                      title={`Hay ${disponibles} pacas y entre todos piden ${pedidoTotal}. Reparte las que hay; lo demás queda faltando.`}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/15 px-1.5 py-0.5 rounded-full"
                    >
                      <Scale size={9} aria-hidden="true" />
                      hay {disponibles} · piden {pedidoTotal} · faltan {pedidoTotal - disponibles}
                    </span>
                  )}
                  {cambiado && (
                    <span
                      title="Cambió lo disponible o lo que pidieron, así que reajusté este reparto. Revísalo."
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/20 px-1.5 py-0.5 rounded-full"
                    >
                      cambió
                    </span>
                  )}
                </div>

                {/* Contador vivo. La distinción de colores del «libre» no es
                    cosmética: en ámbar sólo cuando sobra mercancía Y alguien de
                    ESTE producto sigue faltando, que es el único caso en el que
                    hay algo que decidir. En gris cuando sobra porque nadie más
                    lo quiso. Sin esa distinción una ronda de dieciocho productos
                    dispara quince avisos falsos y el ámbar deja de significar
                    nada. */}
                <p className="text-[11px] tabular-nums mt-1">
                  <span className="text-muted">repartes {repartido} · </span>
                  <span
                    className={
                      libre === 0
                        ? 'text-success font-semibold'
                        : libre > 0 && faltandoTotal > 0
                          ? 'text-warning font-semibold'
                          : 'text-muted'
                    }
                    title={
                      libre > 0 && faltandoTotal > 0
                        ? `Sobran ${libre} sin repartir y todavía hay ${faltandoTotal} paca(s) faltando en este producto.`
                        : libre > 0
                          ? `Sobran ${libre} porque nadie más las pidió. Guardarlas es una decisión legítima.`
                          : 'Todo lo que había quedó repartido.'
                    }
                  >
                    libre {Math.max(0, libre)}
                  </span>
                </p>

                {exceso > 0 && (
                  <p className="text-[11px] font-semibold text-error mt-1" role="status">
                    Te pasaste por {exceso}
                  </p>
                )}

                {/* Los tres criterios son atajos de un clic, no automatismos: lo
                    escaso llega en cero y sin sugerencia porque ella reparte a
                    dedo justamente cuando no alcanza, y precargarle un número la
                    obligaría a leer y desmentir cifras que no puso.
                    tabIndex={-1} en todos: en cada fila el único control
                    enfocable es «Le doy», así que Tab baja por la columna sin
                    trucos. Con estos botones en la ruta de Tab habría tres
                    paradas de más por producto. */}
                <div className="mt-2 py-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-1">Repartir:</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button" tabIndex={-1} disabled={deshabilitado}
                      onClick={() => onCriterio(clave, 'prorrata')}
                      title="En proporción a lo que pidió cada uno. Las sueltas van al que más pidió."
                      className="text-[11px] font-semibold px-2 h-8 rounded-lg border border-border hover:bg-primary/5 disabled:opacity-50"
                    >
                      A prorrata
                    </button>
                    <button
                      type="button" tabIndex={-1} disabled={deshabilitado}
                      onClick={() => onCriterio(clave, 'orden')}
                      title="De arriba abajo hasta que se acaben: a los primeros se les cumple completo."
                      className="text-[11px] font-semibold px-2 h-8 rounded-lg border border-border hover:bg-primary/5 disabled:opacity-50"
                    >
                      Por orden
                    </button>
                    {/* Sólo si alguien de ESTE producto trae faltante: es la
                        razón de ser del módulo entero y no debe molestar el 90%
                        del tiempo. */}
                    {hayFaltantesViejos && (
                      <button
                        type="button" tabIndex={-1} disabled={deshabilitado}
                        onClick={() => onCriterio(clave, 'faltante')}
                        title="Primero se le repone a quien ya se le venía debiendo de este producto; el resto, por orden."
                        className="text-[11px] font-semibold px-2 h-8 rounded-lg border border-warning/50 text-warning hover:bg-warning/10 disabled:opacity-50"
                      >
                        Cubrir lo que faltó
                      </button>
                    )}
                    <button
                      type="button" tabIndex={-1} disabled={deshabilitado}
                      onClick={() => onVaciar(clave)}
                      aria-label="Vaciar el reparto de este producto"
                      title="Vaciar el reparto de este producto"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-muted hover:text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      <RotateCcw size={14} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      id={idListo}
                      aria-pressed={listo}
                      disabled={deshabilitado || exceso > 0}
                      onClick={() => onListo(clave, !listo)}
                      title={
                        exceso > 0
                          ? 'No se puede marcar listo: estás repartiendo más de lo que hay.'
                          : listo
                            ? 'Marcado como decidido. Púlsalo otra vez para volver a revisarlo.'
                            : 'Dar por decidido el reparto de este producto.'
                      }
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 h-8 rounded-lg disabled:opacity-40 ${
                        listo ? 'bg-secondary text-on-primary' : 'border border-secondary/50 text-secondary hover:bg-secondary/10'
                      }`}
                    >
                      <Check size={14} aria-hidden="true" /> {listo ? 'Listo' : 'Marcar listo'}
                    </button>
                    {alcanza && (
                      <button
                        type="button" tabIndex={-1}
                        onClick={() => onAbrir(clave)}
                        aria-expanded
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-primary hover:bg-primary/5"
                        aria-label="Plegar este producto"
                        title="Plegar: alcanza para todos"
                      >
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </td>
            )}

            {/* ── #2 CLIENTE ──────────────────────────────────────────────── */}
            <td className="px-2 py-1.5 align-top min-w-[142px]">
              {/* El nombre del cliente NO se corta: es a quién le está dando
                  mercancía, y «COMERCIALIZADORA LA…» no distingue a dos
                  comercializadoras. Envuelve en dos líneas y ya. */}
              <p className="font-medium text-primary leading-tight break-words">
                {c.cliente_nombre}
              </p>
              <p className="text-[11px] text-muted leading-tight break-words">{c.ciudad || 'Sin ciudad'}</p>
            </td>

            {/* ── #3 PIDIÓ ────────────────────────────────────────────────── */}
            <td className="px-1 py-1.5 align-top text-right tabular-nums w-[64px]">{pedida}</td>

            {/* ── #4 LE FALTABA ───────────────────────────────────────────── */}
            <td className="px-1 py-1.5 align-top text-right w-[74px]">
              {faltantesFallo ? (
                // Nunca un 0 cuando la consulta falló: un cero se lee como «a
                // este no le debo nada», que es exactamente la mentira que este
                // módulo existe para impedir.
                <span className="text-muted" title="No pude leer los faltantes de repartos anteriores.">—</span>
              ) : faltaba > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                    {faltaba}
                  </span>
                  {/* La antigüedad, VISIBLE y no escondida en un title: en
                      tableta no hay ratón que saque un tooltip, y es justo el
                      dato que decide a quién se le da primero. Sólo se pinta si
                      de verdad se sabe desde cuándo: un «desde —» ocuparía la
                      misma altura para no decir nada. */}
                  {c.faltante_desde && (
                    <span className="block text-[10px] text-muted leading-tight mt-0.5 tabular-nums">
                      desde {formatFechaCorta(c.faltante_desde)}
                      {num(c.veces_aplazado) >= 2 ? ` · ${num(c.veces_aplazado)} rep.` : ''}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>

            {/* ── #5 LE DOY (el único control editable de la fase) ─────────── */}
            <td className="px-1 py-1.5 align-top w-[108px]">
              <CeldaDoy
                id={idCelda}
                idSiguiente={idSiguiente}
                idListo={idListo}
                valor={dado}
                pedida={pedida}
                margen={margen}
                deshabilitado={deshabilitado}
                etiqueta={
                  `Le doy a ${c.cliente_nombre} de ${producto.referencia} ${producto.calidad || ''};`
                  + ` pidió ${pedida}, hay ${disponibles} disponibles`
                }
                onCantidad={(n) => onCantidad(producto.referencia, producto.calidad, c.cliente_id, n)}
                onSaltar={() => onSaltar(clave)}
              />
              <button
                type="button" tabIndex={-1}
                disabled={deshabilitado || dado >= Math.min(pedida, dado + margen)}
                onClick={() => onCantidad(producto.referencia, producto.calidad, c.cliente_id, Math.min(pedida, dado + margen))}
                className="block ml-auto mt-0.5 text-[10px] font-semibold text-secondary hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
                title={`Darle todo lo que se pueda: lo que pidió (${pedida}) o lo que quede libre.`}
              >
                Todo
              </button>
            </td>

            {/* ── #6 QUEDA FALTANDO ───────────────────────────────────────── */}
            <td className="px-2 py-1.5 align-top text-right tabular-nums w-[96px]">
              {queda > 0 ? (
                <div className="flex items-center justify-end gap-1">
                  {cuenta ? (
                    // NUNCA en rojo: quedar faltando no es un fallo, es el hecho
                    // que se está registrando.
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                      {queda}
                    </span>
                  ) : (
                    // Apagado: la cifra sigue a la vista —tachada y en gris— y no
                    // desaparece. Que la línea se esfume al descartarla dejaría a
                    // ella sin forma de ver qué descartó ni de deshacerlo, y el
                    // número es un hecho aunque no vaya a quedar anotado.
                    <span
                      className="text-[10px] font-semibold text-muted line-through"
                      title={`No va a quedar anotado. ${c.cliente_nombre} pidió ${pedida} y le faltan ${queda},`
                        + ' pero esta línea está marcada como que no queda debiendo nada.'}
                    >
                      {queda}
                    </span>
                  )}
                  {/* LA CASILLA «ESTO NO QUEDA DEBIENDO», por línea y discreta.
                      Va aquí y no en la Fase 1 porque es aquí donde ella ve la
                      cifra que se va a anotar. tabIndex={-1} como el resto de los
                      botones de la fila: el único control enfocable de cada fila
                      es «Le doy», para que Tab baje por la columna sin trucos.
                      Sólo aparece cuando hay algo que descartar: si no queda
                      faltando nada, no hay faltante que apagar. */}
                  <button
                    type="button" tabIndex={-1}
                    disabled={deshabilitado}
                    aria-pressed={!cuenta}
                    aria-label={cuenta
                      ? `No anotar el faltante de ${c.cliente_nombre} en ${producto.referencia}`
                      : `Volver a anotar el faltante de ${c.cliente_nombre} en ${producto.referencia}`}
                    title={cuenta
                      ? 'Esto SÍ queda anotado como faltante. Púlsalo si a este no le vas a quedar debiendo:'
                        + ' es el que pide 50 sabiendo que hay 10.'
                      : 'Esto NO va a quedar anotado como faltante. Púlsalo para volver a anotarlo.'}
                    onClick={() => onCuentaFaltante(producto.referencia, producto.calidad, c.cliente_id, !cuenta)}
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-md flex-shrink-0 disabled:opacity-40 ${
                      cuenta
                        ? 'text-muted/60 hover:text-warning hover:bg-warning/10'
                        : 'text-warning bg-warning/15'
                    }`}
                  >
                    <Ban size={11} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>

            {/* ── #7 VALOR, con el precio debajo ──────────────────────────
                Eran dos columnas y ahora son una. El precio no se edita aquí
                —la plata se resuelve en la Fase 1— así que no necesita una
                columna propia de 110px: cabe debajo del valor, en pequeño. Lo
                que se gana con eso son los cien píxeles que le hacían falta a
                la tabla para convivir con la franja lateral en un portátil. */}
            <td className="px-2 py-1.5 align-top text-right tabular-nums w-[118px]">
              <span className="font-semibold text-primary">{formatCOP(total)}</span>
              <span className="block text-[10px] leading-tight text-muted">
                <span className={promo ? 'font-semibold text-warning' : ''}>{formatNumero(precio)}</span> c/u
              </span>
              {puedeRespetar && (
                <span className="block text-[10px] leading-tight mt-0.5">
                  <span
                    className="inline-flex items-center text-[10px] font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full"
                    title={`Se lo debíamos a ${formatCOP(origen)} y hoy vale ${formatCOP(precio)}. Se cambia desde la Fase 1, en la línea del cliente.`}
                  >
                    debía {formatNumero(origen)}
                  </span>
                </span>
              )}
            </td>
          </tr>
        );
      })}

      {/* ── La fila de suma: la aritmética que hoy hace a ojo ─────────────── */}
      <tr className="border-t border-border/70 text-[11px] text-muted">
        <td className="px-2 py-1.5">Suma del producto</td>
        <td className="px-1 py-1.5 text-right tabular-nums">{pedidoTotal}</td>
        <td className="px-1 py-1.5 text-right tabular-nums">{faltabaTotal > 0 ? faltabaTotal : '—'}</td>
        <td
          className={`px-1 py-1.5 text-right tabular-nums font-semibold ${
            exceso > 0 ? 'text-error' : libre > 0 && faltandoTotal > 0 ? 'text-warning' : 'text-muted'
          }`}
          title={`Repartidas ${repartido} de las ${disponibles} que hay.`}
        >
          {repartido}/{disponibles}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{faltandoTotal > 0 ? faltandoTotal : '—'}</td>
        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-primary">{formatCOP(valorGrupo)}</td>
      </tr>
    </tbody>
  );
});

export default GrupoProducto;
