import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Badge, Modal, EmptyState, useToast, RefLink, BuscadorLista } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { matrizApi, clientesApi, cotizacionesApi } from '../services/api';
import { claveStock, normTxt } from '../lib/matriz';
import { aplicarMovimiento } from '../lib/faltantes';
import { cargarModulo } from '../lib/cargaDiferida';
import { formatCOP, formatNumero, parseMonto } from '../lib/money';
import { aFecha, formatFecha, formatFechaCorta } from '../lib/fecha';
import {
  PackageOpen, Users, Coins, Clock, AlertTriangle,
  Check, X, Search, FileSpreadsheet, ArrowRight, RotateCcw, Ban,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// /faltantes — «Lo que quedó sin entregar en repartos anteriores, cliente por
// cliente.»
//
// Esta pantalla es el LIBRO, no la sesión de trabajo. La Matriz se vacía cuando
// termina la ronda; esto se consulta en otro momento y casi siempre porque el
// cliente llamó preguntando. Por eso es ruta propia y no una tercera pestaña de
// la Matriz: contestar el teléfono no puede obligar a abrir la pantalla de
// captura, donde un clic de más mueve mercancía.
//
// LA REGLA QUE MANDA SOBRE TODO LO DEMÁS: si la consulta falla, aquí NO se pinta
// un cero en ninguna parte. Un «0 clientes con faltante» se lee como «no le debo
// nada a nadie», que es exactamente la mentira que este módulo existe para
// impedir. Por eso el endpoint devuelve un OBJETO { generado_en, total_clientes,
// total_unidades, faltantes:[…] } y no un arreglo pelado: un [] no distingue
// «no le falta nada a nadie» de «me quedé sin datos». Si la respuesta no trae la
// forma pactada, esto es un ERROR con su tarjeta roja y sus cuatro KPIs en «—»,
// y nunca un vacío.
//
// Vocabulario, en la pantalla y en el código: FALTANTE. Nunca «pendiente» (ya
// significa pedido del portal, cotización y despacho por confirmar), nunca
// «saldo» ni «deuda» (eso es plata y vive en Cartera), nunca «por entregar».
// ─────────────────────────────────────────────────────────────────────────────

// La raya bajo la cabecera va como sombra interior y NO como border-b: la tabla
// colapsa bordes (lo hace el preflight de Tailwind) y un borde colapsado lo
// pinta la TABLA, no la celda, así que se queda clavado en su sitio cuando la
// cabecera se despega y el encabezado acaba flotando sin línea sobre las filas.
// A nivel de módulo para que su identidad no cambie en cada render.
const RAYA_CABECERA = { boxShadow: 'inset 0 -1px 0 var(--color-border)' };

// Lo que llega del servidor ya viene en formato máquina ("1700000.00"): se lee
// con Number. parseMonto es SÓLO para lo que teclea la usuaria, donde el punto
// separa miles y parseFloat("1.700.000") devolvería 1.7.
const numSrv = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const enteroSrv = (v) => Math.max(0, Math.round(numSrv(v)));

// Debounce local. Es la costumbre del repo (Catalogo, Clientes, Pacas y Ventas
// tienen cada uno su copia de cuatro líneas) y no hay carpeta de hooks: meter
// aquí un import a un archivo que no existe rompería el build de otro agente.
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Estados del libro. 'abierto' es el de por defecto porque la pregunta de todos
// los días es «¿qué le debo a quién?»; el histórico se consulta a propósito.
// Ojo con el valor 'todos': qs() del cliente de API descarta undefined, null y
// '', así que «todos» tiene que viajar como PALABRA o el servidor no se entera
// de que se le está pidiendo el libro entero.
const OPCIONES_ESTADO = [
  { value: 'abierto',    label: 'Abiertos' },
  { value: 'completado', label: 'Completados' },
  { value: 'anulado',    label: 'Anulados' },
  { value: 'todos',      label: 'Todos' },
];

const OPCIONES_ANTIGUEDAD = [
  { value: 'todas', label: 'Todas' },
  { value: '15',    label: 'Más de 15 días' },
  { value: '30',    label: 'Más de 30 días' },
];

const VARIANTE_ESTADO = { abierto: 'warning', completado: 'success', anulado: 'default' };
const ETIQUETA_ESTADO = { abierto: 'Abierto', completado: 'Completado', anulado: 'Anulado' };

/** Días que lleva abierto, para cuando el servidor no mande `dias_abierto`. */
const diasDesde = (creado) => {
  const d = aFecha(creado);
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
};

/**
 * Una fila del libro, ya con los números en número y las cuentas hechas.
 *
 * `pidio` es `cantidad_original`, y merece una explicación porque no es lo que
 * pidió en UN reparto: es todo lo que se le ha quedado faltando de ese producto
 * sumando rondas, porque el libro consolida UNA fila abierta por cliente +
 * referencia + calidad. Ella piensa «a MARIA le debo 3 chaquetas premium», no
 * «2 del reparto del 12 y 1 del reparto del 20». La cabecera dice «Pidió» —que
 * es su palabra— y el title de la celda cuenta el matiz.
 */
function filaDeFaltante(bruto) {
  const b = bruto || {};
  const referencia = String(b.referencia || '');
  const calidad = String(b.calidad || '');
  const pidio = enteroSrv(b.cantidad_original);
  const recibio = enteroSrv(b.cantidad_saldada);
  const anuladas = enteroSrv(b.cantidad_anulada);
  const falta = enteroSrv(b.cantidad_abierta);
  const precio = numSrv(b.precio_unitario_origen);
  // `dias_abierto` lo calcula el servidor contra hoyCO(): Railway corre en UTC y
  // después de las 19:00 en Colombia un CURRENT_DATE ya es mañana, así que la
  // cifra buena es la suya. El cálculo local es sólo la red por si un endpoint
  // viejo no la manda; envejecer un día de más es feo, mostrar «—» donde debería
  // haber una antigüedad es peor, porque la antigüedad es lo que decide a quién
  // se le reparte primero.
  const dias = Number.isFinite(Number(b.dias_abierto)) ? Math.max(0, Math.round(Number(b.dias_abierto))) : diasDesde(b.created_at);
  return {
    bruto: b,
    id: b.id,
    cliente_id: b.cliente_id,
    cliente_nombre: String(b.cliente_nombre || 'Sin nombre'),
    referencia,
    calidad,
    clave: claveStock(referencia, calidad),
    pidio,
    recibio,
    anuladas,
    falta,
    precio,
    // El valor va SIEMPRE al precio de cuando se pidió (`precio_unitario_origen`,
    // que no se actualiza nunca). El KPI lleva el subtítulo puesto por eso mismo:
    // sin él alguien va a creer que es el precio de hoy y a discutirlo por
    // teléfono con el cliente delante.
    valor: falta * precio,
    promocion: Boolean(b.tiene_promocion_origen),
    repartos: Math.max(1, enteroSrv(b.veces_aplazado) || 1),
    desde: b.created_at || null,
    dias,
    estado: String(b.estado || 'abierto'),
    reparto_numero: b.reparto_origen_numero || null,
  };
}

/**
 * Convierte la respuesta cruda en el libro, o LANZA.
 *
 * Lanzar es la decisión de producto de esta función: cualquier respuesta que no
 * tenga la forma pactada se trata como fallo de consulta, no como libro vacío.
 * Un arreglo pelado, un null, un `{ error: … }` con 200 — todos acaban en la
 * tarjeta roja. Prefiero que la dueña vea «no pude consultar» un día que el
 * endpoint cambie de forma, a que vea «no le debes nada a nadie» ese mismo día.
 */
function leerLibro(res) {
  if (!res || typeof res !== 'object' || Array.isArray(res) || !Array.isArray(res.faltantes)) {
    throw new Error('El servidor no devolvió el libro de faltantes.');
  }
  const totalClientes = Number(res.total_clientes);
  const totalUnidades = Number(res.total_unidades);
  return {
    // `generado_en` es la prueba positiva de que la respuesta es real. Si no
    // viene no se rechaza la respuesta (las filas ya demuestran bastante), pero
    // el sello de hora de la cabecera cae a «ahora» y se dice así.
    generado_en: res.generado_en || null,
    total_clientes: Number.isFinite(totalClientes) ? totalClientes : null,
    total_unidades: Number.isFinite(totalUnidades) ? totalUnidades : null,
    filas: res.faltantes.map(filaDeFaltante),
  };
}

/**
 * Las cuatro cifras de arriba, que hablan SIEMPRE del libro abierto.
 *
 * `usarTotalesDelServidor` sólo es cierto cuando lo que se pidió fue justamente
 * el libro abierto: en ese caso `total_clientes` y `total_unidades` son la
 * agregación del servidor y mandan sobre cualquier recuento local. Cuando la
 * usuaria está mirando otro estado, las cifras se recalculan aquí sobre las
 * filas abiertas que haya en la respuesta.
 */
function resumirAbiertos(libro, usarTotalesDelServidor) {
  if (!libro) return null;
  const abiertas = libro.filas.filter((f) => f.estado === 'abierto');
  const unidades = abiertas.reduce((s, f) => s + f.falta, 0);
  const valor = abiertas.reduce((s, f) => s + f.valor, 0);
  const clientes = new Set(abiertas.map((f) => String(f.cliente_id))).size;
  // El más viejo: una paca de hace tres meses hace más daño comercial que ocho
  // de ayer, y el volumen ya está a la vista en su propia columna mientras que
  // la antigüedad se pierde si nadie la saca a la superficie.
  let viejo = null;
  for (const f of abiertas) {
    if (!viejo || f.dias > viejo.dias) viejo = f;
  }
  return {
    generado_en: libro.generado_en,
    clientes: usarTotalesDelServidor && libro.total_clientes != null ? libro.total_clientes : clientes,
    unidades: usarTotalesDelServidor && libro.total_unidades != null ? libro.total_unidades : unidades,
    valor,
    viejo,
  };
}

/**
 * Tarjeta de indicador. `valor` en null se pinta «—», nunca 0.
 *
 * No es un detalle de estilo: es la regla de oro de la pantalla metida en el
 * único sitio por el que pasan las cuatro cifras, para que nadie pueda pintar
 * un cero por descuido desde el render de arriba.
 */
function KpiFaltante({ label, valor, sub, icon: Icon, color }) {
  const hay = valor !== null && valor !== undefined;
  return (
    <Card padding={false}>
      <CardBody className="p-4">
        <div className="flex items-center gap-3">
          {/* text-on-primary y no text-white: el círculo usa un token que se
              INVIERTE en oscuro, y un icono blanco sobre el pastel claro del
              modo oscuro queda prácticamente invisible. */}
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
            <Icon className="w-5 h-5 text-on-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide truncate">{label}</p>
            <p className={`font-display text-xl tabular-nums truncate ${hay ? 'text-primary' : 'text-muted'}`}>
              {hay ? valor : '—'}
            </p>
            {sub && <p className="text-[11px] text-muted leading-tight">{sub}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** «12/08 · 29 d» y, debajo, los repartos de espera. */
function CeldaDesde({ fila, mostrarEstado }) {
  return (
    <div className="leading-tight">
      <p className="text-[11px] text-muted tabular-nums whitespace-nowrap">
        {fila.desde ? formatFechaCorta(fila.desde).slice(0, 5) : '—'}
        <span className="text-muted/70"> · {formatNumero(fila.dias)} d</span>
      </p>
      {/* La antigüedad escondida en un tooltip no existe en tableta, y es justo
          el dato que decide a quién se le reparte primero. Por eso los repartos
          de espera van escritos, no en un title. El title añade la frase larga,
          que sí puede vivir ahí. */}
      <p
        className={`text-[10px] tabular-nums whitespace-nowrap ${fila.repartos >= 3 ? 'font-semibold text-warning' : 'text-muted/70'}`}
        title={`Este faltante nació en el reparto del ${formatFecha(fila.desde)}${fila.reparto_numero ? ` (${fila.reparto_numero})` : ''} y desde entonces se han hecho ${fila.repartos} reparto(s) sin que le tocara.`}
      >
        {fila.repartos >= 3 && <AlertTriangle size={11} className="inline align-middle mr-0.5" aria-hidden="true" />}
        {formatNumero(fila.repartos)} reparto{fila.repartos === 1 ? '' : 's'}
      </p>
      {/* La columna «Estado» no existe: en la vista normal todas las filas
          tienen el mismo estado y una columna entera repitiendo la misma palabra
          es ruido. El Badge sale aquí, y sólo cuando el filtro no es el de por
          defecto, que es cuando de verdad hay estados mezclados. */}
      {mostrarEstado && (
        <Badge variant={VARIANTE_ESTADO[fila.estado] || 'default'} size="sm" className="mt-0.5">
          {ETIQUETA_ESTADO[fila.estado] || fila.estado}
        </Badge>
      )}
    </div>
  );
}

/** Los dos botones-icono del final de la fila. */
function AccionesFila({ fila, esAdmin, onCompletar, onAnular }) {
  // Completar o anular algo que ya está cerrado no significa nada: el libro es
  // de una sola dirección. En vez de un botón que el servidor va a rechazar, un
  // guion con su explicación.
  if (fila.estado !== 'abierto') {
    return (
      <span className="text-muted/50 text-xs" title={`Este faltante ya está ${ETIQUETA_ESTADO[fila.estado]?.toLowerCase() || fila.estado}: no hay nada que completar ni que anular.`}>
        —
      </span>
    );
  }
  const quien = `${fila.falta} de ${fila.referencia}${fila.calidad ? ` / ${fila.calidad}` : ''} de ${fila.cliente_nombre}`;
  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        onClick={() => onCompletar(fila)}
        className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-muted hover:text-success hover:bg-success/10 transition-colors"
        title="Marcar como entregado"
        aria-label={`Marcar como entregado: ${quien}`}
      >
        <Check size={15} aria-hidden="true" />
      </button>
      {/* Al vendedor se le pinta DESHABILITADO y no escondido: escondido lo deja
          preguntándose por qué no puede, y la respuesta («sólo un administrador
          puede anular») es justo lo que hay que decirle. El servidor lo valida
          igual —requiereRol('admin')—; esto es cortesía, no seguridad. */}
      <button
        type="button"
        onClick={() => onAnular(fila)}
        disabled={!esAdmin}
        className={`w-9 h-9 inline-flex items-center justify-center rounded-lg transition-colors ${
          esAdmin ? 'text-muted hover:text-error hover:bg-error/10' : 'text-muted/40 cursor-not-allowed'
        }`}
        title={esAdmin ? 'Anular el faltante' : 'Sólo un administrador puede anular'}
        aria-label={esAdmin ? `Anular el faltante: ${quien}` : 'Sólo un administrador puede anular'}
      >
        {esAdmin ? <X size={15} aria-hidden="true" /> : <Ban size={15} aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * Modal «Marcar como entregado».
 *
 * Es un modal y no un clic directo por dos razones: es una decisión de CANTIDAD
 * (permite parcial) y un clic que da de baja mercancía es exactamente lo que se
 * pulsa sin querer en una tableta apoyada en una estantería.
 */
function ModalCompletar({ fila, guardando, onCerrar, onConfirmar }) {
  const uid = useId();
  const [cantidad, setCantidad] = useState(String(fila.falta));
  const [nota, setNota] = useState('');

  const escrita = Math.max(0, Math.round(parseMonto(cantidad)));
  const n = Math.min(escrita, fila.falta);
  const sePaso = escrita > fila.falta;
  // La proyección sale de aplicarMovimiento, la MISMA función que el servidor
  // usa para escribir la fila (el gemelo CommonJS vive en BE/src/utils). No se
  // escribe una segunda aritmética: si la pantalla dijera «quedan 2» y el libro
  // guardara otra cosa, la primera vez que ella lo cotejara dejaría de creerle
  // a las dos cifras.
  const proyeccion = aplicarMovimiento(fila.bruto, { salda: n });

  return (
    <Modal isOpen onClose={onCerrar} title="Marcar como entregado" size="md">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            {fila.cliente_nombre} · {fila.referencia}{fila.calidad ? ` / ${fila.calidad}` : ''}
          </p>
          <p className="text-xs text-muted mt-0.5">
            Le quedaron faltando <strong className="text-warning">{formatNumero(fila.falta)}</strong> desde el{' '}
            {formatFecha(fila.desde)} ({formatNumero(fila.dias)} día{fila.dias === 1 ? '' : 's'}).
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-cant`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
              ¿Cuántas le entregaste?
            </label>
            <div className="flex items-center gap-2">
              {/* type="text" con inputMode numérico y no type="number": en number
                  la rueda del ratón cambia el valor al pasar por encima, y este
                  campo da de baja mercancía. */}
              <input
                id={`${uid}-cant`}
                type="text"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onFocus={(e) => e.target.select()}
                className={`w-24 h-9 px-2 rounded-lg border bg-surface text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30 ${
                  sePaso ? 'border-error' : 'border-border'
                }`}
                aria-describedby={`${uid}-ayuda`}
              />
              <span className="text-xs text-muted tabular-nums">de {formatNumero(fila.falta)}</span>
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-nota`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
              Nota (opcional)
            </label>
            <input
              id={`${uid}-nota`}
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Se las llevó Andrés en la mula del jueves"
              className="w-full h-9 px-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
        </div>

        <p id={`${uid}-ayuda`} className="text-xs" role="status">
          {sePaso ? (
            <span className="text-error font-semibold">
              Sólo le faltaban {formatNumero(fila.falta)}: se van a marcar {formatNumero(n)}.
            </span>
          ) : proyeccion.cantidad_abierta > 0 ? (
            <span className="text-warning font-semibold">
              Quedan {formatNumero(proyeccion.cantidad_abierta)} faltando.
            </span>
          ) : (
            <span className="text-success font-semibold">
              Con esto no le queda faltando nada de este producto.
            </span>
          )}
        </p>

        {/* Esta frase no es opcional. Sin ella la dueña creería que la app acaba
            de despachar algo, y este botón no mueve una sola paca del inventario:
            sólo cierra el renglón del libro. */}
        <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Esto <strong>NO</strong> crea cotización ni despacho: sólo cierra lo que quedó faltando.
            Úsalo si ya se la entregaste por fuera del sistema o si el dato quedó mal.
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCerrar}>Cancelar</Button>
          <Button
            variant="success"
            size="sm"
            icon={Check}
            loading={guardando}
            disabled={n <= 0}
            onClick={() => onConfirmar(n, nota.trim())}
          >
            Marcar {formatNumero(n)} como entregada{n === 1 ? '' : 's'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Modal «Anular el faltante».
 *
 * El diseño pedía un confirm variant 'danger' con un campo de motivo dentro,
 * pero el ConfirmDialog de este repo sólo sabe de título, mensaje y botones: no
 * admite campos. Y el motivo NO es negociable —anular borra una promesa hecha a
 * un cliente y toda la gracia del módulo es que la memoria no se pueda limpiar
 * sola—, así que se hace en un Modal vestido de peligro en vez de tocar un
 * componente común que están usando veinte pantallas.
 */
function ModalAnular({ fila, guardando, onCerrar, onConfirmar }) {
  const uid = useId();
  const [cantidad, setCantidad] = useState(String(fila.falta));
  const [motivo, setMotivo] = useState('');

  const escrita = Math.max(0, Math.round(parseMonto(cantidad)));
  const n = Math.min(escrita, fila.falta);
  const motivoLimpio = motivo.trim();
  const motivoCorto = motivoLimpio.length > 0 && motivoLimpio.length < 5;
  const proyeccion = aplicarMovimiento(fila.bruto, { anula: n });

  return (
    <Modal isOpen onClose={onCerrar} title="Anular el faltante" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-xl border border-error/40 bg-error/10">
          <AlertTriangle size={18} className="text-error flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-error leading-relaxed">
            Se van a dar de baja <strong>{formatNumero(n)} paca(s)</strong> de{' '}
            <strong>{fila.referencia}{fila.calidad ? ` / ${fila.calidad}` : ''}</strong> de{' '}
            <strong>{fila.cliente_nombre}</strong>. Deja de aparecer en la Matriz y en esta pantalla.
            El registro se conserva.
          </p>
        </div>

        <div className="grid sm:grid-cols-[auto,1fr] gap-3 items-start">
          <div>
            <label htmlFor={`${uid}-cant`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
              ¿Cuántas anulas?
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-cant`}
                type="text"
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-24 h-9 px-2 rounded-lg border border-border bg-surface text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
              <span className="text-xs text-muted tabular-nums whitespace-nowrap">de {formatNumero(fila.falta)}</span>
            </div>
          </div>
          <div>
            <label htmlFor={`${uid}-motivo`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
              Motivo (obligatorio)
            </label>
            <input
              id={`${uid}-motivo`}
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="El cliente ya no lo quiere"
              maxLength={200}
              aria-invalid={motivoCorto || undefined}
              aria-describedby={`${uid}-motivo-ayuda`}
              className={`w-full h-9 px-2 rounded-lg border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 ${
                motivoCorto ? 'border-error' : 'border-border'
              }`}
            />
            <p id={`${uid}-motivo-ayuda`} className="text-[11px] text-muted mt-1">
              {motivoCorto
                ? <span className="text-error font-semibold">Escribe algo más: al menos 5 letras.</span>
                : 'Queda guardado en el registro y en la auditoría.'}
            </p>
          </div>
        </div>

        {/* La anulación PARCIAL es la que consume el «¿damos por cerrado el
            resto?» de la Fase 2. Se dice en voz alta a dónde va cada número
            porque anular y completar NO son lo mismo: anulado es «se le perdonó»,
            saldado es «se le entregó», y mezclarlos corrompe el libro. */}
        <p className="text-xs" role="status">
          {proyeccion.cantidad_abierta > 0
            ? <span className="text-warning font-semibold">Le seguirán faltando {formatNumero(proyeccion.cantidad_abierta)}.</span>
            : <span className="text-muted">El renglón queda cerrado como <strong>anulado</strong>: no se le entregó, se le dio de baja.</span>}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCerrar}>Mejor no</Button>
          <Button
            variant="danger"
            size="sm"
            icon={X}
            loading={guardando}
            disabled={n <= 0 || motivoLimpio.length < 5}
            onClick={() => onConfirmar(n, motivoLimpio)}
          >
            Sí, anular
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Vista por reparto — `/faltantes?reparto=MAT-10-09-2026-0004`.
 *
 * Es literalmente la frase del encargo: «saber que en esa entrega se le dieron
 * tantos y quedaron faltando tantos». Se llega desde el banner verde de éxito de
 * la Matriz, así que tiene que poder abrirse en frío, sin nada en memoria: por
 * eso resuelve el número contra la lista antes de pedir el detalle, en lugar de
 * esperar a que alguien le pase un id.
 */
function FotoDeReparto({ numero, onSalir }) {
  const [estado, setEstado] = useState('cargando');
  const [foto, setFoto] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado('cargando');
      try {
        const lista = await matrizApi.getRepartos({ numero });
        const repartos = Array.isArray(lista?.repartos) ? lista.repartos : [];
        const cabecera = repartos.find((r) => String(r.numero) === String(numero)) || repartos[0];
        if (!cabecera) {
          if (vivo) setEstado('no-esta');
          return;
        }
        const detalle = await matrizApi.getReparto(cabecera.id);
        if (!vivo) return;
        setFoto({
          reparto: detalle?.reparto || cabecera,
          clientes: Array.isArray(detalle?.clientes) ? detalle.clientes : [],
        });
        setEstado('listo');
      } catch {
        if (vivo) setEstado('error');
      }
    })();
    return () => { vivo = false; };
  }, [numero]);

  const salir = (
    <Button variant="ghost" size="sm" onClick={onSalir} icon={ArrowRight}>
      Ver todos los faltantes
    </Button>
  );

  if (estado === 'cargando') {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl animate-pulse bg-primary/[0.04]" />
        ))}
      </div>
    );
  }

  if (estado === 'error' || estado === 'no-esta') {
    return (
      <Card className="border-error/40 bg-error/10">
        <CardBody className="space-y-2">
          <p className="text-sm font-semibold text-error">
            {estado === 'no-esta' ? `No encontré el reparto ${numero}.` : 'No pude leer ese reparto.'}
          </p>
          <p className="text-xs text-error/90">
            {estado === 'no-esta'
              ? 'Puede que el número esté mal escrito o que ese reparto se haya descartado.'
              : 'Esto NO significa que el reparto no exista: es que la consulta falló.'}
          </p>
          <div className="pt-1">{salir}</div>
        </CardBody>
      </Card>
    );
  }

  const { reparto, clientes } = foto;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg text-primary">Reparto {reparto.numero || numero}</p>
          <p className="text-[11px] text-muted">
            {formatFecha(reparto.fecha)} · {formatNumero(enteroSrv(reparto.total_clientes))} cliente(s) ·{' '}
            {formatNumero(enteroSrv(reparto.total_pedido))} pedidas ·{' '}
            {formatNumero(enteroSrv(reparto.total_repartido))} repartidas ·{' '}
            <span className="text-warning font-semibold">{formatNumero(enteroSrv(reparto.total_faltante))} faltando</span>
          </p>
        </div>
        {salir}
      </div>

      {clientes.length === 0 ? (
        <Card><CardBody>
          <EmptyState
            icon={PackageOpen}
            title="Este reparto no tiene líneas"
            description="Se abrió y se cerró sin que quedara nada capturado."
          />
        </CardBody></Card>
      ) : clientes.map((c) => {
        const lineas = Array.isArray(c.lineas) ? c.lineas : [];
        return (
          <Card key={c.cliente_id} padding={false}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border/50 bg-primary/[0.03]">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{c.cliente_nombre}</p>
                <p className="text-[11px] text-muted truncate">{c.ciudad || 'Sin ciudad'}</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] tabular-nums">
                <span className="text-muted">{formatNumero(enteroSrv(c.total_pedido))} pedidas</span>
                <span className="text-primary font-semibold">{formatNumero(enteroSrv(c.total_repartido))} repartidas</span>
                {enteroSrv(c.total_faltante) > 0 && (
                  <span className="text-warning font-semibold">{formatNumero(enteroSrv(c.total_faltante))} faltando</span>
                )}
                {c.cotizacion_numero && (
                  <RefLink to="/cotizaciones" id={c.cotizacion_id} title="Ver la cotización de este reparto"
                    className="text-xs bg-secondary/10 px-2 py-0.5 rounded-full">
                    {c.cotizacion_numero}
                  </RefLink>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Lo que pidió, lo que recibió y lo que le quedó faltando a {c.cliente_nombre} en este reparto.</caption>
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th scope="col" className="text-left px-3 py-1.5">Referencia</th>
                    <th scope="col" className="text-left px-2 py-1.5">Calidad</th>
                    <th scope="col" className="text-right px-2 py-1.5 w-[74px]">Pidió</th>
                    <th scope="col" className="text-right px-2 py-1.5 w-[84px]">Recibió</th>
                    <th scope="col" className="text-right px-3 py-1.5 w-[92px]">Faltó</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => {
                    const falto = enteroSrv(l.cantidad_faltante);
                    return (
                      <tr key={l.id || `${l.referencia}|${l.calidad}|${i}`} className="border-t border-border/70">
                        <td className="px-3 py-1.5 text-primary">{l.referencia}</td>
                        <td className="px-2 py-1.5 text-muted text-xs">{l.calidad || '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumero(enteroSrv(l.cantidad_pedida))}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumero(enteroSrv(l.cantidad_repartida))}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {falto > 0
                            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-semibold">{formatNumero(falto)}</span>
                            : <span className="text-muted/50">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export default function Faltantes() {
  const { addToast } = useToast();
  const { tieneRol } = useAuth();
  const navigate = useNavigate();
  const esAdmin = tieneRol('admin');
  const uid = useId();

  const [searchParams, setSearchParams] = useSearchParams();
  const repartoParam = searchParams.get('reparto');

  // ── Datos ────────────────────────────────────────────────────────────────
  const [libro, setLibro] = useState(null);       // lo que se está listando
  const [resumen, setResumen] = useState(null);   // SIEMPRE el libro abierto (los KPIs)
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [clientesPorId, setClientesPorId] = useState(() => new Map());
  const [stockPorClave, setStockPorClave] = useState(() => new Map());
  const [stockLeido, setStockLeido] = useState(false);

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [buscar, setBuscar] = useState('');
  const buscarLento = useDebounce(buscar, 300);
  const [filtroCliente, setFiltroCliente] = useState('todos');
  const [filtroReferencia, setFiltroReferencia] = useState('todas');
  const [filtroEstado, setFiltroEstado] = useState('abierto');
  const [filtroAntiguedad, setFiltroAntiguedad] = useState('todas');
  const [soloAlcanza, setSoloAlcanza] = useState(false);
  const [vista, setVista] = useState('cliente');

  // ── Acciones ─────────────────────────────────────────────────────────────
  const [completando, setCompletando] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoExcel, setGenerandoExcel] = useState(false);

  /**
   * Una sola llamada agregada para TODOS los clientes, jamás una por cliente:
   * esto puede listar cientos de renglones y una petición por fila colgaría la
   * pantalla y el servidor a la vez.
   *
   * La segunda llamada de abajo sólo ocurre cuando la usuaria se va a mirar
   * completados o anulados, y existe porque los cuatro KPIs hablan SIEMPRE del
   * libro abierto: si al filtrar por «Anulados» los indicadores cayeran a cero,
   * la pantalla estaría diciendo «no le debes nada a nadie» justo mientras la
   * dueña revisa historia. Con «Abiertos» (el caso de todos los días) y con
   * «Todos» no hace falta: la respuesta ya trae lo que hace falta.
   */
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const listado = leerLibro(await matrizApi.getFaltantes({ estado: filtroEstado }));
      setLibro(listado);
      if (filtroEstado === 'abierto' || filtroEstado === 'todos') {
        setResumen(resumirAbiertos(listado, filtroEstado === 'abierto'));
      } else {
        try {
          setResumen(resumirAbiertos(leerLibro(await matrizApi.getFaltantes({ estado: 'abierto' })), true));
        } catch {
          // Que falle el resumen no invalida el listado que sí llegó: los KPIs
          // se van a «—», que es la verdad, y la tabla se pinta igual.
          setResumen(null);
        }
      }
    } catch (err) {
      // Ni libro ni resumen: cero filas y cuatro guiones. Lo que NO puede pasar
      // es que quede el libro anterior en pantalla como si fuera de ahora.
      setLibro(null);
      setResumen(null);
      setError(err?.message || 'No pude consultar los faltantes.');
    } finally {
      setCargando(false);
    }
  }, [filtroEstado]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los clientes y el inventario son ADORNO, no dato principal: si fallan, la
  // pantalla sigue entera y sólo pierde la ciudad, el celular del Excel y la
  // casilla de «lo que hoy alcanza». Por eso van en un allSettled aparte y
  // ninguno de los dos puede tumbar la carga del libro.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const [rCli, rStock] = await Promise.allSettled([
        clientesApi.getAll(),
        cotizacionesApi.disponibilidadMasiva(),
      ]);
      if (!vivo) return;

      if (rCli.status === 'fulfilled' && Array.isArray(rCli.value)) {
        setClientesPorId(new Map(rCli.value.map((c) => [String(c.id), c])));
      }

      const bruto = rStock.status === 'fulfilled' ? rStock.value : null;
      const lista = Array.isArray(bruto) ? bruto
        : Array.isArray(bruto?.items) ? bruto.items
        : Array.isArray(bruto?.disponibilidad) ? bruto.disponibilidad
        : Array.isArray(bruto?.data) ? bruto.data
        : null;
      if (lista) {
        const m = new Map();
        for (const r of lista) {
          const clave = claveStock(r.referencia, r.calidad);
          const disp = Math.max(0, Math.round(numSrv(r.disponibles ?? r.cantidad ?? r.total ?? 0)));
          m.set(clave, (m.get(clave) || 0) + disp);
        }
        setStockPorClave(m);
        setStockLeido(true);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Enlace profundo desde Clientes.jsx: /faltantes?cliente_id=N. Se lee UNA vez
  // al entrar y se deja como filtro normal, para que quitarlo sea tan fácil como
  // cambiar el desplegable en vez de tener que editar la barra de direcciones.
  useEffect(() => {
    const cid = searchParams.get('cliente_id');
    if (cid) setFiltroCliente(String(cid));
    // Sin dependencias a propósito: es la lectura de ENTRADA. Si dependiera de
    // searchParams, cambiar el desplegable no bastaría —el efecto volvería a
    // imponer el cliente de la URL en cuanto React repintara.
  }, []);

  // ── Filas y filtros ──────────────────────────────────────────────────────
  const filas = useMemo(() => {
    if (!libro) return [];
    return libro.filas.map((f) => {
      const cli = clientesPorId.get(String(f.cliente_id));
      const ciudad = cli?.ciudad || '';
      return {
        ...f,
        ciudad,
        celular: cli?.telefono || '',
        inactivo: cli ? String(cli.estado || '').toLowerCase() === 'inactivo' : false,
        // El buscador cruza cliente, referencia, calidad y ciudad en una sola
        // cadena ya normalizada: ella busca «mixta», «maria» o «pereira» sin
        // pensar en qué columna vive cada cosa.
        busqueda: normTxt(`${f.cliente_nombre} ${f.referencia} ${f.calidad} ${ciudad}`),
      };
    });
  }, [libro, clientesPorId]);

  const opcionesCliente = useMemo(() => {
    const m = new Map();
    for (const f of filas) m.set(String(f.cliente_id), f.cliente_nombre);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [filas]);

  const opcionesReferencia = useMemo(() => {
    const m = new Map();
    for (const f of filas) if (f.referencia) m.set(normTxt(f.referencia), f.referencia);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [filas]);

  const busca = normTxt(buscarLento);
  const visibles = useMemo(() => filas.filter((f) => {
    // El filtro de estado se aplica TAMBIÉN aquí aunque ya viaje al servidor: si
    // un día el endpoint ignorara el parámetro, «Anulados» mostraría el libro
    // entero y nadie se enteraría. Filtrar dos veces no puede inventar filas;
    // no filtrar puede enseñar las que no son.
    if (filtroEstado !== 'todos' && f.estado !== filtroEstado) return false;
    if (filtroCliente !== 'todos' && String(f.cliente_id) !== filtroCliente) return false;
    if (filtroReferencia !== 'todas' && normTxt(f.referencia) !== filtroReferencia) return false;
    if (filtroAntiguedad !== 'todas' && f.dias <= Number(filtroAntiguedad)) return false;
    if (soloAlcanza) {
      if (!stockLeido || f.falta <= 0) return false;
      if ((stockPorClave.get(f.clave) || 0) < f.falta) return false;
    }
    if (busca && !f.busqueda.includes(busca)) return false;
    return true;
  }), [filas, filtroEstado, filtroCliente, filtroReferencia, filtroAntiguedad, soloAlcanza, stockLeido, stockPorClave, busca]);

  const hayFiltro = Boolean(
    busca || filtroCliente !== 'todos' || filtroReferencia !== 'todas' ||
    filtroAntiguedad !== 'todas' || soloAlcanza
  );

  const limpiarFiltros = () => {
    setBuscar('');
    setFiltroCliente('todos');
    setFiltroReferencia('todas');
    setFiltroAntiguedad('todas');
    setSoloAlcanza(false);
  };

  // Bloques por cliente. ORDEN: el bloque con la línea MÁS VIEJA primero, y el
  // empate se rompe por unidades descendente. Una paca de hace tres meses hace
  // más daño comercial que ocho de ayer, y el volumen ya está a la vista en su
  // columna mientras que la antigüedad se pierde si no se ordena por ella.
  const bloquesCliente = useMemo(() => {
    const m = new Map();
    for (const f of visibles) {
      const k = String(f.cliente_id);
      if (!m.has(k)) {
        m.set(k, {
          cliente_id: f.cliente_id, nombre: f.cliente_nombre,
          ciudad: f.ciudad, celular: f.celular, inactivo: f.inactivo, filas: [],
        });
      }
      m.get(k).filas.push(f);
    }
    const bloques = [...m.values()];
    for (const b of bloques) {
      b.unidades = b.filas.reduce((s, f) => s + f.falta, 0);
      b.valor = b.filas.reduce((s, f) => s + f.valor, 0);
      b.masViejo = b.filas.reduce((s, f) => Math.max(s, f.dias), 0);
      b.filas.sort((x, y) => y.dias - x.dias || x.referencia.localeCompare(y.referencia, 'es'));
    }
    bloques.sort((a, b) => b.masViejo - a.masViejo || b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, 'es'));
    return bloques;
  }, [visibles]);

  // Bloques por producto. Contesta la otra pregunta operativa —«llegaron 40
  // jeans, ¿a quién se los debo?»— y es la única vista que puede cruzar contra
  // el inventario de hoy.
  const bloquesProducto = useMemo(() => {
    const m = new Map();
    for (const f of visibles) {
      if (!m.has(f.clave)) {
        m.set(f.clave, { clave: f.clave, referencia: f.referencia, calidad: f.calidad, filas: [] });
      }
      m.get(f.clave).filas.push(f);
    }
    const bloques = [...m.values()];
    for (const b of bloques) {
      b.unidades = b.filas.reduce((s, f) => s + f.falta, 0);
      b.valor = b.filas.reduce((s, f) => s + f.valor, 0);
      b.disponibles = stockLeido ? (stockPorClave.get(b.clave) || 0) : null;
      b.filas.sort((x, y) => y.dias - x.dias || x.cliente_nombre.localeCompare(y.cliente_nombre, 'es'));
    }
    bloques.sort((a, b) => b.unidades - a.unidades || a.referencia.localeCompare(b.referencia, 'es'));
    return bloques;
  }, [visibles, stockLeido, stockPorClave]);

  // La franja de escalada se calcula sobre lo que se está VIENDO. Anunciar «hay
  // 4 esperando 3 repartos» encima de una tabla donde el filtro no deja ni uno
  // es la clase de aviso que se aprende a ignorar en dos días.
  const aplazados = useMemo(
    () => visibles.filter((f) => f.estado === 'abierto' && f.repartos >= 3).length,
    [visibles],
  );

  const totalVisibleUnidades = visibles.reduce((s, f) => s + f.falta, 0);
  const totalVisibleValor = visibles.reduce((s, f) => s + f.valor, 0);
  const mostrarEstadoEnFilas = filtroEstado !== 'abierto';

  const selloDeHora = useMemo(() => {
    const d = aFecha(libro?.generado_en);
    if (!d) return null;
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }, [libro]);

  // ── Acciones sobre el libro ──────────────────────────────────────────────
  const confirmarCompletar = async (cantidad, nota) => {
    const fila = completando;
    if (!fila) return;
    try {
      setGuardando(true);
      const res = await matrizApi.completarFaltante(fila.id, { cantidad, nota: nota || undefined });
      const quedan = res?.faltante ? enteroSrv(res.faltante.cantidad_abierta) : Math.max(0, fila.falta - cantidad);
      addToast(
        `${formatNumero(cantidad)} entregada(s) a ${fila.cliente_nombre}` +
        (quedan > 0 ? ` · le quedan faltando ${formatNumero(quedan)}` : ' · no le queda faltando nada de este producto'),
        'success',
      );
      setCompletando(null);
      await cargar();
    } catch (err) {
      addToast(err?.message || 'No pude marcar la entrega', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarAnular = async (cantidad, motivo) => {
    const fila = anulando;
    if (!fila) return;
    try {
      setGuardando(true);
      const res = await matrizApi.anularFaltante(fila.id, { cantidad, motivo });
      const quedan = res?.faltante ? enteroSrv(res.faltante.cantidad_abierta) : Math.max(0, fila.falta - cantidad);
      addToast(
        `${formatNumero(cantidad)} anulada(s) de ${fila.referencia} de ${fila.cliente_nombre}` +
        (quedan > 0 ? ` · le siguen faltando ${formatNumero(quedan)}` : ''),
        'success',
      );
      setAnulando(null);
      await cargar();
    } catch (err) {
      addToast(err?.message || 'No pude anular el faltante', 'error');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Excel — hoja FALTANTES(BODEGA).
   *
   * Existe porque ella llama a los clientes con un papel al lado. Se descarga lo
   * que está EN PANTALLA con el filtro puesto, no el libro entero: si acaba de
   * filtrar por MARIA es porque va a llamar a MARIA.
   *
   * El import es dinámico a propósito, por dos razones que se refuerzan:
   * lib/entregables.js arrastra ExcelJS entero (son cientos de kB que esta
   * pantalla sólo necesita si alguien pulsa el botón), y así la hoja se resuelve
   * en el momento del clic, con su comprobación, en vez de reventar el módulo al
   * cargar la página si la hoja todavía no está publicada. `hojaFaltantes(wb,
   * faltantes)` es la firma pactada con quien la escribe.
   */
  const descargarExcel = async () => {
    if (!visibles.length) {
      addToast('No hay faltantes que descargar con este filtro', 'warning');
      return;
    }
    try {
      setGenerandoExcel(true);
      // Por `cargarModulo` y no por un `import()` pelado: este trozo de código
      // también se publica con un hash en el nombre, así que tras un despliegue
      // la pestaña que lleva abierta desde antes lo pide y ya no está. Ver
      // cargaDiferida.js.
      const mod = await cargarModulo(() => import('../lib/entregables'));
      if (typeof mod.hojaFaltantes !== 'function') {
        addToast('La hoja FALTANTES todavía no está disponible en esta versión.', 'error');
        return;
      }
      const wb = mod.nuevoLibro();
      // Se le entrega la fila TAL COMO LA MANDÓ EL SERVIDOR, que es lo que la
      // hoja espera (`respuesta.faltantes`), con dos añadidos: `ciudad` —la hoja
      // la busca como `cliente_ciudad ?? ciudad` y es la columna con la que se
      // decide a quién se le despacha junto con quién— y `dias_abierto` ya
      // resuelto, para que la columna DIAS no salga en blanco si el endpoint no
      // la mandó y aquí se calculó a mano. El resto de columnas —PIDIO, RECIBIO,
      // FALTA, PRECIO, VALOR— las saca la hoja de los campos crudos: no se le
      // pasan calculadas, porque dos aritméticas para el mismo número acaban
      // discrepando y esta hoja se lee al lado del teléfono.
      mod.hojaFaltantes(wb, visibles.map((f) => ({
        ...f.bruto,
        ciudad: f.ciudad,
        dias_abierto: f.dias,
      })));
      await mod.descargar(wb, 'FALTANTES');
      addToast(`Excel con ${formatNumero(visibles.length)} faltante(s) — es lo que estás viendo`, 'success');
    } catch (err) {
      addToast(err?.message || 'No pude generar el Excel', 'error');
    } finally {
      setGenerandoExcel(false);
    }
  };

  // ── Cabecera de la pantalla ──────────────────────────────────────────────
  const acciones = (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ver por</span>
        <div className="flex items-center gap-1 p-1 bg-primary/5 rounded-2xl" role="group" aria-label="Ver los faltantes agrupados por">
          {[['cliente', 'Cliente'], ['producto', 'Producto']].map(([v, etiqueta]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              aria-pressed={vista === v}
              className={`px-3 h-8 rounded-xl text-xs font-semibold transition-all ${
                vista === v ? 'bg-surface shadow-sm text-primary' : 'text-muted hover:text-primary'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={FileSpreadsheet}
        onClick={descargarExcel}
        loading={generandoExcel}
        disabled={!visibles.length}
        title="Descargar en Excel lo que estás viendo"
      >
        <span className="hidden sm:inline">Descargar Excel</span>
      </Button>
    </div>
  );

  // La foto de un reparto sustituye a la lista: es otra pregunta («qué pasó ese
  // día») y mezclarla con el libro vivo debajo sería pedirle que adivine cuál de
  // las dos tablas está mirando.
  if (repartoParam) {
    return (
      <Layout title="Faltantes" subtitle="La foto de un reparto: qué pidió, qué recibió y qué le quedó faltando a cada cliente.">
        <FotoDeReparto numero={repartoParam} onSalir={() => setSearchParams({}, { replace: true })} />
      </Layout>
    );
  }

  return (
    <Layout
      title="Faltantes"
      subtitle="Lo que quedó sin entregar en repartos anteriores, cliente por cliente."
      actions={acciones}
    >
      <div className="space-y-4">

        {/* ── Los cuatro indicadores ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiFaltante
            label="Clientes con faltante"
            valor={resumen ? formatNumero(resumen.clientes) : null}
            icon={Users}
            color="bg-warning/70"
          />
          <KpiFaltante
            label="Pacas faltando"
            valor={resumen ? formatNumero(resumen.unidades) : null}
            icon={PackageOpen}
            color="bg-primary/70"
          />
          <KpiFaltante
            label="Valor de lo que falta"
            valor={resumen ? formatCOP(resumen.valor) : null}
            /* Este subtítulo es obligatorio. Sin él alguien va a creer que es el
               precio de hoy, y el precio de origen no se actualiza NUNCA. */
            sub="al precio de cuando se pidió"
            icon={Coins}
            color="bg-secondary/70"
          />
          <KpiFaltante
            label="Lo más viejo"
            valor={resumen ? (resumen.viejo ? `${formatNumero(resumen.viejo.dias)} días` : 'Nada') : null}
            sub={resumen?.viejo
              ? `${formatFechaCorta(resumen.viejo.desde).slice(0, 5)} · ${resumen.viejo.cliente_nombre} · ${formatNumero(resumen.viejo.repartos)} reparto(s)`
              : undefined}
            icon={Clock}
            color="bg-error/70"
          />
        </div>

        {/* ── Filtros ────────────────────────────────────────────────────── */}
        <Card padding={false}>
          <CardBody className="p-4 space-y-3">
            <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label htmlFor={`${uid}-buscar`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  Buscar
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  <input
                    id={`${uid}-buscar`}
                    type="text"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Cliente, referencia o ciudad"
                    className="w-full h-8 pl-8 pr-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`${uid}-cliente`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  Cliente
                </label>
                <BuscadorLista
                  id={`${uid}-cliente`}
                  value={filtroCliente}
                  onChange={setFiltroCliente}
                  placeholder="Todos"
                  opciones={[
                    { value: 'todos', label: 'Todos' },
                    ...opcionesCliente.map(([id, nombre]) => ({ value: id, label: nombre })),
                  ]}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-referencia`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  Referencia
                </label>
                <BuscadorLista
                  id={`${uid}-referencia`}
                  value={filtroReferencia}
                  onChange={setFiltroReferencia}
                  placeholder="Todas"
                  opciones={[
                    { value: 'todas', label: 'Todas' },
                    ...opcionesReferencia.map(([clave, etiqueta]) => ({ value: clave, label: etiqueta })),
                  ]}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-estado`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  Estado
                </label>
                <BuscadorLista
                  value={filtroEstado}
                  onChange={(valorElegido) => setFiltroEstado(valorElegido)}
                  opciones={[
                    ...OPCIONES_ESTADO.map((o) => ({ value: o.value, label: o.label })),
                  ]}
                  id={`${uid}-estado`}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-antiguedad`} className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  Antigüedad
                </label>
                <BuscadorLista
                  value={filtroAntiguedad}
                  onChange={(valorElegido) => setFiltroAntiguedad(valorElegido)}
                  opciones={[
                    ...OPCIONES_ANTIGUEDAD.map((o) => ({ value: o.value, label: o.label })),
                  ]}
                  id={`${uid}-antiguedad`}
                  className="w-full h-8 px-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Esta casilla es lo que convierte la pantalla en herramienta y no
                  en informe: cruza contra la disponibilidad de hoy y deja sólo lo
                  que se podría entregar ya. Si el inventario no se pudo leer va
                  deshabilitada y lo dice, porque filtrar contra un stock que no
                  existe escondería faltantes reales. */}
              <label
                className={`inline-flex items-center gap-2 text-xs ${stockLeido ? 'text-primary cursor-pointer' : 'text-muted/60 cursor-not-allowed'}`}
                title={stockLeido
                  ? 'Deja sólo los faltantes que el inventario de hoy alcanza a cubrir enteros.'
                  : 'No pude leer el inventario, así que no puedo saber qué alcanza hoy.'}
              >
                <input
                  type="checkbox"
                  checked={soloAlcanza}
                  disabled={!stockLeido}
                  onChange={(e) => setSoloAlcanza(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-secondary focus:ring-2 focus:ring-secondary/30"
                />
                Sólo lo que hoy alcanza
              </label>

              <div className="flex items-center gap-3">
                {hayFiltro && (
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline underline-offset-2"
                  >
                    <RotateCcw size={12} aria-hidden="true" /> Quitar los filtros
                  </button>
                )}
                {selloDeHora && (
                  <span className="text-[11px] text-muted tabular-nums">Consultado a las {selloDeHora}</span>
                )}
              </div>
            </div>

            {/* La vista se elige arriba en pantallas grandes; en el móvil la
                cabecera no tiene sitio, así que el segmentado se repite aquí en
                vez de desaparecer. */}
            <div className="md:hidden flex items-center gap-1 p-1 bg-primary/5 rounded-2xl w-fit" role="group" aria-label="Ver los faltantes agrupados por">
              {[['cliente', 'Por cliente'], ['producto', 'Por producto']].map(([v, etiqueta]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVista(v)}
                  aria-pressed={vista === v}
                  className={`px-3 h-8 rounded-xl text-xs font-semibold transition-all ${
                    vista === v ? 'bg-surface shadow-sm text-primary' : 'text-muted hover:text-primary'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* ── La escalada ────────────────────────────────────────────────── */}
        {!error && aplazados > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-xs text-warning" role="status">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Hay <strong>{formatNumero(aplazados)} faltante(s)</strong> esperando 3 repartos o más.
              Repártelos primero o anúlalos.
            </span>
          </div>
        )}

        {/* ── Contenido ──────────────────────────────────────────────────── */}
        {error ? (
          /* Esto NO es un vacío, y por eso no usa EmptyState: un vacío dice «no
             hay nada» y aquí lo que pasa es que no sabemos. La frase del medio es
             la más importante de la pantalla. */
          <Card className="border-error/40 bg-error/10">
            <CardBody className="space-y-3">
              <p className="text-sm font-semibold text-error">No pude consultar los faltantes.</p>
              <p className="text-xs text-error/90">
                Esto <strong>NO</strong> significa que no le debas nada a nadie: es que la consulta falló.
              </p>
              <p className="text-[11px] text-error/70">{error}</p>
              <Button variant="danger" size="sm" icon={RotateCcw} onClick={cargar} loading={cargando}>
                Reintentar
              </Button>
            </CardBody>
          </Card>
        ) : cargando ? (
          <div className="rounded-2xl border border-border/60 bg-surface divide-y divide-border/50">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse bg-primary/[0.03]" />
            ))}
          </div>
        ) : filas.length === 0 ? (
          <Card><CardBody>
            {filtroEstado === 'completado' ? (
              <EmptyState
                icon={Check}
                title="Todavía no has completado ninguno"
                description="Cuando entregues algo de lo que quedó faltando, va a quedar aquí el registro."
              />
            ) : filtroEstado === 'anulado' ? (
              <EmptyState
                icon={Ban}
                title="Todavía no has anulado ninguno"
                description="Anular da de baja un faltante sin entregarlo. Sólo un administrador puede hacerlo, y siempre queda el motivo."
              />
            ) : (
              <EmptyState
                icon={PackageOpen}
                title="No le estás quedando debiendo nada"
                description="Cuando un reparto no alcance para todo lo que pidieron, aquí queda anotado a quién le faltó qué."
                action={{ label: 'Ir a la Matriz', onClick: () => navigate('/separacion-masiva') }}
              />
            )}
          </CardBody></Card>
        ) : visibles.length === 0 ? (
          <Card><CardBody>
            <EmptyState
              icon={Search}
              title="Ningún faltante con ese filtro"
              description={
                resumen
                  ? `Hay ${formatNumero(resumen.unidades)} paca(s) faltando en total. Prueba quitando algún filtro.`
                  : 'Prueba quitando algún filtro.'
              }
              action={{ label: 'Quitar el filtro', onClick: limpiarFiltros }}
            />
          </CardBody></Card>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted" role="status">
              {vista === 'cliente'
                ? `${formatNumero(bloquesCliente.length)} cliente(s)`
                : `${formatNumero(bloquesProducto.length)} producto(s)`}
              {' · '}{formatNumero(visibles.length)} renglón(es){' · '}
              <strong className="text-warning">{formatNumero(totalVisibleUnidades)} paca(s) faltando</strong>
              {' · '}{formatCOP(totalVisibleValor)} al precio de cuando se pidió
            </p>

            {vista === 'cliente' ? (
              /* El max-h no es decorativo: un contenedor con overflow sólo se
                 comporta como zona desplazable si tiene un alto que respetar, y
                 sin él el `sticky top-0` de la cabecera no tiene contra qué
                 pegarse. */
              <div className="overflow-x-auto max-h-[70vh] rounded-2xl border border-border/60 bg-surface">
                <table className="w-full min-w-[1020px] text-sm">
                  <caption className="sr-only">
                    Faltantes agrupados por cliente: dentro de cada cliente, un renglón por producto con lo que se le quedó faltando.
                  </caption>
                  {/* El sticky va también en CADA th: en Safari un thead
                      pegajoso no basta. Y z-[1] y no z-10, o al bajar la página
                      la cabecera se monta sobre la barra superior. */}
                  <thead className="sticky top-0 z-[1]">
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-3 py-2 w-[18%] min-w-[170px]">Cliente</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[160px]">Referencia</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[110px]">Calidad</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[70px]">Pidió</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[80px]">Recibió</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[74px]">Falta</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[110px]">Precio</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[124px]">Valor</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 w-[110px]">Desde</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface px-2 py-2 w-[92px]">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>

                  {bloquesCliente.map((b) => (
                    <tbody key={b.cliente_id} className="border-t border-border/70">
                      {b.filas.map((f, i) => (
                        <tr key={f.id} className="border-t border-border/40">
                          {i === 0 && (
                            <td rowSpan={b.filas.length + 1} className="align-top px-3 py-1.5 border-r border-border/40">
                              <div className="min-w-0">
                                <RefLink to="/cartera" id={b.cliente_id} title="Ver la cartera de este cliente"
                                  className="text-sm font-medium text-primary">
                                  {b.nombre}
                                </RefLink>
                                {/* El celular va junto a la ciudad porque esta
                                    pantalla existe para llamar: casi siempre se
                                    abre cuando el cliente ya llamó preguntando, o
                                    cuando llega mercancía y hay que avisarle. */}
                                <p className="text-[11px] text-muted truncate leading-tight">
                                  {b.ciudad || 'Sin ciudad'}{b.celular ? ` · ${b.celular}` : ''}
                                </p>
                                {b.inactivo && <Badge variant="inactivo" size="sm" className="mt-1">Inactivo</Badge>}
                              </div>
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-primary">
                            {f.referencia}
                            {f.promocion && (
                              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/15 text-secondary align-middle"
                                title="El precio de origen era de promoción.">promo</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted text-xs">{f.calidad || '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums"
                            title={`Es todo lo que se le ha quedado faltando de este producto sumando repartos: ${formatNumero(f.pidio)} paca(s).`}>
                            {formatNumero(f.pidio)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {formatNumero(f.recibio)}
                            {f.anuladas > 0 && (
                              <span className="block text-[10px] text-muted/70" title="Pacas que se dieron de baja sin entregarlas.">
                                {formatNumero(f.anuladas)} anuladas
                              </span>
                            )}
                          </td>
                          {/* La cifra que importa. En ámbar y nunca en rojo:
                              quedar faltando no es un fallo del sistema, es el
                              hecho que se está registrando. */}
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-warning">
                            {f.falta > 0 ? formatNumero(f.falta) : <span className="text-muted/50 font-normal">—</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted">{formatCOP(f.precio)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatCOP(f.valor)}</td>
                          <td className="px-2 py-1.5"><CeldaDesde fila={f} mostrarEstado={mostrarEstadoEnFilas} /></td>
                          <td className="px-2 py-1.5">
                            <AccionesFila fila={f} esAdmin={esAdmin} onCompletar={setCompletando} onAnular={setAnulando} />
                          </td>
                        </tr>
                      ))}
                      {/* Pie del cliente: es la cuenta que hoy hace a ojo. */}
                      <tr className="border-t border-border/70 bg-primary/[0.02] text-[11px] text-muted">
                        <td colSpan={4} className="px-2 py-1.5 font-semibold uppercase tracking-wide">
                          Total {b.nombre}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-warning">
                          {formatNumero(b.unidades)}
                        </td>
                        {/* El total de pacas ya está en la columna «Falta», dos
                            celdas a la izquierda: repetirlo aquí obligaría a
                            comprobar si son el mismo número o dos distintos. */}
                        <td colSpan={4} className="px-2 py-1.5 text-right tabular-nums">
                          {formatCOP(b.valor)} <span className="text-muted/70">al precio de cuando se pidió</span>
                        </td>
                      </tr>
                    </tbody>
                  ))}
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] rounded-2xl border border-border/60 bg-surface">
                <table className="w-full min-w-[940px] text-sm">
                  <caption className="sr-only">
                    Faltantes agrupados por producto: dentro de cada producto, un renglón por cliente al que se le debe.
                  </caption>
                  <thead className="sticky top-0 z-[1]">
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-3 py-2 w-[20%] min-w-[180px]">Producto</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 w-[170px]">Disponible hoy</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[170px]">Cliente</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 min-w-[120px]">Ciudad</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-right px-2 py-2 w-[74px]">Falta</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface text-left px-2 py-2 w-[110px]">Desde</th>
                      <th scope="col" style={RAYA_CABECERA} className="sticky top-0 bg-surface px-2 py-2 w-[92px]">
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>

                  {bloquesProducto.map((b) => {
                    const cubre = b.disponibles === null ? null : b.disponibles >= b.unidades;
                    return (
                      <tbody key={b.clave} className="border-t border-border/70">
                        {b.filas.map((f, i) => (
                          <tr key={f.id} className="border-t border-border/40">
                            {i === 0 && (
                              <>
                                <td rowSpan={b.filas.length + 1} className="align-top px-3 py-1.5 border-r border-border/40">
                                  <p className="font-medium text-primary truncate">{b.referencia}</p>
                                  <p className="text-[11px] text-muted truncate">{b.calidad || 'Sin calidad'}</p>
                                </td>
                                <td rowSpan={b.filas.length + 1} className="align-top px-2 py-1.5 border-r border-border/40">
                                  {/* Semáforo del inventario de hoy. El «—» del
                                      caso sin lectura NO es un cero: no saber
                                      cuánto hay y saber que no hay ninguna son
                                      dos cosas distintas y aquí se ven distintas. */}
                                  {b.disponibles === null ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/15 text-muted"
                                      title="No pude leer el inventario, así que no sé cuántas hay hoy.">
                                      — sin lectura
                                    </span>
                                  ) : b.disponibles === 0 ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/15 text-muted">sin stock</span>
                                  ) : (
                                    <div className="space-y-1">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${cubre ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                                        {formatNumero(b.disponibles)} disp
                                      </span>
                                      <p className={`text-[10px] leading-tight ${cubre ? 'text-success' : 'text-warning'}`}>
                                        {cubre ? 'alcanza para saldarlo' : `alcanza para ${formatNumero(b.disponibles)} de ${formatNumero(b.unidades)}`}
                                      </p>
                                    </div>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="px-2 py-1.5">
                              <RefLink to="/cartera" id={f.cliente_id} title="Ver la cartera de este cliente"
                                className="text-sm text-primary">
                                {f.cliente_nombre}
                              </RefLink>
                            </td>
                            <td className="px-2 py-1.5 text-muted text-xs truncate">{f.ciudad || '—'}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-warning">
                              {f.falta > 0 ? formatNumero(f.falta) : <span className="text-muted/50 font-normal">—</span>}
                            </td>
                            <td className="px-2 py-1.5"><CeldaDesde fila={f} mostrarEstado={mostrarEstadoEnFilas} /></td>
                            <td className="px-2 py-1.5">
                              <AccionesFila fila={f} esAdmin={esAdmin} onCompletar={setCompletando} onAnular={setAnulando} />
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-border/70 bg-primary/[0.02] text-[11px] text-muted">
                          <td colSpan={3} className="px-2 py-1.5">
                            <span className="font-semibold uppercase tracking-wide">
                              Se deben {formatNumero(b.unidades)}
                            </span>
                            {b.disponibles !== null && <> · hay {formatNumero(b.disponibles)} disponibles</>}
                            {' · '}{formatCOP(b.valor)}
                          </td>
                          <td colSpan={2} className="px-2 py-1.5 text-right">
                            {/* Enlace simple y sin precarga: pasar líneas entre
                                pantallas necesitaría un almacén global que este
                                proyecto no tiene, y el chip de arriba ya le dijo
                                lo que necesitaba saber antes de ir. */}
                            <Link
                              to="/separacion-masiva"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline underline-offset-2"
                            >
                              Ir a la Matriz <ArrowRight size={12} aria-hidden="true" />
                            </Link>
                          </td>
                        </tr>
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {completando && (
        <ModalCompletar
          fila={completando}
          guardando={guardando}
          onCerrar={() => setCompletando(null)}
          onConfirmar={confirmarCompletar}
        />
      )}
      {anulando && (
        <ModalAnular
          fila={anulando}
          guardando={guardando}
          onCerrar={() => setAnulando(null)}
          onConfirmar={confirmarAnular}
        />
      )}
    </Layout>
  );
}
