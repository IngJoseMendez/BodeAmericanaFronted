import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, EmptyState, useToast, useConfirm, SelectorTransporte } from '../components/common';
import {
  clientesApi, cotizacionesApi, listaPreciosApi, pacasApi, preciosApi,
  preciosPromocionApi, transportesApi,
} from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { useAuth } from '../context/AuthContext';
import {
  cantidadDe, precioDe, itemCompleto, precioConDescuento, totalesFila,
} from '../lib/cotizacion';
import { nuevoLibro, descargar, hojaMatrizClientes } from '../lib/entregables';
import { parseMonto, formatCOP, formatNumero } from '../lib/money';
import { hoy, entreFechas } from '../lib/fecha';
import {
  Users, Search, Plus, Save, Trash2, FileSpreadsheet,
  AlertTriangle, AlertCircle, Info, Package, Truck, ExternalLink, CheckCircle,
} from 'lucide-react';

// Referencias, categorías y calidades viven en tablas distintas y difieren en
// mayúsculas y acentos. Comparar en crudo es el bug por el que en Cotizaciones
// "el precio no se ponía solo": todo se compara normalizado.
const normTxt = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// La disponibilidad y lo pedido se cruzan por referencia + calidad, que es
// justo por lo que el servidor busca las pacas al crear la cotización.
const claveStock = (referencia, calidad) => `${normTxt(referencia)}|${normTxt(calidad)}`;

// Los importes que llegan del servidor ya vienen en formato máquina ("45000.00"):
// se leen con Number. parseMonto es SÓLO para lo que teclea la usuaria, donde el
// punto separa miles.
const numServidor = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};


const itemVacio = () => ({ referencia: '', calidad: '', cantidad: '1', precio: '', esPromocion: false, avisoPrecio: null });

// La raya bajo la cabecera va como sombra interior y NO como border-b. La tabla
// colapsa bordes (lo hace el preflight de Tailwind), y un borde colapsado lo
// pinta la TABLA, no la celda: se queda clavado en su sitio cuando la cabecera
// se despega y el encabezado acaba flotando sin línea sobre las filas. La sombra
// pertenece a la celda y viaja con ella. Va en un objeto de módulo para que su
// identidad no cambie en cada render.
const RAYA_CABECERA = { boxShadow: 'inset 0 -1px 0 var(--color-border)' };

// ── A dónde se manda la mercancía de cada cliente ───────────────────────────
// El cliente puede tener guardado un destino habitual de envío (una bodega, una
// transportadora) distinto de sus propios datos. Aquí NO hay selector como en
// Cotizaciones: son decenas de clientes y preguntar por cada uno sería
// inmanejable, así que la regla es fija —si tiene destino registrado se usa
// ese, y si no, los datos del propio cliente— y la línea bajo el nombre dice
// cuál de los dos se va a usar.
// Basta con que UNO de los cuatro campos tenga algo para considerar que hay
// destino: exigirlos todos dejaría fuera a quien solo apuntó la transportadora
// y la ciudad.
const entregaDeCliente = (cliente) => {
  const destino = {
    destinatario:      cliente?.destino_nombre?.trim()    || '',
    direccion_entrega: cliente?.destino_direccion?.trim() || '',
    ciudad_entrega:    cliente?.destino_ciudad?.trim()    || '',
    celular:           cliente?.destino_celular?.trim()   || '',
  };
  // Un destino a medias (por ejemplo, solo la ciudad) NO se completa con los
  // datos del cliente: mezclar dos direcciones en un mismo envío es peor que
  // uno incompleto. Pero entonces el despacho sale a medias, y aquí no hay
  // selector ni casillas que editar, así que la fila tiene que avisarlo antes
  // de guardar —si no, nadie se entera hasta que la guía sale en blanco—.
  if (Object.values(destino).some(Boolean)) {
    return { ...destino, fuente: 'destino', incompleto: Object.values(destino).some((v) => !v) };
  }
  return {
    destinatario:      cliente?.nombre?.trim()    || '',
    direccion_entrega: cliente?.direccion?.trim() || '',
    ciudad_entrega:    cliente?.ciudad?.trim()    || '',
    celular:           cliente?.telefono?.trim()  || '',
    fuente: 'cliente',
    incompleto: false,
  };
};

/** Descuento pactado con el cliente, en pesos por paca, listo para el campo. */
const descuentoPactado = (cliente) => {
  const n = Number(cliente?.descuento);
  return Number.isFinite(n) && n > 0 ? formatNumero(n, { maxDecimales: 2 }) : '';
};

// Al elegir cliente, Cotizaciones mete solo su descuento pactado (pesos por
// paca, valor fijo). Sin esto la vía masiva cobraba precio pleno a TODOS los
// clientes que tienen descuento negociado, en silencio y por cada cotización.
const filaVacia = (cliente) => ({
  items: [itemVacio()],
  descuento: descuentoPactado(cliente),
  tipo_descuento: 'valor_fijo',
  transporte_unitario: '',
  tipo_transporte: '',
});


const itemTieneAlgo = (it) => Boolean(it?.referencia || it?.calidad) || precioDe(it) > 0;

const faltaEnItem = (it) => {
  const falta = [];
  if (!it?.referencia) falta.push('referencia');
  if (!it?.calidad) falta.push('calidad');
  if (cantidadDe(it) <= 0) falta.push('cantidad');
  if (precioDe(it) <= 0) falta.push('precio');
  return falta;
};



// ─────────────────────────────────────────────────────────────────────────────
// Un cliente = un <tbody>
//
// Antes cada cliente era una tarjeta que había que abrir con un chevron. La
// dueña fue clara: "tiene que ser todo accesible a la vista enseguida sin tener
// que desplegar nada". Un <tbody> por cliente es HTML válido —una tabla admite
// varios— y da justo eso: agrupación visual sin desplegables, y un componente
// memoizado por cliente.
//
// memo de verdad: la matriz puede traer cientos de clientes y todos los datos
// viven en un mismo objeto de estado. Sin esto, teclear en una fila repintaba
// TODAS las demás — el problema que ya tuvo Deuda masiva. Por eso las props son
// valores sueltos y objetos con identidad estable (el padre reutiliza el mismo
// array de avisos mientras su contenido no cambie).
// ─────────────────────────────────────────────────────────────────────────────
const FilaCliente = memo(function FilaCliente({
  cliente, fila, avisos, problemas, transporteGlobal, transportes,
  opcionesReferencia, calidadesPorReferencia, deshabilitado,
  onCampo, onItemCampo, onAgregarItem, onQuitarItem, onCatalogo,
}) {
  const uid = useId();
  const items = fila?.items || [];
  const totales = totalesFila(fila, transporteGlobal);
  const hayConflicto = (avisos || []).some((a) => a?.excede);
  const hayProblema = Boolean(problemas?.length);
  const transporteHeredado = Number(transporteGlobal) || 0;
  const tipoDescuento = fila?.tipo_descuento || 'valor_fijo';
  const tieneItems = items.length > 0;

  // Los datos de entrega no se piden: salen del destino registrado del cliente
  // y, si no tiene, del propio cliente. En el title va la ficha completa
  // —incluido el descuento pactado— para consultarla sin ocupar sitio; debajo
  // del nombre solo se pintan en los clientes que sí llevan ítems, que son los
  // que hay que confirmar antes de guardar.
  const entrega = entregaDeCliente(cliente);
  const etiquetaEntrega = entrega.fuente === 'destino' ? 'Destino registrado' : 'Datos del cliente';
  const fichaEntrega =
    `Se envía a: ${etiquetaEntrega.toLowerCase()}` +
    ` · ${entrega.destinatario || 'sin nombre'} · ${entrega.direccion_entrega || 'sin dirección registrada'}` +
    ` · ${entrega.ciudad_entrega || 'sin ciudad'} · ${entrega.celular || 'sin celular'}` +
    (entrega.incompleto ? ' · OJO: el destino registrado está a medias, lo que falta se despacha en blanco' : '') +
    (Number(cliente.descuento) > 0
      ? ` · descuento pactado ${formatCOP(Number(cliente.descuento))}/paca`
      : '');

  // Es un ELEMENTO reutilizado, no un componente declarado aquí dentro: un
  // componente definido dentro de otro es un tipo nuevo en cada render, React
  // desmonta y remonta, y se pierde el foco del campo que se está escribiendo.
  const infoCliente = (
    <div className="min-w-0" title={fichaEntrega}>
      <p className="font-medium text-primary truncate leading-tight">{cliente.nombre}</p>
      <p className="text-[11px] text-muted truncate leading-tight">
        {cliente.ciudad || 'Sin ciudad'}
        {hayConflicto && <span className="font-semibold text-error"> · sin stock</span>}
        {hayProblema && <span className="font-semibold text-error"> · no se creó</span>}
      </p>
      {/* Los datos de entrega solo se muestran en los clientes a los que SÍ se
          les está separando algo: es donde hay que confirmarlos, y son cuatro
          filas, no cincuenta. En un tooltip no servirían: en tableta, que es
          donde se revisa la bodega, no hay ratón que los saque.
          Delante va de dónde salen —destino registrado o datos del cliente—
          porque aquí no hay selector y esta línea es el único aviso. */}
      {tieneItems && (
        <p className="text-[10px] text-muted/80 truncate leading-tight">
          <span className={`font-semibold ${entrega.fuente === 'destino' ? 'text-secondary' : ''}`}>
            {etiquetaEntrega}:
          </span>{' '}
          {[entrega.direccion_entrega, entrega.ciudad_entrega, entrega.celular].filter(Boolean).join(' · ')
            || 'sin datos de entrega'}
          {entrega.incompleto && (
            <span className="font-semibold text-error"> · destino incompleto</span>
          )}
        </p>
      )}
    </div>
  );

  const botonAgregar = (
    <button
      type="button"
      onClick={() => onAgregarItem(cliente.id)}
      disabled={deshabilitado}
      aria-label={`Agregar un ítem a ${cliente.nombre}`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary hover:underline underline-offset-2 disabled:opacity-50"
    >
      <Plus size={12} aria-hidden="true" /> Ítem
    </button>
  );

  // Altura fija y baja en todos los controles: es lo que permite que quepan
  // quince clientes en pantalla en vez de tres.
  //
  // La separación lateral NO va aquí a propósito. Si la base trajera px-2 y quien
  // llama pidiera px-1, ganaría px-2: en Tailwind el desempate lo decide el orden
  // de la hoja generada (px-1 se escribe antes que px-2), no el orden dentro del
  // atributo, así que la clase del que llama no haría nada. Cada campo pone la
  // suya y la columna estrecha de cantidad puede de verdad ser estrecha.
  const campo = (mal, extra = '') =>
    `h-8 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50 ${
      mal ? 'border-error' : 'border-border'
    } ${extra}`;

  return (
    <tbody
      className={`border-t border-border/70 ${
        hayProblema || hayConflicto
          ? 'bg-error/[0.04]'
          : totales.validos.length
            ? 'bg-secondary/[0.03]'
            : ''
      }`}
    >
      {/* Lo que devolvió el servidor para este cliente: se pinta AQUÍ, en su
          grupo, para no tener que buscar en cuál de veinte está el fallo. */}
      {hayProblema && (
        <tr>
          <td colSpan={7} className="px-3 pt-2">
            <div className="rounded-lg border border-error/40 bg-error/10 px-2.5 py-1.5 space-y-0.5">
              {problemas.map((texto, i) => (
                <p key={i} className="text-[11px] text-error flex items-start gap-1.5">
                  <AlertCircle size={11} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{texto}</span>
                </p>
              ))}
            </div>
          </td>
        </tr>
      )}

      {items.length === 0 ? (
        // El caso mayoritario, y donde se gana el espacio: un cliente sin ítems
        // ocupa UNA fila corriente con su nombre, su ciudad y el botón.
        <tr>
          <td className="px-3 py-1.5 border-r border-border/40">{infoCliente}</td>
          <td colSpan={6} className="px-3 py-1.5">{botonAgregar}</td>
        </tr>
      ) : (
        <>
          {items.map((item, idx) => {
            const aviso = avisos?.[idx] || null;
            const excede = Boolean(aviso?.excede);

            const calidades = calidadesPorReferencia.get(normTxt(item.referencia)) || [];
            // La calidad ya elegida se conserva aunque se quede sin stock:
            // si desapareciera del <select> el dato se borraría solo.
            const opcionesCal = item.calidad && !calidades.some((c) => normTxt(c) === normTxt(item.calidad))
              ? [item.calidad, ...calidades]
              : calidades;
            // Mismo cuidado con la referencia, ahora que también es un select:
            // otro cliente puede haberse llevado las últimas pacas y su opción
            // desaparecería de la lista al repintar, borrando lo ya escrito.
            const refSinStock = Boolean(item.referencia)
              && !opcionesReferencia.some((o) => normTxt(o.nombre) === normTxt(item.referencia));

            const falta = itemTieneAlgo(item) && !itemCompleto(item) ? faltaEnItem(item) : null;
            const sinPrecio = Boolean(item.avisoPrecio) && precioDe(item) <= 0;
            const hayChips = Boolean(aviso || item.esPromocion || falta || sinPrecio);

            const idRef = `${uid}-ref-${idx}`;
            const idCal = `${uid}-cal-${idx}`;
            const idCant = `${uid}-cant-${idx}`;
            const idPrecio = `${uid}-precio-${idx}`;

            return (
              <tr key={idx} className={excede ? 'bg-error/10' : ''}>
                {/* El nombre se escribe una sola vez y cubre las filas del
                    cliente más su pie: repetirlo en cada línea sería ruido. */}
                {idx === 0 && (
                  <td rowSpan={items.length + 1} className="px-3 py-1.5 align-top border-r border-border/40">
                    {infoCliente}
                  </td>
                )}

                <td className="px-2 py-1.5 align-top">
                  <label htmlFor={idRef} className="sr-only">Referencia del ítem {idx + 1}</label>
                  <select
                    id={idRef}
                    value={item.referencia}
                    disabled={deshabilitado}
                    aria-label={`Referencia del ítem ${idx + 1} de ${cliente.nombre}`}
                    onChange={(e) => onItemCampo(cliente.id, idx, 'referencia', e.target.value)}
                    className={campo(excede, 'w-full px-2')}
                  >
                    <option value="">Elegir referencia…</option>
                    {refSinStock && (
                      <option value={item.referencia}>{item.referencia} — sin stock</option>
                    )}
                    {opcionesReferencia.map((o) => (
                      <option key={o.nombre} value={o.nombre}>
                        {o.nombre} — {o.disponibles} disp
                      </option>
                    ))}
                  </select>

                  {/* Avisos del ítem, en corto y con el texto completo en el
                      title: en una tabla densa una frase larga por línea
                      devolvería la pantalla al tamaño de antes. */}
                  {hayChips && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {aviso && (
                        <span
                          title={
                            aviso.excede
                              ? `Hay ${aviso.disponible} y se están pidiendo ${aviso.pedido} entre todos los clientes`
                              : `${aviso.disponible} disponibles · ${aviso.pedido} pedidas entre todos los clientes`
                          }
                          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                            aviso.excede
                              ? 'bg-error/15 text-error'
                              : aviso.disponible - aviso.pedido <= 2
                                ? 'bg-warning/15 text-warning'
                                : 'bg-success/15 text-success'
                          }`}
                        >
                          <Package size={9} aria-hidden="true" />
                          {aviso.excede
                            ? `Faltan ${aviso.pedido - aviso.disponible}`
                            : `${aviso.disponible} disp · ${aviso.pedido} ped`}
                        </span>
                      )}
                      {item.esPromocion && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning/15 px-1.5 py-0.5 rounded-full">
                          <AlertCircle size={9} aria-hidden="true" /> Promoción
                        </span>
                      )}
                      {sinPrecio && (
                        <span
                          title={item.avisoPrecio}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full"
                        >
                          <AlertCircle size={9} aria-hidden="true" /> Sin precio — escríbelo
                        </span>
                      )}
                      {falta && (
                        <span
                          title="Mientras falte algo, esta línea no se envía"
                          className="inline-flex items-center text-[10px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full"
                        >
                          Falta {falta.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </td>

                <td className="px-2 py-1.5 align-top">
                  <label htmlFor={idCal} className="sr-only">Calidad del ítem {idx + 1}</label>
                  <select
                    id={idCal}
                    value={item.calidad}
                    disabled={deshabilitado}
                    aria-label={`Calidad del ítem ${idx + 1} de ${cliente.nombre}`}
                    onChange={(e) => onItemCampo(cliente.id, idx, 'calidad', e.target.value)}
                    className={campo(excede, 'w-full px-2')}
                  >
                    <option value="">
                      {item.referencia && opcionesCal.length === 0 ? 'Sin calidades' : 'Calidad…'}
                    </option>
                    {opcionesCal.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </td>

                <td className="px-1 py-1.5 align-top">
                  <label htmlFor={idCant} className="sr-only">Cantidad del ítem {idx + 1}</label>
                  <input
                    id={idCant}
                    type="number"
                    min="1"
                    step="1"
                    value={item.cantidad}
                    disabled={deshabilitado}
                    aria-label={`Cantidad del ítem ${idx + 1} de ${cliente.nombre}`}
                    onChange={(e) => onItemCampo(cliente.id, idx, 'cantidad', e.target.value)}
                    className={campo(excede, 'w-full text-center tabular-nums px-1')}
                  />
                </td>

                <td className="px-2 py-1.5 align-top">
                  <label htmlFor={idPrecio} className="sr-only">Precio por paca del ítem {idx + 1}</label>
                  <input
                    id={idPrecio}
                    type="text"
                    inputMode="decimal"
                    value={item.precio}
                    disabled={deshabilitado}
                    aria-label={`Precio por paca del ítem ${idx + 1} de ${cliente.nombre}`}
                    onChange={(e) => onItemCampo(cliente.id, idx, 'precio', e.target.value)}
                    onBlur={(e) => {
                      // Se reformatea al salir, no en cada tecla: con el punto
                      // de miles metido a mitad de palabra sería imposible
                      // escribir. maxDecimales conserva los centavos que
                      // existan sin inventar ceros.
                      const v = parseMonto(e.target.value);
                      onItemCampo(cliente.id, idx, 'precio', v > 0 ? formatNumero(v, { maxDecimales: 2 }) : '');
                    }}
                    placeholder="Precio"
                    className={`h-8 px-2 w-full rounded-lg border text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50 ${
                      item.esPromocion
                        ? 'border-warning bg-warning/10 font-semibold'
                        : 'border-border bg-surface'
                    }`}
                  />
                </td>

                <td className="px-2 py-1.5 align-top text-right">
                  <span className="inline-flex h-8 items-center text-sm font-semibold tabular-nums text-primary">
                    {formatCOP(cantidadDe(item) * precioDe(item))}
                  </span>
                </td>

                <td className="px-1 py-1.5 align-top text-center">
                  <button
                    type="button"
                    onClick={() => onQuitarItem(cliente.id, idx)}
                    disabled={deshabilitado}
                    aria-label={`Quitar el ítem ${idx + 1} de ${cliente.nombre}`}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}

          {/* Pie del cliente: todo lo suyo en UNA línea. */}
          <tr className="border-t border-border/30">
            <td colSpan={4} className="px-2 py-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {botonAgregar}

                <div className="flex items-center gap-1">
                  <label htmlFor={`${uid}-desc`} className="sr-only">Descuento por paca</label>
                  <select
                    value={tipoDescuento}
                    disabled={deshabilitado}
                    aria-label={`Tipo de descuento de ${cliente.nombre}`}
                    onChange={(e) => onCampo(cliente.id, 'tipo_descuento', e.target.value)}
                    className={campo(false, 'w-14 px-2')}
                  >
                    <option value="valor_fijo">$</option>
                    <option value="porcentaje">%</option>
                  </select>
                  <input
                    id={`${uid}-desc`}
                    type="text"
                    inputMode="decimal"
                    value={fila?.descuento || ''}
                    disabled={deshabilitado}
                    aria-label={`Descuento de ${cliente.nombre}`}
                    title={
                      Number(cliente.descuento) > 0
                        ? `Descuento pactado con ${cliente.nombre}: ${formatCOP(Number(cliente.descuento))} por paca`
                        : 'Descuento de este cliente'
                    }
                    onChange={(e) => onCampo(cliente.id, 'descuento', e.target.value)}
                    placeholder={tipoDescuento === 'porcentaje' ? '% desc.' : 'Desc./paca'}
                    className={campo(false, 'w-24 px-2 tabular-nums')}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Truck size={13} className="text-muted flex-shrink-0" aria-hidden="true" />
                  <label htmlFor={`${uid}-trans`} className="sr-only">Transporte por paca</label>
                  <input
                    id={`${uid}-trans`}
                    type="text"
                    inputMode="decimal"
                    value={fila?.transporte_unitario || ''}
                    disabled={deshabilitado}
                    aria-label={`Transporte por paca de ${cliente.nombre}`}
                    title="Déjalo vacío para usar el transporte de arriba"
                    onChange={(e) => onCampo(cliente.id, 'transporte_unitario', e.target.value)}
                    placeholder={transporteHeredado > 0 ? `${formatNumero(transporteHeredado)} (arriba)` : 'Transporte'}
                    className={campo(false, 'w-28 px-2 tabular-nums')}
                  />
                  <label htmlFor={`${uid}-tipotrans`} className="sr-only">Tipo de transporte</label>
                  {/* Mismo selector que en Cotizaciones: el catálogo se le pasa ya
                      cargado (esta pantalla lo pide al abrir) para no repetir la
                      petición en cada una de las filas, y si falta un transporte
                      se crea aquí mismo sin irse a Despachos perdiendo la matriz. */}
                  <SelectorTransporte
                    id={`${uid}-tipotrans`}
                    value={fila?.tipo_transporte || ''}
                    disabled={deshabilitado}
                    aria-label={`Tipo de transporte de ${cliente.nombre}`}
                    transportes={transportes}
                    onCatalogo={onCatalogo}
                    onChange={(v) => onCampo(cliente.id, 'tipo_transporte', v)}
                    placeholder="Tipo…"
                    className={campo(false, 'w-32 px-2')}
                  />
                </div>
              </div>
            </td>

            <td
              className="px-2 py-1.5 text-right whitespace-nowrap"
              title={
                totales.validos.length
                  ? `Subtotal ${formatCOP(totales.subtotal)}` +
                    (totales.descuento > 0 ? ` · descuento −${formatCOP(totales.descuento)}` : '') +
                    (totales.transporteTotal > 0 ? ` · transporte +${formatCOP(totales.transporteTotal)}` : '')
                  : undefined
              }
            >
              {totales.validos.length > 0 && (
                <>
                  <span className="block text-[10px] text-muted leading-tight">
                    {totales.unidades} paca(s)
                    {totales.descuento > 0 ? ` · −${formatCOP(totales.descuento)}` : ''}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-primary">
                    {formatCOP(totales.total)}
                  </span>
                </>
              )}
            </td>
            <td aria-hidden="true" />
          </tr>
        </>
      )}
    </tbody>
  );
});

// ─────────────────────────────────────────────────────────────────────────────

export default function SeparacionMasiva() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { usuario } = useAuth();
  // Ojo con el nombre heredado del catálogo: `categorias` son las REFERENCIAS,
  // y cada una lleva en `temporada_nombre` la categoría que usa la tabla de
  // Precios. Es el mismo campo del que tira Cotizaciones para el paso 3.
  const { categorias: optsReferencia } = useCatalog();

  const [clientes, setClientes] = useState([]);
  const [transportes, setTransportes] = useState([]);
  const [stock, setStock] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [avisoCarga, setAvisoCarga] = useState(null);

  // Datos globales: la dueña fue explícita en que la tasa y el transporte se
  // ponen UNA vez arriba y valen para todas las filas.
  const [tasa, setTasa] = useState('');
  const [transporteGlobal, setTransporteGlobal] = useState('');
  const [validezDias, setValidezDias] = useState('15');

  const [buscar, setBuscar] = useState('');
  const [soloConItems, setSoloConItems] = useState(false);

  const [filas, setFilas] = useState({});        // cliente_id -> fila
  const [problemas, setProblemas] = useState({}); // cliente_id -> [mensajes]
  const [problemasSueltos, setProblemasSueltos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState(null);
  const [generandoMatriz, setGenerandoMatriz] = useState(false);

  const idTasa = useId();
  const idTransporte = useId();
  const idValidez = useId();
  const idBuscar = useId();
  const idSoloConItems = useId();

  // Las tablas de precios viven en un ref y no en el estado para que
  // resolverPrecio y los manejadores de la matriz NUNCA cambien de identidad:
  // si cambiaran, React.memo dejaría de servir y cada tecla repintaría las
  // cientos de filas.
  const tablasRef = useRef({ listaPrecios: [], preestablecidos: [], promos: [], referencias: [] });
  const stockRef = useRef(new Map());
  const calidadesRef = useRef(new Map());
  // Los clientes también van en un ref: los manejadores necesitan el descuento
  // pactado para estrenar la fila, y no pueden depender del estado sin perder su
  // identidad (y con ella el React.memo de las filas).
  const clientesRef = useRef(new Map());

  useEffect(() => { tablasRef.current.referencias = optsReferencia || []; }, [optsReferencia]);
  useEffect(() => {
    clientesRef.current = new Map((clientes || []).map((c) => [String(c.id), c]));
  }, [clientes]);

  const cargarStock = useCallback(async (respaldo) => {
    // Una sola petición para todo el stock. Cotizaciones pregunta por cada fila;
    // aquí eso serían cientos de peticiones mientras la usuaria escribe.
    let bruto = null;
    try {
      bruto = await cotizacionesApi.disponibilidadMasiva();
    } catch (err) {
      console.error('[SeparacionMasiva] disponibilidad-masiva', err);
    }
    const lista = Array.isArray(bruto) ? bruto
      : Array.isArray(bruto?.items) ? bruto.items
      : Array.isArray(bruto?.disponibilidad) ? bruto.disponibilidad
      : Array.isArray(bruto?.data) ? bruto.data
      : null;

    // Respaldo: la lista de precios ya trae las pacas disponibles agrupadas por
    // referencia + calidad, así que la pantalla sigue avisando del stock aunque
    // el endpoint nuevo falle. Se cae al respaldo SÓLO cuando no hubo respuesta
    // utilizable: una respuesta correcta y vacía significa "no queda nada" y
    // taparla con la lista de precios resucitaría pacas ya apartadas.
    const hayEndpoint = lista !== null;
    const fuente = hayEndpoint ? lista : (respaldo || []);
    const filasStock = fuente.map((r) => ({
      referencia: r.referencia ?? '',
      calidad: r.calidad ?? '',
      clasificacion: r.clasificacion ?? null,
      disponibles: Math.max(0, Math.round(numServidor(r.disponibles ?? r.cantidad ?? r.total ?? 0))),
    })).filter((r) => r.referencia && r.calidad && r.disponibles > 0);

    setStock(filasStock);
    return hayEndpoint;
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const [rCli, rLista, rPre, rPromo, rTrans] = await Promise.allSettled([
        clientesApi.getAll({ estado: 'activo' }),
        listaPreciosApi.getAll(),
        preciosApi.getAll(),
        preciosPromocionApi.getAll(),
        transportesApi.getAll(),
      ]);
      if (!vivo) return;

      const lista = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
      const listaPrecios = lista(rLista);

      setClientes(lista(rCli));
      setTransportes(lista(rTrans));

      // Sólo las promociones que están corriendo hoy: una vencida no puede
      // seguir fijando el precio de la cotización. El `activo` se lee como
      // verdadero/falso a secas —igual que isActive() en PreciosPromocion— y no
      // con === true: si el servidor lo serializara como 1 o "t" (y no como
      // booleano), un === true dejaría fuera TODAS las promociones y la pantalla
      // cobraría precio pleno sin decir nada.
      const promosVigentes = lista(rPromo).filter(
        (p) => p.activo && entreFechas(hoy(), p.fecha_inicio, p.fecha_fin)
      );
      // Se conserva `referencias`: el catálogo llega por su propio efecto y puede
      // haberlo escrito YA mientras estas cinco peticiones estaban en vuelo.
      // Reemplazar el objeto entero con el valor capturado al montar lo borraba,
      // y sin referencias no hay categoría, así que el paso 3 del precio
      // (preestablecido) dejaba de encontrarse.
      tablasRef.current = {
        ...tablasRef.current,
        listaPrecios,
        preestablecidos: lista(rPre),
        promos: promosVigentes,
      };

      const hayEndpoint = await cargarStock(listaPrecios);
      if (!vivo) return;

      const fallos = [];
      if (rCli.status === 'rejected') fallos.push('los clientes');
      if (rLista.status === 'rejected') fallos.push('los precios del inventario');
      if (rPre.status === 'rejected') fallos.push('los precios preestablecidos');
      if (rPromo.status === 'rejected') fallos.push('las promociones');
      if (rTrans.status === 'rejected') fallos.push('los transportes');
      if (!hayEndpoint) fallos.push('el stock (se está usando el de la lista de precios)');
      setAvisoCarga(fallos.length ? `No se pudieron cargar bien: ${fallos.join(', ')}. Revisa los precios antes de guardar.` : null);
      setCargando(false);
    })();
    return () => { vivo = false; };
    // Sólo al abrir: el catálogo de referencias se sincroniza aparte, en su
    // propio efecto, para no recargar toda la pantalla cuando llega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stock agregado por referencia + calidad, que es como el servidor busca las
  // pacas al crear la cotización.
  const stockPorClave = useMemo(() => {
    const m = new Map();
    for (const r of stock) {
      const k = claveStock(r.referencia, r.calidad);
      const previo = m.get(k);
      if (previo) {
        previo.disponibles += r.disponibles;
        // Si la misma referencia+calidad existe en varias clasificaciones, no hay
        // una sola: se deja sin clasificación y manda la promoción general.
        if (normTxt(previo.clasificacion) !== normTxt(r.clasificacion)) previo.clasificacion = null;
      } else {
        m.set(k, { referencia: r.referencia, calidad: r.calidad, clasificacion: r.clasificacion, disponibles: r.disponibles });
      }
    }
    return m;
  }, [stock]);

  // Opciones del <select> de referencia: sólo lo que TIENE stock, en orden
  // alfabético y con lo que queda de cada una. Antes era un <input> con
  // <datalist>: se podía escribir cualquier cosa —hasta una referencia que no
  // existe— y no se veía cuánto quedaba, así que había que adivinar.
  const opcionesReferencia = useMemo(() => {
    const m = new Map();
    for (const r of stock) {
      const k = normTxt(r.referencia);
      const previo = m.get(k);
      if (previo) previo.disponibles += r.disponibles;
      else m.set(k, { nombre: r.referencia, disponibles: r.disponibles });
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [stock]);

  const calidadesPorReferencia = useMemo(() => {
    const m = new Map();
    for (const r of stock) {
      const k = normTxt(r.referencia);
      if (!m.has(k)) m.set(k, []);
      const arr = m.get(k);
      if (!arr.some((c) => normTxt(c) === normTxt(r.calidad))) arr.push(r.calidad);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.localeCompare(b, 'es'));
    return m;
  }, [stock]);

  useEffect(() => { stockRef.current = stockPorClave; }, [stockPorClave]);
  useEffect(() => { calidadesRef.current = calidadesPorReferencia; }, [calidadesPorReferencia]);

  /**
   * Mismo orden que Cotizaciones.jsx, pero resuelto en memoria:
   *   1. promoción vigente (referencia + calidad + clasificación)
   *   2. precio del inventario (referencia + calidad)
   *   3. precio preestablecido (categoría + calidad), con la categoría deducida
   *      de la referencia
   * Todo comparado con normTxt: sin eso el precio "no se pone solo".
   */
  const resolverPrecio = useCallback((referencia, calidad, clasificacion) => {
    const { listaPrecios, preestablecidos, promos, referencias } = tablasRef.current;
    const nRef = normTxt(referencia);
    const nCal = normTxt(calidad);
    if (!nRef || !nCal) return { precio: null, esPromocion: false, aviso: null };

    // 1. Promoción. Con la clasificación conocida gana la promoción atada a ella
    //    y, si no la hay, la general. SIN clasificación conocida sólo vale la
    //    general: aceptar ahí una promoción de "Dama" le pondría precio de
    //    promoción a las pacas de hombre del mismo referencia+calidad, que es
    //    justo lo contrario de lo que dice /precios-promocion/activa ("si se
    //    envía la clasificación, gana la específica").
    const candidatas = promos
      .filter((p) =>
        normTxt(p.referencia) === nRef &&
        normTxt(p.calidad) === nCal &&
        (clasificacion
          ? (!p.clasificacion || normTxt(p.clasificacion) === normTxt(clasificacion))
          : !p.clasificacion) &&
        numServidor(p.precio_promocional) > 0
      )
      .sort((a, b) => {
        const especificidad = (a.clasificacion ? 0 : 1) - (b.clasificacion ? 0 : 1);
        if (especificidad !== 0) return especificidad;
        return numServidor(b.precio_promocional) - numServidor(a.precio_promocional);
      });
    if (candidatas.length) {
      return { precio: numServidor(candidatas[0].precio_promocional), esPromocion: true, aviso: null };
    }

    // 2. Precio del inventario: el que se fijó al finalizar el contenedor.
    const enInventario = listaPrecios.find(
      (l) => normTxt(l.referencia) === nRef && normTxt(l.calidad) === nCal
    );
    const pInv = numServidor(enInventario?.precio);
    if (pInv > 0) return { precio: pInv, esPromocion: false, aviso: null };

    // 3. Preestablecido por categoría + calidad. La categoría sale de la
    //    referencia del catálogo (temporada_nombre).
    const refObj = referencias.find((r) => normTxt(r.nombre) === nRef);
    const categoria = refObj?.temporada_nombre || null;
    if (categoria) {
      const fila = preestablecidos.find(
        (p) => normTxt(p.categoria) === normTxt(categoria) && normTxt(p.calidad) === nCal
      );
      const p = numServidor(fila?.precio);
      if (p > 0) return { precio: p, esPromocion: false, aviso: null };
    }

    // No se pudo resolver: se avisa. Poner 0 en silencio sería cotizar gratis.
    return {
      precio: null,
      esPromocion: false,
      aviso: `Sin precio para ${referencia} / ${calidad}${categoria ? ` (categoría ${categoria})` : ''}. Escríbelo a mano o revísalo en Lista de Precios.`,
    };
  }, []);

  // Un problema devuelto por el servidor deja de valer en cuanto se edita la fila.
  const olvidarProblema = useCallback((clienteId) => {
    setProblemas((prev) => {
      if (!prev[String(clienteId)]) return prev;
      const next = { ...prev };
      delete next[String(clienteId)];
      return next;
    });
  }, []);

  const nuevaFila = useCallback(
    (clienteId) => filaVacia(clientesRef.current.get(String(clienteId))),
    []
  );

  const setCampo = useCallback((clienteId, campo, valor) => {
    setFilas((prev) => {
      const actual = prev[clienteId] || nuevaFila(clienteId);
      return { ...prev, [clienteId]: { ...actual, [campo]: valor } };
    });
    olvidarProblema(clienteId);
  }, [olvidarProblema, nuevaFila]);

  // Único camino para estrenar un cliente: ya no hay chevron que abrir, así que
  // "+ Ítem" en un cliente sin fila le crea la fila con su primera línea.
  const agregarItem = useCallback((clienteId) => {
    setFilas((prev) => {
      const actual = prev[clienteId];
      if (!actual) return { ...prev, [clienteId]: nuevaFila(clienteId) };
      return { ...prev, [clienteId]: { ...actual, items: [...actual.items, itemVacio()] } };
    });
    olvidarProblema(clienteId);
  }, [olvidarProblema, nuevaFila]);

  const quitarItem = useCallback((clienteId, idx) => {
    setFilas((prev) => {
      const actual = prev[clienteId];
      if (!actual) return prev;
      const items = actual.items.filter((_, i) => i !== idx);
      // Sin ítems el cliente deja de existir para el envío: se borra la fila
      // entera para que el resumen del pie no lo siga contando.
      if (!items.length) {
        const next = { ...prev };
        delete next[clienteId];
        return next;
      }
      return { ...prev, [clienteId]: { ...actual, items } };
    });
    olvidarProblema(clienteId);
  }, [olvidarProblema]);

  const setItemCampo = useCallback((clienteId, idx, campo, valor) => {
    setFilas((prev) => {
      const actual = prev[clienteId];
      if (!actual) return prev;
      const items = actual.items.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it));

      if (campo === 'precio') {
        const antes = precioDe(actual.items[idx]);
        const ahora = parseMonto(valor);
        // Un precio escrito a mano manda sobre el automático; pero volver a
        // formatear el mismo número (al salir del campo) NO puede borrar la
        // marca de promoción.
        items[idx] = {
          ...items[idx],
          esPromocion: ahora === antes ? items[idx].esPromocion : false,
          avisoPrecio: ahora > 0 ? null : items[idx].avisoPrecio,
        };
      }

      if (campo === 'referencia' || campo === 'calidad') {
        const referencia = items[idx].referencia;
        let calidad = items[idx].calidad;
        // Al cambiar de referencia, la calidad anterior puede no existir en la
        // nueva: se limpia en vez de dejar una combinación sin stock. Ahora que
        // la referencia es un <select> se puede limpiar SIEMPRE que no encaje
        // —incluso al volver a "Elegir referencia…", que dejaría una calidad
        // huérfana—. Con el <input> de antes no se podía: a media palabra la
        // referencia todavía no existía y limpiar ahí obligaba a volver a
        // elegir la calidad con cada tecla.
        if (campo === 'referencia' && calidad) {
          const disponibles = calidadesRef.current.get(normTxt(referencia));
          if (!disponibles || !disponibles.some((c) => normTxt(c) === normTxt(calidad))) calidad = '';
        }
        const info = stockRef.current.get(claveStock(referencia, calidad));
        const { precio, esPromocion, aviso } = resolverPrecio(referencia, calidad, info?.clasificacion || null);
        items[idx] = {
          ...items[idx],
          calidad,
          precio: precio != null ? formatNumero(precio, { maxDecimales: 2 }) : '',
          esPromocion,
          avisoPrecio: precio != null ? null : aviso,
        };
      }

      return { ...prev, [clienteId]: { ...actual, items } };
    });
    olvidarProblema(clienteId);
  }, [resolverPrecio, olvidarProblema]);

  // Lo pedido entre TODOS los clientes, por referencia + calidad. Es el corazón
  // de la pantalla: varios clientes compiten por las mismas pacas y el aviso
  // tiene que llegar mientras se escribe, no cuando el servidor rechace el envío.
  const pedidoPorClave = useMemo(() => {
    const m = new Map();
    for (const fila of Object.values(filas)) {
      for (const it of fila.items) {
        // Sólo cuentan las líneas que el envío VA a incluir. Contando también
        // las que están a medias (sin precio resuelto, por ejemplo) la pantalla
        // se contradecía: la línea decía "esta línea no se envía" y a la vez
        // bloqueaba el botón con "no alcanzan las pacas", sin más salida que
        // borrarla.
        if (!itemCompleto(it)) continue;
        const k = claveStock(it.referencia, it.calidad);
        const previo = m.get(k);
        if (previo) previo.pedido += cantidadDe(it);
        else m.set(k, { referencia: it.referencia, calidad: it.calidad, pedido: cantidadDe(it) });
      }
    }
    return m;
  }, [filas]);

  const conflictos = useMemo(() => {
    const out = [];
    for (const [k, v] of pedidoPorClave) {
      const disponible = stockPorClave.get(k)?.disponibles ?? 0;
      if (v.pedido > disponible) out.push({ ...v, disponible });
    }
    return out.sort((a, b) => (b.pedido - b.disponible) - (a.pedido - a.disponible));
  }, [pedidoPorClave, stockPorClave]);

  // Se reutiliza el MISMO array de avisos mientras su contenido no cambie: es lo
  // que permite que React.memo aguante y que teclear en una fila sólo repinte
  // esa fila y las que comparten referencia+calidad con ella.
  const cacheAvisos = useRef(new Map());
  const avisosPorCliente = useMemo(() => {
    const salida = {};
    for (const [clienteId, fila] of Object.entries(filas)) {
      const arr = fila.items.map((it) => {
        // Mismo criterio que pedidoPorClave: si la línea no se va a enviar no
        // aparece en la cuenta, y enseñarle un semáforo de stock haría creer que
        // sí cuenta.
        if (!itemCompleto(it)) return null;
        const k = claveStock(it.referencia, it.calidad);
        const disponible = stockPorClave.get(k)?.disponibles ?? 0;
        const pedido = pedidoPorClave.get(k)?.pedido ?? 0;
        return { disponible, pedido, excede: pedido > disponible };
      });
      const firma = JSON.stringify(arr);
      const previo = cacheAvisos.current.get(clienteId);
      if (previo && previo.firma === firma) {
        salida[clienteId] = previo.valor;
      } else {
        cacheAvisos.current.set(clienteId, { firma, valor: arr });
        salida[clienteId] = arr;
      }
    }
    return salida;
  }, [filas, pedidoPorClave, stockPorClave]);

  const transporteGlobalNum = parseMonto(transporteGlobal);

  const resumen = useMemo(() => {
    let numClientes = 0;
    let unidades = 0;
    let total = 0;
    let lineasIncompletas = 0;
    for (const fila of Object.values(filas)) {
      lineasIncompletas += fila.items.filter((it) => itemTieneAlgo(it) && !itemCompleto(it)).length;
      const t = totalesFila(fila, transporteGlobalNum);
      if (!t.validos.length) continue;
      numClientes += 1;
      unidades += t.unidades;
      total += t.total;
    }
    return { numClientes, unidades, total, lineasIncompletas };
  }, [filas, transporteGlobalNum]);

  // Motivo por el que NO se puede guardar. Se enseña junto al botón: un botón
  // apagado sin explicación deja a la usuaria sin saber qué arreglar.
  const impedimento = useMemo(() => {
    if (cargando) return 'Todavía se están cargando los datos.';
    if (resumen.numClientes === 0) return 'Todavía no hay ningún cliente con ítems completos.';
    if (conflictos.length) {
      const c = conflictos[0];
      return `No alcanzan las pacas de ${c.referencia} / ${c.calidad}: hay ${c.disponible} y se piden ${c.pedido}` +
        (conflictos.length > 1 ? ` (y ${conflictos.length - 1} combinación(es) más)` : '') + '.';
    }
    return null;
  }, [cargando, resumen.numClientes, conflictos]);

  const clientesVisibles = useMemo(() => {
    const q = normTxt(buscar);
    return clientes.filter((c) => {
      // Un cliente con ítems NUNCA se esconde: si desapareciera de la lista al
      // buscar otro nombre, se enviaría algo que ya no se ve en pantalla.
      // Lo mismo con el que trae un fallo del servidor: el aviso no sirve de
      // nada si hay que acordarse de borrar la búsqueda para verlo.
      if (filas[c.id] || problemas[String(c.id)]) return true;
      if (soloConItems) return false;
      if (!q) return true;
      return normTxt(c.nombre).includes(q) || normTxt(c.ciudad).includes(q);
    });
  }, [clientes, buscar, soloConItems, filas, problemas]);

  const limpiarTodo = useCallback(() => {
    setFilas({});
    setProblemas({});
    setProblemasSueltos([]);
    cacheAvisos.current.clear();
  }, []);

  const guardar = async () => {
    // Bandera de envío: este proyecto ya duplicó abonos por un doble clic.
    if (enviando) return;
    if (impedimento) { addToast(impedimento, 'error'); return; }

    const validez = Math.max(1, Math.round(parseMonto(validezDias)) || 15);
    const tasaNum = parseMonto(tasa);

    const cotizaciones = [];
    for (const cliente of clientes) {
      const fila = filas[cliente.id];
      if (!fila) continue;
      const t = totalesFila(fila, transporteGlobalNum);
      if (!t.validos.length) continue;

      // Misma regla que se anuncia en la fila: destino registrado si lo tiene,
      // datos del cliente si no.
      const entrega = entregaDeCliente(cliente);

      cotizaciones.push({
        cliente_id: cliente.id,
        vendedor_id: usuario?.id ?? null,
        validez_dias: validez,
        tasa: tasaNum > 0 ? tasaNum : 1,
        notas: null,
        // El descuento viaja como monto total ya calculado, igual que en
        // Cotizaciones: así lo que se guarda es exactamente lo que se veía.
        descuento: t.descuento,
        tipo_descuento: fila.tipo_descuento || 'valor_fijo',
        transporte_unitario: t.transporteUnitario,
        tipo_transporte: fila.tipo_transporte?.trim() || null,
        // Los datos de entrega no se piden: los decide entregaDeCliente().
        destinatario: entrega.destinatario || null,
        direccion_entrega: entrega.direccion_entrega || null,
        ciudad_entrega: entrega.ciudad_entrega || null,
        celular: entrega.celular || null,
        detalles: t.validos.map((it) => ({
          referencia: it.referencia,
          calidad: it.calidad,
          cantidad: cantidadDe(it),
          precio_unitario: precioDe(it),
          subtotal: cantidadDe(it) * precioDe(it),
          tiene_promocion: Boolean(it.esPromocion),
        })),
      });
    }

    if (!cotizaciones.length) { addToast('No hay nada que guardar', 'error'); return; }

    const ok = await confirm({
      title: `¿Crear ${cotizaciones.length} cotización(es)?`,
      message:
        `Se apartarán ${resumen.unidades} paca(s) por un total de ${formatCOP(resumen.total)}. ` +
        `Cada cliente queda con su propia cotización, válida ${validez} día(s), y sus pacas pasan a "separada".` +
        (resumen.lineasIncompletas ? ` Ojo: ${resumen.lineasIncompletas} línea(s) sin terminar NO se enviarán.` : ''),
      confirmText: 'Sí, crear',
      cancelText: 'Revisar otra vez',
      variant: 'success',
    });
    if (!ok) return;

    setEnviando(true);
    setProblemas({});
    setProblemasSueltos([]);
    try {
      const respuesta = await cotizacionesApi.crearMasiva({
        vendedor_id: usuario?.id ?? null,
        validez_dias: validez,
        tasa: tasaNum > 0 ? tasaNum : 1,
        transporte_unitario: transporteGlobalNum,
        cotizaciones,
      });

      const creadas = Array.isArray(respuesta?.creadas) ? respuesta.creadas
        : Array.isArray(respuesta?.cotizaciones) ? respuesta.cotizaciones
        : Array.isArray(respuesta) ? respuesta
        : [];
      const cuantas = creadas.length || cotizaciones.length;

      addToast(
        `${cuantas} cotización(es) creada(s) · ${resumen.unidades} paca(s) apartadas · ${formatCOP(resumen.total)}`,
        'success'
      );
      setUltimoEnvio({ cuantas, unidades: resumen.unidades, total: resumen.total });
      limpiarTodo();
      // El stock cambió: lo que se acaba de apartar ya no está disponible. Si la
      // relectura falla se cae al respaldo, que es la lista de precios de cuando
      // se abrió la pantalla: ahí las pacas recién apartadas VUELVEN a aparecer
      // como disponibles y se podrían separar dos veces, así que hay que decirlo.
      const stockFresco = await cargarStock(tablasRef.current.listaPrecios);
      if (!stockFresco) {
        setAvisoCarga('No se pudo releer el stock después de guardar: lo que ves puede incluir pacas que acabas de apartar. Recarga la pantalla antes de crear más cotizaciones.');
      }
    } catch (err) {
      const detalle = err?.datos?.problemas;
      if (Array.isArray(detalle) && detalle.length) {
        const porCliente = {};
        const sueltos = [];
        for (const p of detalle) {
          const texto = typeof p === 'string'
            ? p
            : (p?.mensaje || p?.error || p?.detalle || p?.motivo || 'No se pudo crear esta cotización.');
          const id = typeof p === 'string' ? '' : String(p?.cliente_id ?? p?.clienteId ?? p?.id ?? '');
          // Con cliente identificado el mensaje va A SU FILA; sólo lo que no se
          // puede atribuir a nadie sube al aviso general de arriba.
          if (id) {
            (porCliente[id] = porCliente[id] || []).push(texto);
          } else {
            sueltos.push(texto);
          }
        }
        setProblemas(porCliente);
        setProblemasSueltos(sueltos);
        const marcados = Object.keys(porCliente).length;
        addToast(
          marcados
            ? `No se creó nada. Hay ${detalle.length} problema(s); revisa las ${marcados} fila(s) marcadas en rojo.`
            : `No se creó nada: ${err.message}`,
          'error'
        );
      } else {
        addToast(err.message, 'error');
      }
    } finally {
      setEnviando(false);
    }
  };

  // La matriz en Excel, pero SÓLO si se pide. Un archivo que aparece solo, sin
  // haberlo pedido, desconcierta; y además se relee del servidor para que salga
  // con lo recién guardado, no con el stock de cuando se abrió la pantalla.
  const descargarMatriz = async () => {
    if (generandoMatriz) return;
    setGenerandoMatriz(true);
    try {
      const [inventario, separadas] = await Promise.all([
        pacasApi.getInventario(),
        pacasApi.getComprometidas({}),
      ]);
      const wb = nuevoLibro();
      hojaMatrizClientes(
        wb,
        Array.isArray(inventario) ? inventario : [],
        // Lo despachado ya salió de la bodega: no es "separado para" nadie.
        (Array.isArray(separadas) ? separadas : []).filter((r) => r.estado !== 'despachada'),
      );
      await descargar(wb, 'MATRIZ');
    } catch (err) {
      addToast('No se pudo generar la matriz: ' + err.message, 'error');
    } finally {
      setGenerandoMatriz(false);
    }
  };

  const sinResultados = !cargando && clientesVisibles.length === 0;

  return (
    <Layout
      title="Separación masiva"
      subtitle="Aparta pacas para varios clientes a la vez. Cada cliente se guarda como una cotización normal."
    >
      <div className="space-y-4 pb-4">
        {/* ── Barra pegajosa: lo que vale para TODAS las filas ────────────── */}
        <div className="sticky top-[64px] z-10 -mx-1 px-1 py-3 bg-cream/95 backdrop-blur-sm border-b border-border/60">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label htmlFor={idTasa} className="block text-xs font-medium text-muted mb-1">
                Tasa del dólar
              </label>
              <input
                id={idTasa}
                type="text"
                inputMode="decimal"
                value={tasa}
                onChange={(e) => setTasa(e.target.value)}
                placeholder="Ej: 4.000"
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
            </div>

            <div className="w-40">
              <label htmlFor={idTransporte} className="block text-xs font-medium text-muted mb-1">
                Transporte por paca
              </label>
              <input
                id={idTransporte}
                type="text"
                inputMode="decimal"
                value={transporteGlobal}
                onChange={(e) => setTransporteGlobal(e.target.value)}
                placeholder="Ej: 2.000"
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
            </div>

            <div className="w-28">
              <label htmlFor={idValidez} className="block text-xs font-medium text-muted mb-1">
                Validez (días)
              </label>
              <input
                id={idValidez}
                type="number"
                min="1"
                max="90"
                value={validezDias}
                onChange={(e) => setValidezDias(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-surface text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label htmlFor={idBuscar} className="block text-xs font-medium text-muted mb-1">
                Buscar cliente
              </label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
                <input
                  id={idBuscar}
                  type="search"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Nombre o ciudad…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>
            </div>

            <label htmlFor={idSoloConItems} className="flex items-center gap-2 py-2 cursor-pointer select-none">
              <input
                id={idSoloConItems}
                type="checkbox"
                checked={soloConItems}
                onChange={(e) => setSoloConItems(e.target.checked)}
                className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/30"
              />
              <span className="text-xs font-medium text-primary">Ver sólo los que tienen ítems</span>
            </label>
          </div>

          <p className="text-[11px] text-muted mt-2">
            La tasa y el transporte de arriba valen para todos. Cada cliente puede pisar el transporte en su fila.
            Los clientes que ya tienen ítems se siguen viendo aunque no coincidan con la búsqueda.
          </p>
        </div>

        {avisoCarga && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{avisoCarga}</span>
          </div>
        )}

        {ultimoEnvio && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-success/40 bg-success/10 text-sm text-success">
            <CheckCircle size={16} className="flex-shrink-0" aria-hidden="true" />
            <span>
              Se crearon {ultimoEnvio.cuantas} cotización(es) con {ultimoEnvio.unidades} paca(s) apartadas
              por {formatCOP(ultimoEnvio.total)}.
            </span>
            <Link
              to="/cotizaciones"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Verlas en Cotizaciones <ExternalLink size={13} aria-hidden="true" />
            </Link>
            <Button
              size="sm"
              variant="success"
              icon={FileSpreadsheet}
              loading={generandoMatriz}
              onClick={descargarMatriz}
            >
              {generandoMatriz ? 'Generando…' : 'Descargar matriz en Excel'}
            </Button>
          </div>
        )}

        {problemasSueltos.length > 0 && (
          <div className="p-3 rounded-xl border border-error/40 bg-error/10 space-y-1">
            {problemasSueltos.map((t, i) => (
              <p key={i} className="text-xs text-error flex items-start gap-1.5">
                <AlertCircle size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{t}</span>
              </p>
            ))}
          </div>
        )}

        {conflictos.length > 0 && (
          <div className="p-3 rounded-xl border border-error/40 bg-error/10" role="status">
            <p className="text-xs font-semibold text-error flex items-center gap-1.5 mb-1">
              <AlertTriangle size={13} aria-hidden="true" />
              Se están pidiendo más pacas de las que hay:
            </p>
            <ul className="text-xs text-error space-y-0.5 pl-5 list-disc">
              {conflictos.slice(0, 6).map((c) => (
                <li key={`${c.referencia}|${c.calidad}`}>
                  <strong>{c.referencia} / {c.calidad}</strong>: hay {c.disponible}, se piden {c.pedido}
                  {' '}(sobran {c.pedido - c.disponible} por quitar)
                </li>
              ))}
              {conflictos.length > 6 && <li>…y {conflictos.length - 6} combinación(es) más.</li>}
            </ul>
          </div>
        )}

        {/* ── Matriz de clientes ──────────────────────────────────────────── */}
        {cargando ? (
          // El esqueleto imita la tabla, no las tarjetas de antes: si al cargar
          // se ven seis bloques altos y luego aparecen quince filas finas, la
          // pantalla parece haber cambiado de sitio todo.
          <div className="rounded-2xl border border-border/60 bg-surface divide-y divide-border/50">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse bg-primary/[0.03]" />
            ))}
          </div>
        ) : sinResultados ? (
          <Card>
            <CardBody>
              <EmptyState
                icon={Users}
                title={soloConItems ? 'Todavía no has cargado ítems' : 'Sin clientes'}
                description={
                  soloConItems
                    ? 'Quita el filtro "Ver sólo los que tienen ítems" para volver a ver la lista completa.'
                    : buscar
                      ? `Ningún cliente activo coincide con "${buscar}".`
                      : 'No hay clientes activos para cotizar.'
                }
              />
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              Mostrando {clientesVisibles.length} de {clientes.length} cliente(s) activos
              {resumen.numClientes > 0 ? ` · ${resumen.numClientes} con ítems listos` : ''}
              {' · '}la entrega usa el destino registrado del cliente y, si no tiene, sus propios datos
            </p>

            {/* La tabla es ancha y se desplaza dentro de su caja, no la página.
                Ojo con el max-h: un contenedor con overflow-x sólo se comporta
                como zona desplazable si tiene un alto que respetar, y sin él la
                cabecera `sticky top-0` no tendría contra qué pegarse. */}
            <div className="overflow-x-auto max-h-[70vh] rounded-2xl border border-border/60 bg-surface">
              <table className="w-full min-w-[920px] text-sm">
                {/* El sticky va también en cada <th>: en Safari un <thead>
                    pegajoso no basta y la cabecera se iría con el scroll.

                    z-[1] y no z-10: basta para tapar las filas (nada dentro de
                    ellas está posicionado) y deja por encima la barra de arriba,
                    que es z-10. Con las dos en z-10 ganaba la cabecera de la
                    tabla por ir después en el documento, y al bajar la página se
                    montaba encima de la tasa, el transporte y el buscador. */}
                <thead className="sticky top-0 z-[1]">
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-3 py-2 w-[20%] min-w-[170px]">Cliente</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[210px]">Referencia</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[130px]">Calidad</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-center px-1 py-2 w-[70px]">Cant.</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[120px]">Precio</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[130px]">Subtotal</th>
                    <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface px-1 py-2 w-[44px]">
                      <span className="sr-only">Quitar ítem</span>
                    </th>
                  </tr>
                </thead>

                {/* Un <tbody> por cliente: agrupa sin desplegar nada.
                    `onCatalogo` va con el setState de React tal cual: ya tiene
                    identidad estable, así que el memo de la fila sigue en pie.
                    Una función escrita en línea aquí sería nueva en cada render
                    y teclear en una fila repintaría todas las demás. */}
                {clientesVisibles.map((c) => (
                  <FilaCliente
                    key={c.id}
                    cliente={c}
                    fila={filas[c.id]}
                    avisos={avisosPorCliente[c.id]}
                    problemas={problemas[String(c.id)]}
                    transporteGlobal={transporteGlobalNum}
                    transportes={transportes}
                    opcionesReferencia={opcionesReferencia}
                    calidadesPorReferencia={calidadesPorReferencia}
                    deshabilitado={enviando}
                    onCampo={setCampo}
                    onItemCampo={setItemCampo}
                    onAgregarItem={agregarItem}
                    onQuitarItem={quitarItem}
                    onCatalogo={setTransportes}
                  />
                ))}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Pie pegajoso: el resumen siempre a la vista ─────────────────── */}
      <div className="sticky bottom-4 z-10">
        <Card className="border-secondary/40 shadow-lg">
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" role="status">
                <span className="flex items-center gap-1.5 text-muted">
                  <Users size={14} aria-hidden="true" />
                  <strong className="text-primary tabular-nums">{resumen.numClientes}</strong> cliente(s)
                </span>
                <span className="flex items-center gap-1.5 text-muted">
                  <Package size={14} aria-hidden="true" />
                  <strong className="text-primary tabular-nums">{resumen.unidades}</strong> paca(s)
                </span>
                <span className="font-display text-xl font-bold text-primary tabular-nums">
                  {formatCOP(resumen.total)}
                </span>
                {resumen.lineasIncompletas > 0 && (
                  <span className="flex items-center gap-1 text-xs text-warning">
                    <Info size={12} aria-hidden="true" />
                    {resumen.lineasIncompletas} línea(s) sin terminar no se enviarán
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end gap-1">
                <Button
                  onClick={guardar}
                  disabled={enviando || Boolean(impedimento)}
                  icon={Save}
                >
                  {enviando ? 'Creando…' : `Crear ${resumen.numClientes} cotización(es)`}
                </Button>
                {impedimento && !enviando && (
                  <span className="text-[11px] text-warning max-w-xs text-right">{impedimento}</span>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
