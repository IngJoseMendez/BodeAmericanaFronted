// ── FASE 1 · PEDIDOS ────────────────────────────────────────────────────────
//
// «Anota lo que pidió cada cliente, aunque no alcance.»
//
// Este archivo es un MOVIMIENTO, no un rediseño: la tabla y `FilaCliente` vienen
// tal cual de `SeparacionMasiva.jsx`, con sus mismos comentarios y su misma
// maquinaria de rendimiento. Lo único que cambió al mudarse son los imports y
// que los datos y los manejadores llegan por props desde el orquestador en vez
// de leerse del estado que estaba tres funciones más arriba.
//
// POR QUÉ SE PARTIÓ. El archivo pasaba de 1900 líneas y ahora tiene que
// convivir con una Fase 2 igual de grande dentro de la misma pantalla (las dos
// fases se montan a la vez: la que no está activa se oculta con `hidden` en vez
// de desmontarse, porque remontar cientos de <tbody> con sus <select> en cada
// ida y vuelta es un congelón perceptible y el diseño promete que volver es
// gratis).
//
// EL RIESGO NÚMERO UNO DE ESTE MÓDULO, y el motivo de que este componente esté
// envuelto en `memo`: mientras la dueña teclea en la Fase 2, el estado del
// reparto cambia en el orquestador con cada pulsación. Sin el memo, cada una de
// esas pulsaciones repintaría además TODA la Fase 1 —que está oculta, pero
// montada— y la pantalla se volvería melaza sin un solo error en consola. Por
// eso todas las props que bajan aquí tienen identidad estable: los objetos y
// arreglos salen de `useMemo` en el padre y los manejadores de `useCallback` sin
// dependencias.

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody, Button, EmptyState, SelectorTransporte, CampoMonto, BuscadorLista } from '../../components/common';
import { cantidadDe, precioDe, itemCompleto, totalesFila } from '../../lib/cotizacion';
import {
  normTxt, claveStock, quedanPorCalidad, textoExistencia, textoQuedanReferencia,
} from '../../lib/matriz';
import { parseMonto, formatCOP, formatNumero } from '../../lib/money';
import {
  RAYA_CABECERA, campo, entregaDeCliente, itemTieneAlgo, faltaEnItem, porCargar, textoSobreprecio,
} from './comun';
import PanelExistencias from './PanelExistencias';
import {
  Users, Search, Plus, ArrowRight, Trash2, FileSpreadsheet, RotateCcw,
  AlertTriangle, AlertCircle, Info, Package, Truck, ExternalLink, CheckCircle,
} from 'lucide-react';

// El panel de existencias se recuerda abierto o cerrado, pero SÓLO en pantalla
// ancha, donde va al lado de la tabla. En tableta flota encima de ella y
// arrancar con la tabla tapada sería un estorbo, así que ahí siempre empieza
// cerrado y abrirlo no se guarda.
const CLAVE_PANEL = 'matriz-existencias-abierto';
const esAncha = () => {
  try { return window.matchMedia('(min-width: 1280px)').matches; } catch { return false; }
};
const panelAlEntrar = () => {
  if (!esAncha()) return false;
  try {
    const guardado = localStorage.getItem(CLAVE_PANEL);
    if (guardado === '1') return true;
    if (guardado === '0') return false;
  } catch { /* sin almacenamiento: se decide por el ancho */ }
  // Sin preferencia guardada, abierto sólo donde cabe sin estorbar a la tabla.
  try { return window.matchMedia('(min-width: 1536px)').matches; } catch { return false; }
};
// Quien pidió menos movimiento en su sistema no tiene por qué ver la tabla
// deslizarse sola hasta el cliente.
const desplazamiento = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch { return 'auto'; }
};

// La forma de todos los chips de aviso de una línea. A 12px: a 10px, que es
// como estaban, no se leían sin forzar la vista en la tableta. Cada chip pone
// encima su peso y sus colores.
const CHIP = 'inline-flex items-center gap-1 text-xs leading-tight px-2 py-0.5 rounded-full';

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
  opcionesReferencia, opcionesSinStock, calidadesPorReferencia, calidadesCatalogo,
  leerExistencias, productoResaltado,
  faltante, deshabilitado, resaltado,
  onCampo, onItemCampo, onAgregarItem, onQuitarItem, onCatalogo,
  onCargarFaltante, onRespetarPrecio,
}) {
  const uid = useId();
  const items = fila?.items || [];
  const totales = totalesFila(fila, transporteGlobal);
  const hayProblema = Boolean(problemas?.length);
  const transporteHeredado = Number(transporteGlobal) || 0;
  const tipoDescuento = fila?.tipo_descuento || 'valor_fijo';
  const tieneItems = items.length > 0;

  // Cuánto del faltante de este cliente sigue SIN cargar al pedido de hoy. Es la
  // cuenta que hace idempotente el botón: cargar dos veces no puede duplicar
  // nada, y por eso se compara contra lo que ya se cargó línea a línea y no
  // contra la cantidad de la línea (que ella puede haber subido a mano porque el
  // cliente pidió más, y eso es pedido nuevo, no faltante cargado).
  const cargadoPorClave = new Map();
  for (const it of items) {
    if (!it?.cargado) continue;
    const k = claveStock(it.referencia, it.calidad);
    cargadoPorClave.set(k, (cargadoPorClave.get(k) || 0) + (Number(it.cargado) || 0));
  }
  const faltanteRestante = faltante
    ? faltante.lineas.reduce(
      (s, l) => s + porCargar(l.cantidad_abierta, cargadoPorClave.get(claveStock(l.referencia, l.calidad)) || 0),
      0,
    )
    : 0;
  const algoCargado = Boolean(faltante) && faltanteRestante < faltante.unidades;

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
      {/* EL FALTANTE VA EN LA LÍNEA DE LA CIUDAD, Y CUESTA CERO FILAS NUEVAS.
          El caso mayoritario de esta pantalla es un cliente sin ítems que ocupa
          UNA fila; meter el faltante en una línea propia multiplicaría por dos
          el alto de la tabla para enseñar un dato que la mayoría de los días no
          existe. Va aquí, dentro del párrafo que ya estaba, con la misma
          gramática de fragmentos separados por «·».
          Cuatro detalles deliberados: el `align-middle` del inline-flex (sin él
          la caja del punto empuja la altura de línea y se pierden justo los
          píxeles que se estaban protegiendo); el punto de 6px, que es lo que
          hace que se note al barrer 200 filas sin leer ninguna; que va ANTES de
          «no se creó» porque el párrafo tiene truncate y el faltante es lo único
          sin otro refuerzo en la fila; y que ES UN BOTÓN, porque pulsarlo es
          cómo se salda.
          El sufijo «· sin stock» que había aquí SE BORRÓ: pedir más de lo que
          hay dejó de ser un defecto y ahora la cuenta la lleva el chip ámbar de
          la línea. */}
      <p className="text-[11px] text-muted truncate leading-tight">
        {cliente.ciudad || 'Sin ciudad'}
        {faltante && (
          <>
            {' · '}
            <button
              type="button"
              onClick={() => onCargarFaltante(cliente.id)}
              disabled={deshabilitado}
              title={faltante.detalle}
              className="inline-flex items-center gap-1 align-middle font-semibold text-warning hover:underline underline-offset-2 disabled:opacity-50"
            >
              {/* Tres repartos de espera o más: la escalada tiene que caber en el
                  mismo espacio o crece la fila, así que es un icono de 11 y no
                  una segunda línea. */}
              {faltante.escalada && <AlertTriangle size={11} aria-hidden="true" />}
              <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
              {faltante.corto}
            </button>
          </>
        )}
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

  // «+ Lo que le faltó (7)», pegado a «+ Ítem», que es donde ya está su mano.
  // Sin confirmación: mueve tres números y se deshace con la × de siempre. Con
  // todo cargado el botón NO se esconde, se apaga: esconderlo la dejaría
  // preguntándose si lo pulsó o no, y este proyecto ya duplicó abonos por un
  // doble clic.
  const botonFaltante = faltante ? (
    <button
      type="button"
      onClick={() => onCargarFaltante(cliente.id)}
      disabled={deshabilitado || faltanteRestante <= 0}
      title={faltante.detalle}
      aria-label={`Cargar al pedido de ${cliente.nombre} lo que le quedó faltando`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning hover:underline underline-offset-2 disabled:opacity-40 disabled:no-underline"
    >
      <Plus size={12} aria-hidden="true" />
      {faltanteRestante > 0
        ? `Lo que le faltó (${faltanteRestante}${algoCargado ? ' restantes' : ''})`
        : 'Ya está cargado'}
    </button>
  ) : null;

  return (
    // El fondo rojo del grupo queda RESERVADO para lo que el servidor rechazó.
    // Antes también se encendía cuando se pedía más de lo que había, y con eso
    // media tabla amanecía en rojo en una ronda normal: cuando todo está en
    // rojo, el rojo deja de querer decir nada y el fallo de verdad —el cliente
    // cuya cotización no se creó— pasa desapercibido.
    //
    // El id es a donde lleva la tabla el panel de existencias al tocar un
    // nombre en «Lo pidieron». Lleva el prefijo `pedidos-` y NO es
    // `data-cliente-fila`, por la razón que se explica justo abajo.
    <tbody
      id={`pedidos-cliente-${cliente.id}`}
      className={`border-t border-border/70 ${
        // EL RESALTADO DE DOS SEGUNDOS AL VOLVER DEL REPARTO manda sobre los
        // demás fondos mientras dura: es lo único que le dice a la vista dónde
        // estaba. Va primero a propósito; se apaga solo y no es un estado del
        // cliente, así que no puede quedarse pintado.
        //
        // OJO, Y NO SE ARREGLA CON `data-cliente-fila`: la Fase 2 busca sus
        // filas con document.querySelector('[data-cliente-fila=…]') y las dos
        // fases están montadas a la vez, con la Fase 1 ANTES en el documento.
        // Poner aquí ese mismo atributo haría que la cinta de clientes de la
        // Fase 2 saltara a esta tabla oculta en vez de a la suya, y eso no
        // lanza ningún error: simplemente el scroll deja de ir a ninguna parte.
        // Aquí no hace falta buscar nada porque la altura de la tabla se
        // recupera guardada; sólo hay que pintar.
        resaltado
          ? 'bg-secondary/10'
          : hayProblema
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
          <td colSpan={6} className="px-3 py-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {botonAgregar}
              {botonFaltante}
            </div>
          </td>
        </tr>
      ) : (
        <>
          {items.map((item, idx) => {
            const aviso = avisos?.[idx] || null;

            // Las calidades que tienen pacas de ESTA referencia. Si no hay
            // ninguna —porque la referencia se agotó entera, que es justo el
            // caso que esta pantalla tiene que dejar capturar— se cae al
            // catálogo completo de calidades: sin eso, elegir una referencia
            // sin existencias dejaría un <select> de calidad vacío y la línea
            // no se podría terminar nunca.
            const calidadesConPacas = calidadesPorReferencia.get(normTxt(item.referencia)) || [];
            const calidadesBase = calidadesConPacas.length
              ? calidadesConPacas
              : (item.referencia ? calidadesCatalogo : []);
            // La calidad ya elegida se conserva aunque se quede sin stock:
            // si desapareciera del <select> el dato se borraría solo.
            const opcionesCal = item.calidad && !calidadesBase.some((c) => normTxt(c) === normTxt(item.calidad))
              ? [item.calidad, ...calidadesBase]
              : calidadesBase;

            // La referencia elegida no tiene ni una paca. Ya no es un caso raro
            // ni un error: es media razón de ser del rediseño —"el cliente pide
            // lo que se voló"— y por eso se anota con su chip en vez de
            // impedirse.
            const conPacas = Boolean(item.referencia)
              && opcionesReferencia.some((o) => normTxt(o.nombre) === normTxt(item.referencia));
            const enCatalogo = Boolean(item.referencia)
              && opcionesSinStock.some((o) => normTxt(o.nombre) === normTxt(item.referencia));
            const sinExistencias = Boolean(item.referencia) && !conPacas;
            // Salvaguarda de siempre, ahora para el caso de verdad raro: una
            // referencia que no está ni con pacas ni en el catálogo (el catálogo
            // no cargó, o la referencia se borró). Sin reinyectar su <option> el
            // <select> no tendría ese valor y el dato ya escrito se borraría
            // solo al repintar.
            const refHuerfana = Boolean(item.referencia) && !conPacas && !enCatalogo;

            // Lo que dice el aviso depende de si ya hay calidad. Sin calidad
            // llega el desglose de la referencia (`calidades`); con calidad, la
            // cuenta de esa calidad (`disponible`/`pedido`) y, si no alcanza, lo
            // que queda de las demás (`otras`).
            const porCalidad = !item.calidad && aviso?.calidades?.length ? aviso.calidades : null;
            const cuenta = item.calidad && aviso && aviso.disponible !== undefined ? aviso : null;
            const sinPrecio = Boolean(item.avisoPrecio) && precioDe(item) <= 0;
            // «Falta …» sin repetir lo que ya dice otro aviso de la misma línea:
            // con los botones de calidad a la vista, «falta calidad» sobra, y
            // con «Sin precio — escríbelo», «falta precio» también. Y sin
            // calidad todavía no se pide el precio: se pone solo al escogerla,
            // así que avisarlo antes es pedirle algo que no le toca escribir.
            const falta = itemTieneAlgo(item) && !itemCompleto(item)
              ? faltaEnItem(item).filter((f) => !(f === 'calidad' && porCalidad)
                && !(f === 'precio' && (sinPrecio || !item.calidad)))
              : [];
            // Esta línea trae mercancía del libro de faltantes. El chip lo dice
            // en la línea porque decide cómo se reparte en la Fase 2: es lo que
            // «Cubrir lo que faltó» va a pagar primero.
            const deAntes = Number(item.cargado) || 0;
            // El precio al que se le debía, contra el de hoy. Sólo se ofrece
            // respetar el viejo cuando hoy está MÁS CARO: ofrecerlo al revés
            // sería ofrecerle cobrar de más a un cliente al que ya se le falló.
            const origen = Number(item.precioOrigen) || 0;
            const precioHoy = precioDe(item);
            const masCaroHoy = origen > 0 && precioHoy > origen && !item.respetaOrigen;
            const masBaratoHoy = origen > 0 && precioHoy < origen && !item.respetaOrigen;
            // «sin existencias» de la REFERENCIA sólo mientras no haya calidad:
            // con calidad escogida lo dice el chip de la cuenta, y dos chips
            // iguales en la misma línea eran ruido.
            const referenciaAgotada = sinExistencias && !item.calidad;
            const hayChips = Boolean(
              cuenta || item.esPromocion || falta.length || sinPrecio || referenciaAgotada
              || deAntes > 0 || masCaroHoy || masBaratoHoy || item.respetaOrigen,
            );

            // Lo que esta línea ya pide, para que las listas no se lo descuenten
            // a ella misma: si pide 5 de Primera y vuelve a abrir la lista, lo
            // que tiene que leer es cuántas le caben a ella.
            const propia = itemCompleto(item)
              ? { clave: claveStock(item.referencia, item.calidad), cantidad: cantidadDe(item) }
              : null;
            // Las dos listas se arman AL ABRIRSE (son funciones): sus cuentas
            // cambian con cada tecla de otra fila y esta fila no se repinta por
            // eso. Ver `leerExistencias` en el orquestador.
            const gruposReferencia = () => {
              const { stock, pedidos } = leerExistencias();
              return [
                ...(refHuerfana
                  ? [{ label: null, opciones: [{ value: item.referencia, label: item.referencia, detalle: 'sin existencias', apagada: true }] }]
                  : []),
                ...(opcionesReferencia.length > 0
                  ? [{
                    label: 'Con existencias',
                    opciones: opcionesReferencia.map((o) => ({
                      value: o.nombre,
                      label: o.nombre,
                      detalle: textoQuedanReferencia(quedanPorCalidad(
                        o.nombre, calidadesPorReferencia.get(normTxt(o.nombre)) || [], stock, pedidos, propia,
                      )),
                    })),
                  }]
                  : []),
                ...(opcionesSinStock.length > 0
                  ? [{ label: 'Sin existencias', opciones: opcionesSinStock.map((o) => ({ value: o.nombre, label: o.nombre, detalle: 'sin existencias', apagada: true })) }]
                  : []),
              ];
            };
            const opcionesCalidad = () => {
              const { stock, pedidos } = leerExistencias();
              return quedanPorCalidad(item.referencia, opcionesCal, stock, pedidos, propia).map((q) => ({
                value: q.calidad,
                label: q.calidad,
                detalle: textoExistencia(q),
                apagada: q.hay === 0,
              }));
            };

            // El panel de existencias resalta las líneas del producto que se
            // tocó. Va en las celdas de la línea y no en el <tr>: el <tr> de la
            // primera línea lleva también la celda del cliente, que cubre todo
            // el bloque, y resaltarla haría parecer resaltado al cliente entero.
            const resaltadaLinea = Boolean(productoResaltado) && Boolean(item.calidad)
              && claveStock(item.referencia, item.calidad) === productoResaltado;
            const fondo = resaltadaLinea ? 'bg-secondary/10' : '';

            const idRef = `${uid}-ref-${idx}`;
            const idCal = `${uid}-cal-${idx}`;
            const idCant = `${uid}-cant-${idx}`;
            const idPrecio = `${uid}-precio-${idx}`;

            return (
              // Sin fondo por exceso. Pedir más de lo que hay dejó de teñir la
              // línea: la cuenta la lleva el chip de abajo, en ámbar, y el rojo
              // se reserva para lo que el servidor rechaza.
              <tr key={idx}>
                {/* El nombre se escribe una sola vez y cubre las filas del
                    cliente más su pie: repetirlo en cada línea sería ruido. */}
                {idx === 0 && (
                  <td rowSpan={items.length + 1} className="px-3 py-1.5 align-top border-r border-border/40">
                    {infoCliente}
                  </td>
                )}

                <td
                  className={`px-2 py-1.5 align-top ${fondo}`}
                  // La raya de la izquierda es lo que se encuentra con el ojo al
                  // barrer la tabla: un fondo suave solo se pierde entre las
                  // demás líneas.
                  style={resaltadaLinea ? { boxShadow: 'inset 3px 0 0 var(--color-secondary)' } : undefined}
                >
                  <label htmlFor={idRef} className="sr-only">Referencia del ítem {idx + 1}</label>
                  {/* Dos grupos, y el segundo es el cambio que sostiene el
                      encargo entero. Hasta hoy la lista solo ofrecia lo que
                      tenia pacas, asi que el pedido de algo que se volo NO SE
                      PODIA NI ANOTAR --y ese es exactamente el caso que motivo
                      el rediseno--. Ahora lo agotado se elige igual, se queda
                      registrado y se reparte (o se queda faltando) en el paso 2.
                      El precio se resuelve con la cascada de siempre, que no
                      depende del stock. */}
                  <BuscadorLista
                    id={idRef}
                    value={item.referencia}
                    disabled={deshabilitado}
                    aria-label={`Referencia del item ${idx + 1} de ${cliente.nombre}`}
                    onChange={(v) => onItemCampo(cliente.id, idx, 'referencia', v)}
                    placeholder="Elegir referencia"
                    // Cada referencia enseña debajo lo que queda de CADA calidad
                    // («quedan: Primera 4 · Segunda 10 · Tercera 0») en vez del
                    // «· 30 disp» que las sumaba. Y al escogerla el campo dice
                    // sólo el nombre: la cuenta ya no se queda escrita en él,
                    // vieja, mientras otros clientes piden lo mismo.
                    grupos={gruposReferencia}
                    anchoLista={320}
                    className={campo(false, 'w-full px-2')}
                  />

                  {/* Avisos del ítem, en corto y con el texto completo en el
                      title: en una tabla densa una frase larga por línea
                      devolvería la pantalla al tamaño de antes. El title sólo
                      AMPLÍA lo que el chip ya dice; ningún aviso vive únicamente
                      ahí, porque en tableta no hay ratón que lo saque.
                      VAN A 12PX Y NINGUNO REPITE A OTRO. Estaban a 10px, por
                      debajo de lo que se lee sin forzar la vista de pie en la
                      bodega, y una línea podía llevar a la vez «sin
                      existencias» y «hay 0 · piden 5», o «Sin precio —
                      escríbelo» y «Falta precio»: dos avisos del mismo hecho.
                      Ahora hay UN aviso de existencias por línea y «Falta …» no
                      nombra lo que ya dice otro chip. */}
                  {hayChips && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {/* EL SEMÁFORO CAMBIA DE COLOR Y DE PALABRA SIN MOVERSE
                          DE SITIO NI DE TAMAÑO. Donde antes decía "Faltan 10"
                          en rojo ahora dice "hay 10 · piden 20" en ámbar.
                          Dos motivos, y ninguno es cosmético:
                          · La palabra FALTANTE está reservada. Un faltante sólo
                            nace DESPUÉS de repartir; en esta fase todavía no le
                            falta nada a nadie, sólo hay menos mercancía que
                            demanda. Usarla aquí la haría significar dos cosas
                            distintas en la misma pantalla.
                          · El rojo prometía un error que había que arreglar, y
                            la única forma de arreglarlo era borrar el pedido de
                            alguien. Ahora se anota, y se reparte en el paso 2.
                          Los otros dos tramos se conservan tal cual: margen de
                          2 o menos en ámbar, holgado en verde. Y sale en cuanto
                          hay referencia y calidad, sin esperar a la cantidad ni
                          al precio: es al escoger cuando hace falta saberlo. */}
                      {cuenta && (
                        <span
                          title={
                            cuenta.disponible === 0
                              ? `No queda ninguna paca de ${item.referencia} / ${item.calidad}. Se puede pedir igual:`
                                + ' queda anotado y, si no llega nada, se le queda faltando.'
                              : cuenta.excede
                                ? `Se piden ${cuenta.pedido} pacas de ${item.referencia} / ${item.calidad}`
                                  + ` y hay ${cuenta.disponible}. Lo repartes en el paso 2.`
                                : `${cuenta.disponible} disponibles · ${cuenta.pedido} pedidas entre todos los clientes, contando esta línea`
                          }
                          className={`${CHIP} font-medium ${
                            cuenta.disponible === 0 || cuenta.excede || cuenta.disponible - cuenta.pedido <= 2
                              ? 'bg-warning/15 text-warning'
                              : 'bg-success/15 text-success'
                          }`}
                        >
                          {cuenta.disponible === 0 ? (
                            <><AlertTriangle size={12} aria-hidden="true" /> sin existencias</>
                          ) : (
                            <>
                              <Package size={12} aria-hidden="true" />
                              {cuenta.excede
                                ? `hay ${cuenta.disponible} · piden ${cuenta.pedido}`
                                : `quedan ${cuenta.disponible - cuenta.pedido}`}
                            </>
                          )}
                        </span>
                      )}
                      {/* La referencia elegida no tiene ni una paca. Se dice en
                          la línea, no en el borde del campo: es un dato de la
                          mercancía, no un defecto de lo que ella escribió. */}
                      {referenciaAgotada && (
                        <span
                          title={`No queda ninguna paca de ${item.referencia}. Se puede pedir igual: queda anotado y, si no llega nada, se le queda faltando.`}
                          className={`${CHIP} font-medium text-warning bg-warning/15`}
                        >
                          <AlertTriangle size={12} aria-hidden="true" /> sin existencias
                        </span>
                      )}
                      {/* «3 de antes»: de las que se piden en esta línea, tres
                          venían del libro de faltantes. Sin este chip la línea
                          cargada es indistinguible de una tecleada a mano y no
                          hay forma de saber qué se le está reponiendo. */}
                      {deAntes > 0 && (
                        <span
                          title={`${deAntes} de esta línea vienen de lo que le quedó faltando en repartos anteriores. Si repartes al menos esas ${deAntes}, el faltante se abona.`}
                          className={`${CHIP} font-medium text-warning bg-warning/15`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                          {deAntes} de antes
                        </span>
                      )}
                      {/* Precio de entonces contra precio de hoy. Pulsable SÓLO
                          cuando hoy está más caro: es un gesto de cortesía con
                          quien ya se quedó esperando una vez. Al revés sería
                          ofrecer cobrarle de más. */}
                      {masCaroHoy && (
                        <button
                          type="button"
                          onClick={() => onRespetarPrecio(cliente.id, idx)}
                          disabled={deshabilitado}
                          title={`Se lo debíamos a ${formatCOP(origen)} y ${textoSobreprecio(precioHoy, origen)}. Está puesto el de hoy; pulsa para respetarle el anterior.`}
                          className={`${CHIP} font-semibold text-warning bg-warning/10 hover:bg-warning/20 disabled:opacity-50`}
                        >
                          Respetar {formatNumero(origen)}
                        </button>
                      )}
                      {masBaratoHoy && (
                        <span
                          title={`Se lo debíamos a ${formatCOP(origen)} y hoy vale ${formatCOP(precioHoy)}. Se le cobra el de hoy, que le favorece.`}
                          className={`${CHIP} font-medium text-muted bg-primary/5`}
                        >
                          Precio cambió
                        </span>
                      )}
                      {item.respetaOrigen && (
                        <span
                          title="Se le está respetando el precio que tenía cuando se le quedó debiendo."
                          className={`${CHIP} font-semibold text-secondary bg-secondary/10`}
                        >
                          Precio de antes
                        </span>
                      )}
                      {item.esPromocion && (
                        <span className={`${CHIP} font-semibold text-warning bg-warning/15`}>
                          <AlertCircle size={12} aria-hidden="true" /> Promoción
                        </span>
                      )}
                      {sinPrecio && (
                        <span
                          title={item.avisoPrecio}
                          className={`${CHIP} font-medium text-warning bg-warning/10`}
                        >
                          <AlertCircle size={12} aria-hidden="true" /> Sin precio — escríbelo
                        </span>
                      )}
                      {falta.length > 0 && (
                        <span
                          title="Mientras falte algo, esta línea no se envía"
                          className={`${CHIP} font-medium text-warning bg-warning/10`}
                        >
                          Falta {falta.join(', ')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* ESCOGER LA REFERENCIA YA DICE CUÁNTO QUEDA DE CADA
                      CALIDAD. Es el momento exacto del encargo: «Mixta
                      Invierno» llega en tres calidades y lo que importa es
                      cuántas quedan de la que pide el cliente, no la suma. Un
                      toque escoge la calidad. tabIndex={-1}: con teclado el
                      camino sigue siendo la lista de calidad de al lado, que
                      enseña las mismas cuentas, y estos botones no pueden
                      meterse entre la referencia y la calidad en el Tab. */}
                  {porCalidad && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="text-xs text-muted">Escoge calidad:</span>
                      {porCalidad.map((q) => (
                        <button
                          key={q.calidad}
                          type="button"
                          tabIndex={-1}
                          disabled={deshabilitado}
                          onClick={() => onItemCampo(cliente.id, idx, 'calidad', q.calidad)}
                          className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-lg border text-xs disabled:opacity-50 ${
                            q.quedan > 0
                              ? 'border-secondary/40 bg-surface text-primary hover:bg-secondary/10'
                              : 'border-border bg-surface text-muted hover:bg-primary/5'
                          }`}
                        >
                          <span className="font-semibold">{q.calidad}</span>
                          <span className="tabular-nums">{textoExistencia(q)}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* La calidad escogida no alcanza (o no tiene ni una paca) y
                      otra de la misma referencia sí tiene. Sólo se cuenta: pasar
                      a otra calidad cambia el precio y eso se habla con el
                      cliente. Si le sirve, se cambia en la lista de calidad. */}
                  {cuenta && cuenta.otras.length > 0 && (
                    <p className="text-xs text-muted mt-1">
                      De otra calidad quedan:{' '}
                      <span className="tabular-nums text-primary">
                        {cuenta.otras.map((o) => `${o.calidad} ${o.quedan}`).join(' · ')}
                      </span>
                    </p>
                  )}
                </td>

                <td className={`px-2 py-1.5 align-top ${fondo}`}>
                  <label htmlFor={idCal} className="sr-only">Calidad del ítem {idx + 1}</label>
                  <BuscadorLista
                    value={item.calidad}
                    onChange={(valorElegido) => onItemCampo(cliente.id, idx, 'calidad', valorElegido)}
                    opcionVacia={item.referencia && opcionesCal.length === 0 ? 'Sin calidades' : 'Calidad…'}
                    placeholder={item.referencia && opcionesCal.length === 0 ? 'Sin calidades' : 'Calidad…'}
                    // Cada calidad con lo que queda de ella en la ronda: «quedan
                    // 4 de 12», «hay 8 · ya piden 11», «sin existencias».
                    opciones={opcionesCalidad}
                    anchoLista={240}
                    id={idCal}
                    disabled={deshabilitado}
                    aria-label={`Calidad del ítem ${idx + 1} de ${cliente.nombre}`}
                    className={campo(false, 'w-full px-2')}
                  />
                </td>

                <td className={`px-1 py-1.5 align-top ${fondo}`}>
                  {/* Tampoco aquí hay borde rojo por pedir de más: `mal` vuelve
                      a significar sólo "el dato está incompleto", nunca "sobra".
                      Este campo no salía en la lista de seis sitios del diseño,
                      pero dejarlo en rojo mientras el select de al lado ya no lo
                      está sería peor que no cambiar nada. */}
                  <label htmlFor={idCant} className="sr-only">Cantidad del ítem {idx + 1}</label>
                  <CampoMonto
                    id={idCant}
                    decimales={0}
                    value={item.cantidad}
                    disabled={deshabilitado}
                    aria-label={`Cantidad del ítem ${idx + 1} de ${cliente.nombre}`}
                    onChange={(e) => onItemCampo(cliente.id, idx, 'cantidad', e.target.value)}
                    className={campo(false, 'w-full text-center tabular-nums px-1')}
                  />
                </td>

                <td className={`px-2 py-1.5 align-top ${fondo}`}>
                  <label htmlFor={idPrecio} className="sr-only">Precio por paca del ítem {idx + 1}</label>
                  {/* Aquí vivía un onBlur que reformateaba a mano al salir del
                      campo, con el argumento de que meter el punto de miles en
                      cada tecla haría imposible escribir. Es verdad si el cursor
                      salta al final en cada pulsación, que es lo que pasaba en
                      las cuatro copias que había de esto. CampoMonto cuenta los
                      dígitos que hay a la izquierda del cursor y lo vuelve a
                      poner donde estaba, así que se puede formatear mientras se
                      teclea, que es cuando de verdad sirve. */}
                  <CampoMonto
                    id={idPrecio}
                    value={item.precio}
                    disabled={deshabilitado}
                    aria-label={`Precio por paca del ítem ${idx + 1} de ${cliente.nombre}`}
                    onChange={(e) => onItemCampo(cliente.id, idx, 'precio', e.target.value)}
                    placeholder="Precio"
                    className={`h-8 px-2 w-full rounded-lg border text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50 ${
                      item.esPromocion
                        ? 'border-warning bg-warning/10 font-semibold'
                        : 'border-border bg-surface'
                    }`}
                  />
                </td>

                <td className={`px-2 py-1.5 align-top text-right ${fondo}`}>
                  <span className="inline-flex h-8 items-center text-sm font-semibold tabular-nums text-primary">
                    {formatCOP(cantidadDe(item) * precioDe(item))}
                  </span>
                </td>

                <td className={`px-1 py-1.5 align-top text-center ${fondo}`}>
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
                {botonFaltante}

                <div className="flex items-center gap-1">
                  <label htmlFor={`${uid}-desc`} className="sr-only">Descuento por paca</label>
                  <BuscadorLista
                    value={tipoDescuento}
                    onChange={(valorElegido) => onCampo(cliente.id, 'tipo_descuento', valorElegido)}
                    opciones={[
                      { value: 'valor_fijo', label: '$' },
                      { value: 'porcentaje', label: '%' },
                    ]}
                    disabled={deshabilitado}
                    aria-label={`Tipo de descuento de ${cliente.nombre}`}
                    className={campo(false, 'w-14 px-2')}
                  />
                  <CampoMonto
                    id={`${uid}-desc`}
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
                  <CampoMonto
                    id={`${uid}-trans`}
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
// La pantalla de la Fase 1 entera: barra pegajosa, avisos, tabla y pie.
//
// Va en `memo` por la razón que explica la cabecera del archivo: mientras se
// reparte en la Fase 2 esta pantalla sigue montada (oculta con `hidden`) y no
// puede repintarse con cada tecla del reparto.
// ─────────────────────────────────────────────────────────────────────────────
const FasePedidos = memo(function FasePedidos({
  // `clienteResaltado` LLEGABA Y SE TIRABA A LA BASURA. El orquestador ya lo
  // bajaba (es el cliente del que venía al pulsar «Volver a los pedidos») y esta
  // firma no lo recogía, así que la mitad de la vuelta funcionaba —la tabla
  // quedaba a la altura correcta— y la otra mitad no se veía: ni subrayado ni
  // señal ninguna. Encima el memo de esta fase se caía dos veces por vuelta
  // (null → id → null) para no pintar nada distinto. Nada fallaba; sólo no
  // pasaba lo prometido, que es la forma cara de romperse en esta pantalla.
  oculto, clienteResaltado,
  cargando, clientes, clientesVisibles, filas, avisos, problemas, problemasSueltos,
  transportes, transporteGlobalNum,
  opcionesReferencia, opcionesSinStock, calidadesPorReferencia, calidadesCatalogo,
  leerExistencias, existencias,
  faltantes, selloFaltantes, clientesConFaltante, unidadesFaltantes,
  enviando, cruzando, impedimento, resumen, conflictos, avisoCarga,
  borradorRecuperado, ultimoEnvio, generandoMatriz, estadoGuardado,
  tasa, transporteGlobal, validezDias, buscar, soloConItems, soloConFaltante,
  datosGlobalesFaltan = [], sacudida = 0,
  onTasa, onTransporte, onValidez, onBuscar, onSoloConItems, onSoloConFaltante,
  onCampo, onItemCampo, onAgregarItem, onQuitarItem, onCatalogo,
  onCargarFaltante, onCargarTodoFaltante, onRespetarPrecio,
  onDescartarBorrador, onRepartir, onDescargarMatriz,
}) {
  // Ids FIJOS y no useId: el orquestador enfoca el primero que falte con
  // getElementById cuando se intenta pasar al reparto sin llenarlos, y para eso
  // tiene que saber como se llaman.
  const idTasa = 'matriz-tasa';
  const idTransporte = 'matriz-transporte';
  const idValidez = useId();
  const idBuscar = useId();
  const idSoloConItems = useId();

  const sinResultados = !cargando && clientesVisibles.length === 0;
  // `selloFaltantes` no se usa para pintar nada: existe para que el memo de este
  // componente se entere de que el Map de faltantes —que viaja en un ref y por
  // tanto NUNCA cambia de identidad— tiene contenido nuevo. Sin él, cargar los
  // faltantes o abonarlos después de repartir no repintaría ni un chip.
  void selloFaltantes;

  // Un campo global sin llenar se pinta en rojo y, al intentar saltarselo, se
  // sacude. La clave con `sacudida` remonta el nodo para que la animacion vuelva
  // a correr en el segundo intento.
  const faltaTasa = datosGlobalesFaltan.includes('tasa');
  const faltaTransporte = datosGlobalesFaltan.includes('transporte');
  const claseCampo = (falta) => [
    'w-full px-3 py-2 rounded-xl border bg-surface text-sm tabular-nums',
    'focus:outline-none focus:ring-2',
    falta
      ? 'border-error focus:ring-error/30'
      : 'border-border focus:ring-secondary/30',
  ].join(' ');

  // ── El panel de existencias ───────────────────────────────────────────────
  // El estado vive AQUÍ y no en el orquestador: abrirlo, cerrarlo o tocar un
  // producto sólo repinta esta fase, nunca la del reparto.
  const [panelAbierto, setPanelAbierto] = useState(panelAlEntrar);
  const [productoSel, setProductoSel] = useState(null);
  const soltarTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(soltarTimerRef.current), []);

  const abrirPanel = useCallback((abrir) => {
    setPanelAbierto(abrir);
    // Cerrar el panel suelta también el producto tocado: con el panel cerrado
    // no queda a la vista qué producto era, y unas líneas resaltadas sin
    // motivo visible se leen como un estado de esos clientes.
    if (!abrir) {
      clearTimeout(soltarTimerRef.current);
      setProductoSel(null);
    }
    // Sólo se recuerda en pantalla ancha, donde el panel va al lado de la
    // tabla. En tableta tapa la tabla, así que abrirlo allí es de paso.
    if (!esAncha()) return;
    try { localStorage.setItem(CLAVE_PANEL, abrir ? '1' : '0'); } catch { /* sin almacenamiento: no se recuerda */ }
  }, []);
  const cerrarPanel = useCallback(() => abrirPanel(false), [abrirPanel]);

  // Los clientes que pidieron el producto tocado. A cada fila le baja un TEXTO
  // (la clave del producto) o null, nunca el Set: así, tocar un producto sólo
  // repinta las filas de quien lo pidió, y teclear no repinta ninguna de más.
  const clientesDelProducto = useMemo(() => {
    if (!productoSel) return null;
    for (const g of existencias || []) {
      for (const c of g.calidades) if (c.clave === productoSel) return new Set(c.clientes.map((x) => x.id));
    }
    return new Set();
  }, [existencias, productoSel]);

  // Llevar la tabla hasta el cliente que se tocó en «Lo pidieron». En tableta
  // el panel se cierra primero, porque tapa justo la tabla a la que se va; ahí
  // el resaltado se queda unos segundos para que el ojo encuentre la línea y
  // luego se suelta solo, igual que el de volver del reparto: con el panel
  // cerrado no quedaría a la vista por qué está resaltada.
  const irACliente = useCallback((clienteId) => {
    if (!esAncha()) {
      setPanelAbierto(false);
      clearTimeout(soltarTimerRef.current);
      soltarTimerRef.current = setTimeout(() => setProductoSel(null), 2500);
    }
    window.setTimeout(() => {
      document.getElementById(`pedidos-cliente-${clienteId}`)
        ?.scrollIntoView({ block: 'center', behavior: desplazamiento() });
    }, 0);
  }, []);

  // La franja ámbar nombra los productos que no alcanzan; cada nombre abre el
  // panel con ese producto tocado, que es donde se ve quién lo pidió.
  const verProducto = useCallback((clave) => {
    abrirPanel(true);
    clearTimeout(soltarTimerRef.current);
    setProductoSel(clave);
  }, [abrirPanel]);
  // Tocar un producto en el panel cancela el soltado pendiente de un salto
  // anterior: si no, el resaltado nuevo se apagaría solo a los dos segundos.
  const elegirProducto = useCallback((clave) => {
    clearTimeout(soltarTimerRef.current);
    setProductoSel(clave);
  }, []);

  return (
    <>
      <div className={`flex flex-col flex-1 min-h-0 ${oculto ? 'hidden' : ''}`}>
        {/* ── Barra pegajosa: lo que vale para TODAS las filas ────────────── */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 bg-cream border-b border-border/60">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32" key={`tasa-${sacudida}`}>
              <label htmlFor={idTasa} className="block text-xs font-medium text-muted mb-1">
                Tasa del dólar <span className="text-error" aria-hidden="true">*</span>
              </label>
              <CampoMonto
                id={idTasa}
                value={tasa}
                onChange={(e) => onTasa(e.target.value)}
                placeholder="Ej: 4.000"
                required
                aria-invalid={faltaTasa}
                aria-describedby={faltaTasa ? `${idTasa}-falta` : undefined}
                className={`${claseCampo(faltaTasa)} ${faltaTasa && sacudida ? 'animate-sacudir' : ''}`}
              />
              {faltaTasa && (
                <p id={`${idTasa}-falta`} className="mt-1 flex items-start gap-1 text-[11px] text-error leading-tight">
                  <AlertCircle size={12} className="mt-px flex-shrink-0" aria-hidden="true" />
                  Escríbela, aunque sea 0
                </p>
              )}
            </div>

            <div className="w-40" key={`transporte-${sacudida}`}>
              <label htmlFor={idTransporte} className="block text-xs font-medium text-muted mb-1">
                Transporte por paca <span className="text-error" aria-hidden="true">*</span>
              </label>
              <CampoMonto
                id={idTransporte}
                value={transporteGlobal}
                onChange={(e) => onTransporte(e.target.value)}
                placeholder="Ej: 2.000"
                required
                aria-invalid={faltaTransporte}
                aria-describedby={faltaTransporte ? `${idTransporte}-falta` : undefined}
                className={`${claseCampo(faltaTransporte)} ${faltaTransporte && sacudida ? 'animate-sacudir' : ''}`}
              />
              {faltaTransporte && (
                <p id={`${idTransporte}-falta`} className="mt-1 flex items-start gap-1 text-[11px] text-error leading-tight">
                  <AlertCircle size={12} className="mt-px flex-shrink-0" aria-hidden="true" />
                  Escríbelo, aunque sea 0
                </p>
              )}
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
                onChange={(e) => onValidez(e.target.value)}
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
                  onChange={(e) => onBuscar(e.target.value)}
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
                onChange={(e) => onSoloConItems(e.target.checked)}
                className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/30"
              />
              <span className="text-xs font-medium text-primary">Ver sólo los que tienen ítems</span>
            </label>

            {/* CONTADOR-FILTRO. Resuelve el arranque real de una ronda, que es
                «primero miro a quién arrastro». Cero peticiones: filtra sobre un
                Map que ya está cargado. Si no se le debe nada a nadie NO se
                renderiza — un contador en cero es ruido que además se lee como
                «no le debo nada a nadie», que es justo lo que no se puede
                afirmar cuando la consulta pudo haber fallado. */}
            {clientesConFaltante > 0 && (
              <button
                type="button"
                aria-pressed={soloConFaltante}
                onClick={() => onSoloConFaltante(!soloConFaltante)}
                title={`Hay ${clientesConFaltante} cliente(s) con mercancía faltando de repartos anteriores. Púlsalo para ver sólo a esos.`}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                  soloConFaltante
                    ? 'border-warning bg-warning/20 text-warning'
                    : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/20'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden="true" />
                Le faltó a {clientesConFaltante} cliente(s)
              </button>
            )}

            {/* El global SÍ lleva confirmación —la pide el diseño— porque toca
                muchos clientes de golpe; el de cada fila no, porque mueve tres
                números y se deshace con la × de siempre. */}
            {unidadesFaltantes > 0 && (
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={onCargarTodoFaltante} disabled={enviando}>
                Cargar todo lo que faltó ({unidadesFaltantes})
              </Button>
            )}

            {/* Abre y cierra el panel de existencias. Dice «Existencias» y no
                «Inventario» porque no es el inventario entero: es lo que hay
                disponible contra lo que se pide en ESTA ronda. */}
            <button
              type="button"
              onClick={() => abrirPanel(!panelAbierto)}
              aria-expanded={panelAbierto}
              aria-controls="matriz-existencias"
              className={`ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-semibold transition-colors ${
                panelAbierto
                  ? 'border-secondary bg-secondary/15 text-secondary'
                  : 'border-border bg-surface text-primary hover:bg-primary/5'
              }`}
            >
              <Package size={14} aria-hidden="true" />
              Existencias
            </button>
          </div>

          <p className="text-[11px] text-muted mt-2">
            La tasa y el transporte de arriba valen para todos y hay que escribirlos, aunque sea en cero. Cada cliente puede pisar el transporte en su fila.
            Los clientes que ya tienen ítems se siguen viendo aunque no coincidan con la búsqueda.
            {estadoGuardado ? ` · ${estadoGuardado}` : ''}
          </p>
        </div>

        {/* Debajo de la barra, dos columnas: los avisos con la tabla, y el panel
            de existencias a la derecha cuando está abierto. El panel NO va
            encima de la tabla en pantalla ancha: ahí se consulta mientras se
            escribe, y taparle las filas a quien está escribiendo en ellas es
            justo lo que no puede pasar. */}
        <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">

        {/* Los avisos, en su propia banda fija. No entran en el scroll de la
            tabla ni le roban alto: se leen una vez y se quedan quietos. */}
        <div className="flex-shrink-0 px-4 sm:px-6 pt-2 space-y-2 empty:hidden">

        {avisoCarga && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{avisoCarga}</span>
          </div>
        )}

        {/* Lo que se recuperó del navegador. La franja se queda mientras dure la
            sesión de trabajo y no se cierra sola a propósito: es donde vive el
            único botón capaz de deshacer una recuperación que ella no quería, y
            un aviso que se desvanece se lleva el botón con él. Desaparece al
            pulsar "Empezar de cero" y al crear las cotizaciones, que son las dos
            veces en que deja de haber borrador. */}
        {borradorRecuperado && (
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 rounded-xl border border-secondary/40 bg-secondary/10 text-xs text-primary"
            role="status"
          >
            <Info size={14} className="flex-shrink-0 text-secondary" aria-hidden="true" />
            <span className="min-w-0">
              Recuperé la matriz que dejaste a medias
              {borradorRecuperado.cuando ? ` el ${borradorRecuperado.cuando}` : ''}
              {borradorRecuperado.origen === 'servidor' ? ' (guardada en el servidor)' : ''}:{' '}
              <strong className="font-semibold">{borradorRecuperado.cuantos} cliente(s)</strong> con líneas.
              Sigue donde ibas — todavía no se ha creado ninguna cotización.
            </span>
            <button
              type="button"
              onClick={onDescartarBorrador}
              className="text-[11px] font-semibold text-secondary hover:underline underline-offset-2"
            >
              Empezar de cero
            </button>
          </div>
        )}

        {ultimoEnvio && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-success/40 bg-success/10 text-sm text-success">
            <CheckCircle size={16} className="flex-shrink-0" aria-hidden="true" />
            <span>
              Se crearon {ultimoEnvio.cuantas} cotización(es) con {ultimoEnvio.unidades} paca(s) apartadas
              por {formatCOP(ultimoEnvio.total)}
              {ultimoEnvio.faltantes > 0
                ? ` y quedaron anotadas ${ultimoEnvio.faltantes} paca(s) faltando.`
                : '.'}
            </span>
            <Link
              to="/cotizaciones"
              className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
            >
              Verlas en Cotizaciones <ExternalLink size={13} aria-hidden="true" />
            </Link>
            {/* La foto del reparto: «en esa entrega se le dieron tantos y
                quedaron faltando tantos», que es la frase literal del encargo.
                Sólo se ofrece cuando el reparto quedó registrado con número. */}
            {ultimoEnvio.numero && (
              <Link
                to={`/faltantes?reparto=${encodeURIComponent(ultimoEnvio.numero)}`}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
              >
                Ver el reparto {ultimoEnvio.numero} <ExternalLink size={13} aria-hidden="true" />
              </Link>
            )}
            <Button
              size="sm"
              variant="success"
              icon={FileSpreadsheet}
              loading={generandoMatriz}
              onClick={onDescargarMatriz}
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

        {/* EL BANNER ROJO SE VUELVE FRANJA ÁMBAR, Y CON ÉL CAMBIA LO QUE DICE.
            Antes anunciaba un error —"se están pidiendo más pacas de las que
            hay"— y remataba con "sobran N por quitar", o sea: le pedía a la
            usuaria que borrara pedidos reales de clientes reales para poder
            guardar. Ahora dice el mismo hecho sin llamarlo fallo y señala a
            dónde se resuelve, que es el paso 2. El orden lo pone `conflictos`,
            que ya venía ordenado por lo que más falta. */}
        {conflictos.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-warning" role="status">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                {conflictos.length} producto(s) no alcanzan para todo lo pedido.
                No es un error: los repartes en el paso 2.
              </p>
              {/* Sólo los tres primeros y en una línea: con quince, la franja se
                  come la tabla y deja de leerse. El detalle completo de cada uno
                  está en su propia fila, en el chip de la línea, y en el panel
                  de existencias: cada nombre lo abre con ese producto tocado,
                  que es donde se ve quién lo pidió. */}
              <p className="text-xs mt-0.5">
                {conflictos.slice(0, 3).map((c, i) => (
                  <span key={`${c.referencia}|${c.calidad}`}>
                    {i > 0 && ' · '}
                    <button
                      type="button"
                      onClick={() => verProducto(claveStock(c.referencia, c.calidad))}
                      title="Ver quién lo pidió en el panel de existencias"
                      className="font-semibold underline underline-offset-2 hover:no-underline"
                    >
                      {c.referencia} / {c.calidad}
                    </button>
                    {` hay ${c.disponible} · piden ${c.pedido}`}
                  </span>
                ))}
                {conflictos.length > 3 && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      onClick={() => abrirPanel(true)}
                      className="font-semibold underline underline-offset-2 hover:no-underline"
                    >
                      +{conflictos.length - 3} más
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        </div>
        {/* ── Matriz de clientes ──────────────────────────────────────────── */}
        {cargando ? (
          // El esqueleto imita la tabla, no las tarjetas de antes: si al cargar
          // se ven seis bloques altos y luego aparecen quince filas finas, la
          // pantalla parece haber cambiado de sitio todo.
          <div className="flex-1 min-h-0 overflow-auto bg-surface divide-y divide-border/50">
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
                    : soloConFaltante
                      ? 'Ningún cliente con faltantes coincide con la búsqueda. Quita el filtro "Le faltó a N cliente(s)".'
                      : buscar
                        ? `Ningún cliente activo coincide con "${buscar}".`
                        : 'No hay clientes activos para cotizar.'
                }
              />
            </CardBody>
          </Card>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <p className="flex-shrink-0 px-4 sm:px-6 pb-1 text-xs text-muted">
              Mostrando {clientesVisibles.length} de {clientes.length} cliente(s) activos
              {resumen.numClientes > 0 ? ` · ${resumen.numClientes} con ítems listos` : ''}
              {' · '}la entrega usa el destino registrado del cliente y, si no tiene, sus propios datos
            </p>

            {/* La tabla es ancha y se desplaza dentro de su caja, no la página.
                Ojo con el max-h: un contenedor con overflow-x sólo se comporta
                como zona desplazable si tiene un alto que respetar, y sin él la
                cabecera `sticky top-0` no tendría contra qué pegarse. */}
            {/* SIN CAJA. Antes iba dentro de una tarjeta redondeada con borde y
                margen a los lados: la tabla quedaba encerrada en un rectángulo
                más pequeño que la pantalla y con el aire desperdiciado alrededor.
                Ahora la pantalla ES la caja y la tabla llega hasta el borde. */}
            <div className="flex-1 min-h-0 overflow-auto border-t border-border/60 bg-surface">
              <table className="w-full min-w-[920px] text-sm">
                <caption className="sr-only">
                  Pedidos por cliente: dentro de cada cliente, una fila por cada producto que pidió.
                </caption>
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
                    y teclear en una fila repintaría todas las demás.

                    `resaltado` baja como BOOLEANO ya resuelto y no como el id
                    del cliente por ese mismo motivo: con el id, volver del
                    reparto cambiaría una prop en las cientos de filas
                    memoizadas y se repintarían todas para subrayar una. */}
                {clientesVisibles.map((c) => (
                  <FilaCliente
                    key={c.id}
                    cliente={c}
                    fila={filas[c.id]}
                    avisos={avisos[c.id]}
                    problemas={problemas[String(c.id)]}
                    transporteGlobal={transporteGlobalNum}
                    transportes={transportes}
                    opcionesReferencia={opcionesReferencia}
                    opcionesSinStock={opcionesSinStock}
                    calidadesPorReferencia={calidadesPorReferencia}
                    calidadesCatalogo={calidadesCatalogo}
                    leerExistencias={leerExistencias}
                    // La clave del producto tocado en el panel, pero SÓLO a
                    // quien lo pidió; a los demás les llega null y no se
                    // repintan. Mismo motivo que `resaltado`, justo debajo.
                    productoResaltado={clientesDelProducto?.has(String(c.id)) ? productoSel : null}
                    faltante={faltantes.get(String(c.id))}
                    deshabilitado={enviando}
                    resaltado={clienteResaltado != null && String(clienteResaltado) === String(c.id)}
                    onCampo={onCampo}
                    onItemCampo={onItemCampo}
                    onAgregarItem={onAgregarItem}
                    onQuitarItem={onQuitarItem}
                    onCatalogo={onCatalogo}
                    onCargarFaltante={onCargarFaltante}
                    onRespetarPrecio={onRespetarPrecio}
                  />
                ))}
              </table>
            </div>
          </div>
        )}
        </div>{/* fin de la columna de avisos y tabla */}

        <PanelExistencias
          abierto={panelAbierto}
          grupos={existencias}
          seleccionado={productoSel}
          onSeleccionar={elegirProducto}
          onIrACliente={irACliente}
          onCerrar={cerrarPanel}
        />
        </div>{/* fin de la fila tabla + panel */}
      </div>

      {/* ── Pie: el resumen siempre a la vista ───────────────────────────
          Ya NO es pegajoso. Flotando sobre la página se montaba encima de las
          últimas filas justo cuando ella bajaba a mirarlas, y el `bottom-4` le
          dejaba además una rendija por la que se veía pasar el contenido por
          debajo. Ahora es una barra de verdad: se lleva su alto antes de que la
          tabla reparta el resto, así que no puede tapar nada. */}
      <div className={`flex-shrink-0 border-t border-border/60 bg-surface ${oculto ? 'hidden' : ''}`}>
        <div>
          <div className="px-4 sm:px-6 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" role="status">
                  <span className="flex items-center gap-1.5 text-muted">
                    <Users size={14} aria-hidden="true" />
                    <strong className="text-primary tabular-nums">{resumen.numClientes}</strong> cliente(s)
                  </span>
                  <span className="flex items-center gap-1.5 text-muted">
                    <Package size={14} aria-hidden="true" />
                    <strong className="text-primary tabular-nums">{resumen.unidades}</strong> paca(s) pedidas
                  </span>
                  <span className="font-display text-xl font-bold text-primary tabular-nums">
                    {formatCOP(resumen.total)}
                  </span>
                  {resumen.lineasIncompletas > 0 && (
                    <span className="flex items-center gap-1 text-xs text-warning">
                      <Info size={12} aria-hidden="true" />
                      {resumen.lineasIncompletas} línea(s) sin terminar no pasan al reparto
                    </span>
                  )}
                </div>
                {/* LA FRASE QUE EVITA QUE LOS DOS PIES SE LEAN COMO UN ERROR.
                    El de la Fase 1 suma lo PEDIDO y el de la Fase 2 suma lo
                    REPARTIDO: son dos números distintos a propósito, y sin esta
                    línea el primero que no cuadre parece un fallo de cuentas. */}
                <p className="text-[11px] text-muted mt-1">
                  Este total es lo PEDIDO. El de las cotizaciones sale en el paso 2, con lo que de verdad repartas.
                </p>
              </div>

              {/* «Repartir lo que hay» no crea nada: guarda lo capturado, relee
                  el inventario y cruza a la Fase 2. El punto de no retorno está
                  al final del reparto, y por eso este botón no lleva
                  confirmación de peso —sólo el aviso de las líneas a medias, y
                  sólo si las hay—. */}
              <div className="flex flex-col items-end gap-1">
                <Button
                  onClick={onRepartir}
                  disabled={enviando || cruzando || Boolean(impedimento)}
                  loading={cruzando}
                  icon={ArrowRight}
                >
                  {cruzando ? 'Revisando el inventario…' : 'Repartir lo que hay'}
                </Button>
                {impedimento && !cruzando ? (
                  <span className="text-[11px] text-warning max-w-xs text-right">{impedimento}</span>
                ) : (
                  // La frase que quita el miedo a pulsar. En un flujo de dos
                  // pasos, un botón que no promete vuelta atrás se queda sin
                  // pulsar y la matriz se sigue haciendo en Excel.
                  <span className="text-[11px] text-muted max-w-xs text-right">
                    Nada se pierde: puedes volver y seguir agregando.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

export default FasePedidos;
