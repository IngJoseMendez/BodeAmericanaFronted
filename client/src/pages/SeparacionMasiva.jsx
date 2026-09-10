// ── LA MATRIZ, EN DOS FASES ─────────────────────────────────────────────────
//
// Este archivo es el ORQUESTADOR. No pinta ni una tabla: carga los datos, guarda
// el estado y decide en qué fase se está.
//
//   Fase 1 · Pedidos  → pages/matriz/FasePedidos.jsx
//   Fase 2 · Reparto  → pages/matriz/FaseDistribucion.jsx (+ GrupoProducto, CintaClientes)
//
// EL CAMBIO DE FONDO, y todo lo demás sale de aquí: hasta hoy esta pantalla
// obligaba a MENTIR. Si entre todos los clientes se pedían más pacas de las que
// había, el botón se apagaba y la única salida era borrarle el pedido a alguien.
// Justo el dato que hacía falta —quién pidió qué y cuánto no alcanzó— era el que
// había que destruir para poder guardar. Ahora se captura la demanda entera en
// la Fase 1, se reparte a dedo en la Fase 2, y lo que no alcance queda anotado
// como FALTANTE del cliente, que es una palabra sola, con un solo significado,
// en la pantalla, en el código y en la base de datos.
//
// DOS ESTADOS INDEPENDIENTES Y UN INTERRUPTOR. `filas` (lo que pidió cada
// cliente) y `asignado` (lo que se le reparte) viven aquí y no se pisan; `fase`
// sólo decide cuál de las dos pantallas se ve. Las dos siguen MONTADAS: la que
// no está activa se oculta con `hidden` en vez de desmontarse, porque desmontar
// y remontar cientos de <tbody> con sus <select> en cada ida y vuelta es un
// congelón perceptible y el diseño promete que volver es gratis.
//
// EL RIESGO SILENCIOSO NÚMERO UNO DEL PROYECTO. `FilaCliente` y `GrupoProducto`
// son React.memo y son la única defensa contra repintar cientos de filas por
// tecla. Cualquier prop que baje a ellos con identidad nueva anula el memo sin
// que falle nada: simplemente la pantalla se vuelve melaza con la matriz de
// media mañana dentro. Por eso aquí abajo hay tanto `useRef` y tanto `useMemo`
// con caché de firma, y por eso los memos del dinero de la Fase 2 devuelven el
// objeto anterior mientras se está en la Fase 1.
//
// Y LA REGLA DEL DINERO, que este repo ya rompió una vez: no se escribe una
// segunda aritmética. El total de la Fase 2 sale de proyectar `filas` con las
// cantidades repartidas y pasarlo por la `totalesFila` de siempre.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { useToast, useConfirm } from '../components/common';
import {
  clientesApi, cotizacionesApi, listaPreciosApi, matrizApi, pacasApi, preciosApi,
  preciosPromocionApi, transportesApi,
} from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { useAuth } from '../context/AuthContext';
import { cantidadDe, precioDe, itemCompleto, totalesFila } from '../lib/cotizacion';
import { nuevoLibro, descargar, hojaMatrizClientes } from '../lib/entregables';
import { parseMonto, formatCOP, formatNumero } from '../lib/money';
import { hoy, entreFechas } from '../lib/fecha';
import {
  normTxt, claveStock, claveAsignacion, aProrrata, porOrden, cubrirFaltante,
  reconciliarReparto, proyectarFilas, totalesDeReparto,
} from '../lib/matriz';
import FasePedidos from './matriz/FasePedidos';
import FaseDistribucion from './matriz/FaseDistribucion';
import {
  numServidor, itemVacio, filaVacia, entregaDeCliente,
  itemTieneAlgo, resumenFaltante, porCargar,
} from './matriz/comun';
// El borrador del navegador vive en su propio módulo: son funciones puras y
// aquí sólo quedan los tres efectos que las llaman. Sigue siendo la red de
// debajo del autoguardado contra el servidor, no un sustituto suyo.
import {
  claveBorrador, leerBorrador, escribirBorrador, olvidarBorrador, tieneAlgo, selloBorrador,
} from './matriz/borrador';

// ─────────────────────────────────────────────────────────────────────────────

// Stock agregado por referencia + calidad, que es como el servidor busca las
// pacas al crear la cotización. Vive a nivel de módulo porque lo necesitan tanto
// el `useMemo` que alimenta los semáforos como la relectura que se hace al
// cruzar de fase, y esa segunda no puede esperar a que el estado se asiente.
const agruparStock = (filasStock) => {
  const m = new Map();
  for (const r of filasStock) {
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
};

// Objetos vacíos de módulo. Devolverlos —en vez de crear `{}` o `new Map()` en
// cada render— es lo que permite que los memos del dinero de la Fase 2 no
// cambien de identidad mientras se está tecleando en la Fase 1.
const SIN_TOTALES = {
  clientes: new Map(), numClientes: 0, unidades: 0, pedidas: 0, faltando: 0,
  clientesConFaltante: 0, clientesSinNada: 0, total: 0,
};
const SIN_PRODUCTOS = [];

export default function SeparacionMasiva() {
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { usuario } = useAuth();
  // Ojo con el nombre heredado del catálogo: `categorias` son las REFERENCIAS,
  // y cada una lleva en `temporada_nombre` la categoría que usa la tabla de
  // Precios. `calidades` sí se llama como lo que es, y hace falta: es lo que se
  // le ofrece a una referencia que no tiene ni una paca en bodega.
  const { categorias: optsReferencia, calidades: optsCalidad } = useCatalog();

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
  const [soloConFaltante, setSoloConFaltante] = useState(false);

  const [filas, setFilas] = useState({});        // cliente_id -> fila
  const [problemas, setProblemas] = useState({}); // cliente_id -> [mensajes]
  const [problemasSueltos, setProblemasSueltos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [ultimoEnvio, setUltimoEnvio] = useState(null);
  const [generandoMatriz, setGenerandoMatriz] = useState(false);
  const [borradorRecuperado, setBorradorRecuperado] = useState(null);
  const [estadoGuardado, setEstadoGuardado] = useState('');

  // ── Estado de la Fase 2 ───────────────────────────────────────────────────
  const [fase, setFase] = useState('pedidos');
  // Lo que devolvió `cerrar-pedidos`: la matriz ya pivotada por producto, con el
  // inventario releído y su sello de hora. Si el servidor no contesta se arma
  // aquí mismo con lo que hay en pantalla, y la franja ámbar lo dice.
  const [reparto, setReparto] = useState(null);
  const [asignado, setAsignado] = useState(() => new Map());
  const [listos, setListos] = useState(() => new Set());
  const [cambiados, setCambiados] = useState(() => new Set());
  const [tocados, setTocados] = useState(() => new Set());
  const [abiertos, setAbiertos] = useState(() => new Set());
  const [ajustados, setAjustados] = useState([]);
  const [cruzando, setCruzando] = useState(false);
  const [releyendo, setReleyendo] = useState(false);
  // Las líneas a las que ella apagó el faltante, por `claveAsignacion`. La dueña
  // contestó «sí, todo» a «¿todo lo que no alcanza queda como faltante?», pero
  // con una casilla escondida para descartar un caso suelto: el cliente que pide
  // 50 sabiendo que hay 10. Sin ella, la primera ronda llena el libro de
  // faltante falso y el libro deja de servir para lo único que existe, que es
  // saber a quién se le debe de verdad. Se guarda en NEGATIVO —sólo lo
  // descartado— para que el estado por defecto sea el del contrato (`true`) y
  // una línea nueva nunca nazca descartada por accidente.
  const [sinFaltante, setSinFaltante] = useState(() => new Set());
  // El cliente que se resalta dos segundos en la Fase 1 al volver de repartir.
  // Es el equivalente del `clienteResaltado` que la Fase 2 ya tiene para la
  // cinta: se resalta, no se filtra, y se apaga solo.
  const [clienteResaltadoPedidos, setClienteResaltadoPedidos] = useState(null);

  // Los faltantes viven en un ref y NO en el estado: son el MISMO objeto durante
  // toda la vida de la pantalla salvo que se recalculen, y esa estabilidad es lo
  // que permite pasárselos a cientos de filas memoizadas sin tirar el memo. El
  // sello es un contador que sí está en estado, y existe sólo para que React se
  // entere de que el contenido del ref cambió.
  const faltantesRef = useRef(new Map());
  const [selloFaltantes, setSelloFaltantes] = useState(0);
  const [faltantesFallo, setFaltantesFallo] = useState(false);

  // Hasta que no se haya LEÍDO el borrador no se escribe encima: si el
  // autoguardado se adelantara, la primera pasada (con la matriz todavía vacía)
  // borraría el trabajo que se venía a recuperar.
  const restauradoRef = useRef(false);
  // La última foto de lo tecleado, para poder guardarla desde beforeunload, que
  // no puede leer el estado de React.
  const fotoRef = useRef(null);

  // Las tablas de precios viven en un ref y no en el estado para que
  // resolverPrecio y los manejadores de la matriz NUNCA cambien de identidad:
  // si cambiaran, React.memo dejaría de servir y cada tecla repintaría las
  // cientos de filas.
  const tablasRef = useRef({ listaPrecios: [], preestablecidos: [], promos: [], referencias: [], calidades: [] });
  const stockRef = useRef(new Map());
  const calidadesRef = useRef(new Map());
  const clientesRef = useRef(new Map());
  // Espejos de lo que hay ahora mismo en pantalla, para los manejadores estables
  // y para el autoguardado con retardo, que se ejecuta cuando el render que lo
  // programó ya pasó.
  const filasRef = useRef({});
  const datosRef = useRef({ tasa: '', transporteGlobal: '', validezDias: '15' });
  // El reparto tecleado, también en un espejo. Es lo que permite que
  // `prepararReparto` —y con él `irAlReparto`, que se lo pasa a la Fase 1— NO
  // dependan de `asignado`: si dependieran, su identidad cambiaría con cada
  // tecla del reparto, el memo de la Fase 1 se caería y cada pulsación
  // repintaría las dos pantallas enteras.
  const asignadoRef = useRef(new Map());
  // Espejo de las casillas «esto no queda debiendo». Lo leen `lineasDeCliente`
  // (que es un useCallback SIN dependencias y no puede llevar estado dentro) y
  // el cuerpo de `repartir`, que se arma medio segundo después del último clic.
  const sinFaltanteRef = useRef(new Set());
  // De qué cliente venía al pulsar «Volver a los pedidos», y a qué altura estaba
  // la tabla de la Fase 1 cuando la dejó. Los dos en refs porque nada de esto
  // tiene que provocar un render: sólo se leen al conmutar de fase.
  const ultimoClienteRef = useRef(null);
  const scrollPedidosRef = useRef(0);
  const resaltadoTimerRef = useRef(null);
  // El reparto abierto en el servidor. En un ref porque lo leen manejadores que
  // no pueden depender del estado sin perder su identidad.
  const repartoRef = useRef({ id: null, numero: null, creando: null, caido: false });
  const timersRef = useRef(new Map());

  useEffect(() => { tablasRef.current.referencias = optsReferencia || []; }, [optsReferencia]);
  useEffect(() => { tablasRef.current.calidades = optsCalidad || []; }, [optsCalidad]);
  useEffect(() => {
    clientesRef.current = new Map((clientes || []).map((c) => [String(c.id), c]));
  }, [clientes]);
  useEffect(() => { filasRef.current = filas; }, [filas]);
  useEffect(() => { asignadoRef.current = asignado; }, [asignado]);
  useEffect(() => { sinFaltanteRef.current = sinFaltante; }, [sinFaltante]);
  useEffect(() => { datosRef.current = { tasa, transporteGlobal, validezDias }; }, [tasa, transporteGlobal, validezDias]);

  const cargarStock = useCallback(async (respaldo) => {
    // Una sola petición para todo el stock. Cotizaciones pregunta por cada fila;
    // aquí eso serían cientos de peticiones mientras la usuaria escribe.
    let bruto = null;
    try {
      bruto = await cotizacionesApi.disponibilidadMasiva();
    } catch (err) {
      console.error('[Matriz] disponibilidad-masiva', err);
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
    // Se devuelve TAMBIÉN el mapa ya agrupado: quien releva el inventario al
    // cruzar de fase lo necesita en el acto y no puede esperar a que el estado
    // se asiente en el siguiente render.
    return { ok: hayEndpoint, mapa: agruparStock(filasStock), leidoEn: new Date().toISOString() };
  }, []);

  // ── El libro de faltantes: UNA sola llamada agregada ──────────────────────
  // Jamás una por cliente: la Matriz pinta cientos de <tbody>. Y si falla NO se
  // pinta «Le faltaron 0» en nadie ni se pinta el contador: no se pinta nada, y
  // sube una línea al aviso de carga. Un cero inventado se lee como «a este no
  // le debo», que es exactamente la mentira que este módulo existe para impedir.
  const cargarFaltantes = useCallback(async () => {
    try {
      const r = await matrizApi.getFaltantes({ estado: 'abierto' });
      const lista = Array.isArray(r?.faltantes) ? r.faltantes : null;
      // `generado_en` es la prueba positiva de que la respuesta es real. Sin él
      // —o sin el arreglo— se trata como fallo: el contrato rompe a propósito la
      // convención del repo para que un arreglo vacío no pueda confundirse con
      // «me quedé sin datos».
      if (!r || !r.generado_en || lista === null) throw new Error('Respuesta de faltantes sin la forma esperada');

      const porCliente = new Map();
      for (const f of lista) {
        if (!f || (Number(f.cantidad_abierta) || 0) <= 0) continue;
        const id = String(f.cliente_id);
        if (!porCliente.has(id)) porCliente.set(id, { nombre: f.cliente_nombre || 'este cliente', lineas: [] });
        porCliente.get(id).lineas.push(f);
      }
      const salida = new Map();
      for (const [id, v] of porCliente) {
        const resumen = resumenFaltante(v.nombre, v.lineas);
        if (resumen) salida.set(id, resumen);
      }
      faltantesRef.current = salida;
      setFaltantesFallo(false);
      setSelloFaltantes((n) => n + 1);
      return true;
    } catch (err) {
      console.error('[Matriz] faltantes', err);
      faltantesRef.current = new Map();
      setFaltantesFallo(true);
      setSelloFaltantes((n) => n + 1);
      return false;
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      // La sexta y la séptima promesa son de la entrega C: el libro de faltantes
      // y el reparto que quedó abierto en el servidor. Van en el MISMO
      // allSettled que ya existía porque son peticiones independientes y
      // encadenarlas alargaría la espera de la pantalla sin ganar nada.
      const [rCli, rLista, rPre, rPromo, rTrans, rFalt, rAbierto] = await Promise.allSettled([
        clientesApi.getAll({ estado: 'activo' }),
        listaPreciosApi.getAll(),
        preciosApi.getAll(),
        preciosPromocionApi.getAll(),
        transportesApi.getAll(),
        cargarFaltantes(),
        matrizApi.getRepartoAbierto(),
      ]);
      if (!vivo) return;

      const lista = (r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []);
      const listaPrecios = lista(rLista);
      const listaClientes = lista(rCli);

      setClientes(listaClientes);
      setTransportes(lista(rTrans));
      clientesRef.current = new Map(listaClientes.map((c) => [String(c.id), c]));

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
      // haberlo escrito YA mientras estas peticiones estaban en vuelo.
      tablasRef.current = {
        ...tablasRef.current,
        listaPrecios,
        preestablecidos: lista(rPre),
        promos: promosVigentes,
      };

      const stockFresco = await cargarStock(listaPrecios);
      if (!vivo) return;

      // ── El reparto abierto manda sobre el borrador del navegador ──────────
      // Sólo puede haber UNO en todo el sistema, y eso es lo que resuelve el
      // caso de las dos pestañas: lo que está en el servidor es la verdad
      // compartida; el borrador local es la copia de esta pestaña. Si el
      // servidor trae líneas, se recupera de ahí y se completa con lo que el
      // borrador sí sabe y el servidor no guarda (descuento y transporte de cada
      // fila, que el endpoint por cliente no recibe).
      const abierto = rAbierto.status === 'fulfilled' ? rAbierto.value : null;
      const repartoAbierto = abierto?.reparto || null;
      if (repartoAbierto?.id) {
        repartoRef.current.id = repartoAbierto.id;
        repartoRef.current.numero = repartoAbierto.numero || null;
        if (repartoAbierto.tasa != null && numServidor(repartoAbierto.tasa) > 0) {
          setTasa(formatNumero(numServidor(repartoAbierto.tasa), { maxDecimales: 2 }));
        }
        if (numServidor(repartoAbierto.transporte_unitario) > 0) {
          setTransporteGlobal(formatNumero(numServidor(repartoAbierto.transporte_unitario), { maxDecimales: 2 }));
        }
        if (numServidor(repartoAbierto.validez_dias) > 0) setValidezDias(String(repartoAbierto.validez_dias));
      } else if (rAbierto.status === 'rejected') {
        // No hay reparto en el servidor y no se pudo ni preguntar: se trabaja en
        // local y el autoguardado lo intentará de nuevo al primer cambio.
        repartoRef.current.caido = true;
      }

      const fallos = [];
      if (rCli.status === 'rejected') fallos.push('los clientes');
      if (rLista.status === 'rejected') fallos.push('los precios del inventario');
      if (rPre.status === 'rejected') fallos.push('los precios preestablecidos');
      if (rPromo.status === 'rejected') fallos.push('las promociones');
      if (rTrans.status === 'rejected') fallos.push('los transportes');
      if (!stockFresco.ok) fallos.push('el stock (se está usando el de la lista de precios)');
      const faltantesOk = rFalt.status === 'fulfilled' && rFalt.value === true;
      setAvisoCarga(
        [
          fallos.length ? `No se pudieron cargar bien: ${fallos.join(', ')}. Revisa los precios antes de guardar.` : '',
          faltantesOk
            ? ''
            : 'No pude leer lo que quedó faltando de repartos anteriores.'
              + ' Que no aparezca el aviso NO significa que no le debas nada a nadie.',
        ].filter(Boolean).join(' ') || null,
      );

      // Las líneas del reparto abierto se vuelcan a `filas`. Se hace DESPUÉS de
      // tener clientes y precios porque cada línea recupera el descuento pactado
      // de su cliente, que no viaja en la tabla de líneas.
      const lineasServidor = Array.isArray(abierto?.lineas) ? abierto.lineas : [];
      if (lineasServidor.length) {
        const local = leerBorrador(claveBorrador(usuario?.id));
        const recuperadas = {};
        // Las casillas «esto no queda debiendo» se recuperan del servidor, que
        // es donde de verdad viven (`cuenta_faltante` por línea). Sin esto, un
        // F5 devolvía las líneas bien pero las casillas nacían todas encendidas:
        // la pantalla enseñaría faltantes que el servidor NO va a anotar, que es
        // el sentido caro de la mentira. El Set va en negativo —sólo lo apagado—
        // igual que el estado que alimenta.
        const descartadas = new Set();
        for (const l of lineasServidor) {
          const id = String(l.cliente_id);
          if (!recuperadas[id]) {
            const base = filaVacia(clientesRef.current.get(id));
            const previo = local?.filas?.[id];
            recuperadas[id] = {
              ...base,
              items: [],
              // Lo que el servidor no guarda por línea se rescata del borrador
              // de esta pestaña si lo tiene; si no, del descuento pactado.
              descuento: previo?.descuento || base.descuento,
              tipo_descuento: previo?.tipo_descuento || base.tipo_descuento,
              transporte_unitario: previo?.transporte_unitario || '',
              tipo_transporte: previo?.tipo_transporte || '',
            };
          }
          const precio = numServidor(l.precio_unitario);
          recuperadas[id].items.push({
            ...itemVacio(),
            referencia: l.referencia || '',
            calidad: l.calidad || '',
            cantidad: String(Math.max(0, Math.round(numServidor(l.cantidad_pedida)))),
            precio: precio > 0 ? formatNumero(precio, { maxDecimales: 2 }) : '',
            esPromocion: Boolean(l.tiene_promocion),
            cargado: Math.max(0, Math.round(numServidor(l.cantidad_cargada_faltante))),
            respetaOrigen: Boolean(l.respeta_precio_origen),
          });
          // `=== false` y no `!l.cuenta_faltante`: una línea vieja guardada
          // antes de que existiera la columna llega sin el campo, y leerla como
          // apagada borraría faltantes que sí hay que anotar.
          if (l.cuenta_faltante === false) {
            descartadas.add(claveAsignacion(id, l.referencia, l.calidad));
          }
        }
        setFilas(recuperadas);
        if (descartadas.size) setSinFaltante(descartadas);
        setBorradorRecuperado({
          cuantos: Object.keys(recuperadas).length,
          cuando: selloBorrador(repartoAbierto?.updated_at || repartoAbierto?.created_at),
          origen: 'servidor',
        });
        addToast(
          `Recuperé el reparto ${repartoRef.current.numero || 'abierto'} tal como lo dejaste:`
          + ` ${Object.keys(recuperadas).length} cliente(s) con líneas.`,
          'info', 9000,
        );
      }
      restauradoRef.current = true;
      setCargando(false);
    })();
    return () => { vivo = false; };
    // Sólo al abrir: el catálogo de referencias se sincroniza aparte, en su
    // propio efecto, para no recargar toda la pantalla cuando llega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stockPorClave = useMemo(() => agruparStock(stock), [stock]);

  // Opciones del <select> de referencia: sólo lo que TIENE stock, en orden
  // alfabético y con lo que queda de cada una.
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

  // El SEGUNDO grupo del <select>: todo lo que existe en el catálogo y hoy no
  // tiene ni una paca. Es el cambio que sostiene el encargo: el caso que lo
  // motivó es "el cliente pide lo que se voló", y hasta hoy ese pedido no se
  // podía ni anotar porque la referencia agotada desaparecía de la lista.
  const opcionesSinStock = useMemo(() => {
    const conPacas = new Set(opcionesReferencia.map((o) => normTxt(o.nombre)));
    const m = new Map();
    for (const r of (optsReferencia || [])) {
      const nombre = r?.nombre;
      if (!nombre) continue;
      const k = normTxt(nombre);
      if (!k || conPacas.has(k) || m.has(k)) continue;
      m.set(k, { nombre });
    }
    // Y también lo que aparece en un faltante abierto aunque no esté en el
    // catálogo: si se le debe, se le tiene que poder volver a pedir.
    for (const info of faltantesRef.current.values()) {
      for (const l of info.lineas) {
        const k = normTxt(l.referencia);
        if (!k || conPacas.has(k) || m.has(k)) continue;
        m.set(k, { nombre: l.referencia });
      }
    }
    return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [optsReferencia, opcionesReferencia, selloFaltantes]);

  // Las calidades del catálogo: es a lo que cae el <select> de calidad cuando la
  // referencia elegida no tiene pacas y, por tanto, no tiene ninguna calidad con
  // existencias que ofrecer.
  const calidadesCatalogo = useMemo(() => {
    const vistas = new Set();
    const out = [];
    for (const c of (optsCalidad || [])) {
      const nombre = typeof c === 'string' ? c : c?.nombre;
      if (!nombre) continue;
      const k = normTxt(nombre);
      if (vistas.has(k)) continue;
      vistas.add(k);
      out.push(nombre);
    }
    return out.sort((a, b) => a.localeCompare(b, 'es'));
  }, [optsCalidad]);

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
   *   3. precio preestablecido (categoría + calidad)
   * Todo comparado con normTxt: sin eso el precio "no se pone solo".
   */
  const resolverPrecio = useCallback((referencia, calidad, clasificacion) => {
    const { listaPrecios, preestablecidos, promos, referencias } = tablasRef.current;
    const nRef = normTxt(referencia);
    const nCal = normTxt(calidad);
    if (!nRef || !nCal) return { precio: null, esPromocion: false, aviso: null };

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

    const enInventario = listaPrecios.find(
      (l) => normTxt(l.referencia) === nRef && normTxt(l.calidad) === nCal
    );
    const pInv = numServidor(enInventario?.precio);
    if (pInv > 0) return { precio: pInv, esPromocion: false, aviso: null };

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

  // ── AUTOGUARDADO POR CLIENTE (entrega C) ──────────────────────────────────
  // Va por cliente y no con la matriz entera a propósito: mandar cientos de
  // clientes en cada pulsación sería insostenible, y además un fallo de red sólo
  // compromete la fila que se estaba tocando en vez de toda la sesión. El
  // servidor hace DELETE + INSERT de las líneas de ESE cliente, así que el
  // cuerpo es diminuto y se puede llamar tan seguido como haga falta.
  const asegurarReparto = useCallback(async () => {
    if (repartoRef.current.id) return repartoRef.current.id;
    if (repartoRef.current.creando) return repartoRef.current.creando;
    const promesa = (async () => {
      const d = datosRef.current;
      const r = await matrizApi.crearReparto({
        tasa: parseMonto(d.tasa),
        transporte_unitario: parseMonto(d.transporteGlobal),
        validez_dias: Math.max(1, Math.round(parseMonto(d.validezDias)) || 15),
      });
      const id = r?.reparto?.id ?? null;
      repartoRef.current.id = id;
      repartoRef.current.numero = r?.reparto?.numero || null;
      return id;
    })();
    repartoRef.current.creando = promesa;
    try {
      return await promesa;
    } finally {
      repartoRef.current.creando = null;
    }
  }, []);

  /** Las líneas de un cliente en el formato del contrato, sin nada a medias. */
  const lineasDeCliente = useCallback((clienteId) => {
    const fila = filasRef.current[clienteId];
    if (!fila) return [];
    return fila.items.filter(itemCompleto).map((it, i) => ({
      referencia: it.referencia,
      calidad: it.calidad,
      cantidad_pedida: cantidadDe(it),
      cantidad_cargada_faltante: Math.min(Number(it.cargado) || 0, cantidadDe(it)),
      precio_unitario: precioDe(it),
      tiene_promocion: Boolean(it.esPromocion),
      respeta_precio_origen: Boolean(it.respetaOrigen),
      // LA CASILLA «ESTO NO QUEDA DEBIENDO», por línea. Iba `true` fijo, así que
      // la casilla de la Fase 2 no llegaba nunca al servidor y el libro se
      // llenaba igual de faltante falso: el backend respeta `cuenta_faltante`
      // desde el primer día y lo único que faltaba era dejar de mentirle. Va en
      // negativo (sólo lo descartado vive en el Set) para que el valor por
      // defecto siga siendo el del contrato.
      cuenta_faltante: !sinFaltanteRef.current.has(claveAsignacion(clienteId, it.referencia, it.calidad)),
      orden: i,
    }));
  }, []);

  const guardarClienteEnServidor = useCallback(async (clienteId) => {
    if (repartoRef.current.caido) return;
    try {
      const id = await asegurarReparto();
      if (!id) return;
      await matrizApi.guardarCliente(id, clienteId, { lineas: lineasDeCliente(clienteId) });
      setEstadoGuardado(`guardado en el servidor a las ${new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}`);
    } catch (err) {
      // No se avisa con un toast: mientras teclea, un aviso por cliente sería
      // insufrible y además no puede hacer nada al respecto. Se dice UNA vez en
      // la microcopy de la barra y se deja de intentar hasta que se cruce de
      // fase, que es donde el fallo sí importa y sí se cuenta con todas las
      // letras. Lo tecleado sigue a salvo en el borrador del navegador.
      console.error('[Matriz] autoguardado', err);
      repartoRef.current.caido = true;
      setEstadoGuardado('sin guardar en el servidor: queda la copia de este navegador');
    }
  }, [asegurarReparto, lineasDeCliente]);

  // Un cliente «sucio» se guarda con retardo, y el retardo se cuenta por
  // cliente: escribir en MARIA no puede cancelar el guardado de JOSE.
  const marcarSucio = useCallback((clienteId) => {
    const clave = String(clienteId);
    const previo = timersRef.current.get(clave);
    if (previo) clearTimeout(previo);
    timersRef.current.set(clave, setTimeout(() => {
      timersRef.current.delete(clave);
      guardarClienteEnServidor(clienteId);
    }, 1200));
  }, [guardarClienteEnServidor]);

  useEffect(() => () => {
    for (const t of timersRef.current.values()) clearTimeout(t);
    timersRef.current.clear();
    // El del resaltado también: apaga un setState de dos segundos sobre un
    // componente que ya no está montado.
    if (resaltadoTimerRef.current) clearTimeout(resaltadoTimerRef.current);
  }, []);

  // ── Manejadores de la Fase 1 (identidad estable, sin dependencias) ────────
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
    marcarSucio(clienteId);
  }, [olvidarProblema, nuevaFila, marcarSucio]);

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
    marcarSucio(clienteId);
  }, [olvidarProblema, marcarSucio]);

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
          // Tocar el precio a mano deshace el «respetar el de antes»: lo que
          // manda es lo último que ella escribió.
          respetaOrigen: ahora === antes ? items[idx].respetaOrigen : false,
        };
      }

      if (campo === 'referencia' || campo === 'calidad') {
        const referencia = items[idx].referencia;
        let calidad = items[idx].calidad;
        if (campo === 'referencia' && calidad) {
          if (!referencia) {
            calidad = '';
          } else {
            // Se limpia sólo si la calidad NO está entre las que el <select> va
            // a ofrecer para la referencia nueva. Una referencia agotada cae al
            // catálogo completo, así que borrar ahí la calidad que ella acababa
            // de escribir sería borrarle un dato que el campo sigue admitiendo.
            const conPacas = calidadesRef.current.get(normTxt(referencia));
            const elegibles = (conPacas && conPacas.length)
              ? conPacas
              : (tablasRef.current.calidades || []).map((c) => (typeof c === 'string' ? c : c?.nombre));
            if (!elegibles.some((c) => normTxt(c) === normTxt(calidad))) calidad = '';
          }
        }
        const info = stockRef.current.get(claveStock(referencia, calidad));
        const { precio, esPromocion, aviso } = resolverPrecio(referencia, calidad, info?.clasificacion || null);
        items[idx] = {
          ...items[idx],
          calidad,
          precio: precio != null ? formatNumero(precio, { maxDecimales: 2 }) : '',
          esPromocion,
          avisoPrecio: precio != null ? null : aviso,
          // CAMBIARLE LA REFERENCIA O LA CALIDAD A UNA LÍNEA CARGADA BORRA EL
          // RASTRO DEL FALTANTE. Si no, se saldaría un faltante de jeans
          // entregando chaquetas, y el libro quedaría cuadrado y mintiendo.
          cargado: 0,
          precioOrigen: null,
          respetaOrigen: false,
          faltanteId: null,
        };
      }

      return { ...prev, [clienteId]: { ...actual, items } };
    });
    olvidarProblema(clienteId);
    marcarSucio(clienteId);
  }, [resolverPrecio, olvidarProblema, marcarSucio]);

  // Respetarle el precio que tenía cuando se le quedó debiendo. Sólo se ofrece
  // cuando hoy está MÁS CARO; al revés sería ofrecer cobrarle de más a alguien
  // que ya se quedó esperando una vez.
  const respetarPrecio = useCallback((clienteId, idx) => {
    setFilas((prev) => {
      const actual = prev[clienteId];
      const item = actual?.items?.[idx];
      const origen = Number(item?.precioOrigen) || 0;
      if (!item || origen <= 0) return prev;
      const items = actual.items.map((it, i) => (
        i === idx
          ? { ...it, precio: formatNumero(origen, { maxDecimales: 2 }), respetaOrigen: true, avisoPrecio: null }
          : it
      ));
      return { ...prev, [clienteId]: { ...actual, items } };
    });
    marcarSucio(clienteId);
  }, [marcarSucio]);

  // ── Cargar al pedido lo que se le quedó faltando ──────────────────────────
  // Idempotente por construcción: carga sólo lo que falta POR cargar, sumando
  // sobre la línea que ya exista en vez de crear una segunda. Nunca dos líneas
  // del mismo producto para el mismo cliente: en la Fase 2 producirían dos
  // celdas y habría que fusionarlas a mano.
  const aplicarCargaFaltante = useCallback((filasActuales, clienteId) => {
    const info = faltantesRef.current.get(String(clienteId));
    if (!info) return { fila: null, agregadas: 0 };

    const base = filasActuales[clienteId];
    const items = base ? base.items.map((it) => ({ ...it })) : [];
    const yaCargado = new Map();
    for (const it of items) {
      if (!it.cargado) continue;
      const k = claveStock(it.referencia, it.calidad);
      yaCargado.set(k, (yaCargado.get(k) || 0) + (Number(it.cargado) || 0));
    }

    let agregadas = 0;
    for (const l of info.lineas) {
      const k = claveStock(l.referencia, l.calidad);
      const falta = porCargar(l.cantidad_abierta, yaCargado.get(k) || 0);
      if (falta <= 0) continue;
      agregadas += falta;
      const origen = numServidor(l.precio_unitario_origen);
      const idx = items.findIndex((it) => claveStock(it.referencia, it.calidad) === k);
      if (idx >= 0) {
        const it = items[idx];
        items[idx] = {
          ...it,
          cantidad: String(cantidadDe(it) + falta),
          cargado: (Number(it.cargado) || 0) + falta,
          precioOrigen: Number(it.precioOrigen) || (origen > 0 ? origen : null),
          faltanteId: it.faltanteId || l.id || null,
        };
      } else {
        // El precio se resuelve con la cascada de HOY, que no depende del stock.
        // Si no resuelve se cae al precio de cuando se le debía: es mejor dato
        // que un hueco, y el chip «Sin precio — escríbelo» sigue disponible si
        // tampoco hubiera eso.
        const info2 = stockRef.current.get(k);
        const resuelto = resolverPrecio(l.referencia, l.calidad, info2?.clasificacion || null);
        const precio = resuelto.precio != null ? resuelto.precio : origen;
        items.push({
          ...itemVacio(),
          referencia: l.referencia,
          calidad: l.calidad,
          cantidad: String(falta),
          precio: precio > 0 ? formatNumero(precio, { maxDecimales: 2 }) : '',
          esPromocion: resuelto.precio != null ? resuelto.esPromocion : Boolean(l.tiene_promocion_origen),
          avisoPrecio: precio > 0 ? null : resuelto.aviso,
          cargado: falta,
          precioOrigen: origen > 0 ? origen : null,
          faltanteId: l.id || null,
        });
      }
    }
    if (!agregadas) return { fila: null, agregadas: 0 };
    const cliente = clientesRef.current.get(String(clienteId));
    return { fila: { ...(base || filaVacia(cliente)), items }, agregadas };
  }, [resolverPrecio]);

  const cargarFaltanteDe = useCallback((clienteId) => {
    const { fila, agregadas } = aplicarCargaFaltante(filasRef.current, clienteId);
    if (!agregadas) {
      addToast('Ya está cargado todo lo que le faltaba.', 'info');
      return;
    }
    setFilas((prev) => ({ ...prev, [clienteId]: fila }));
    olvidarProblema(clienteId);
    marcarSucio(clienteId);
    const nombre = clientesRef.current.get(String(clienteId))?.nombre || 'el cliente';
    addToast(`Le cargué ${agregadas} paca(s) de lo que le faltaba a ${nombre}.`, 'success');
  }, [aplicarCargaFaltante, addToast, olvidarProblema, marcarSucio]);

  const cargarTodoFaltante = useCallback(async () => {
    const ids = [...faltantesRef.current.keys()];
    if (!ids.length) return;
    // Cuenta exacta ANTES de preguntar: un confirm que dice «14» y carga 9 es
    // peor que no preguntar.
    let total = 0;
    let cuantos = 0;
    for (const id of ids) {
      const { agregadas } = aplicarCargaFaltante(filasRef.current, id);
      if (agregadas > 0) { total += agregadas; cuantos += 1; }
    }
    if (!total) {
      addToast('Ya está cargado todo lo que faltaba.', 'info');
      return;
    }
    const ok = await confirm({
      title: `¿Cargar ${total} paca(s) al pedido?`,
      message: `Se le suma a ${cuantos} cliente(s) lo que les quedó faltando en repartos anteriores,`
        + ' sobre las líneas que ya tengan de esos mismos productos. Puedes quitarlo línea a línea con la ×.',
      confirmText: 'Sí, cargarlo',
      cancelText: 'Mejor no',
      variant: 'success',
    });
    if (!ok) return;
    setFilas((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const { fila, agregadas } = aplicarCargaFaltante(next, id);
        if (agregadas > 0) next[id] = fila;
      }
      return next;
    });
    for (const id of ids) marcarSucio(id);
    addToast(`Cargadas ${total} paca(s) a ${cuantos} cliente(s).`, 'success');
  }, [aplicarCargaFaltante, addToast, confirm, marcarSucio]);

  // ── Cuentas de la Fase 1 ──────────────────────────────────────────────────
  const pedidoPorClave = useMemo(() => {
    const m = new Map();
    for (const fila of Object.values(filas)) {
      for (const it of fila.items) {
        // Sólo cuentan las líneas que el envío VA a incluir.
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

  // QUEDAN DOS MOTIVOS, Y NINGUNO ES EL STOCK. Antes, pedir entre todos más
  // pacas de las que hay apagaba el botón, y la única salida era borrarle el
  // pedido a alguien. Eso es exactamente lo contrario de lo que hace falta.
  const impedimento = useMemo(() => {
    if (cargando) return 'Todavía se están cargando los datos.';
    if (resumen.numClientes === 0) return 'Todavía no hay ningún cliente con ítems completos.';
    return null;
  }, [cargando, resumen.numClientes]);

  const clientesVisibles = useMemo(() => {
    const q = normTxt(buscar);
    return clientes.filter((c) => {
      // Un cliente con ítems NUNCA se esconde: si desapareciera de la lista al
      // buscar otro nombre, se enviaría algo que ya no se ve en pantalla.
      if (filas[c.id] || problemas[String(c.id)]) return true;
      if (soloConItems) return false;
      // El contador-filtro respeta esa misma regla y por eso va DESPUÉS.
      if (soloConFaltante && !faltantesRef.current.has(String(c.id))) return false;
      if (!q) return true;
      return normTxt(c.nombre).includes(q) || normTxt(c.ciudad).includes(q);
    });
  }, [clientes, buscar, soloConItems, soloConFaltante, filas, problemas, selloFaltantes]);

  const clientesConFaltante = faltantesRef.current.size;
  const unidadesFaltantes = useMemo(() => {
    let n = 0;
    for (const info of faltantesRef.current.values()) n += info.unidades;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selloFaltantes]);

  // ── El dinero de la Fase 2 ────────────────────────────────────────────────
  // Los tres memos siguientes devuelven el MISMO objeto mientras se está en la
  // Fase 1. No es una optimización de manual: la Fase 2 sigue montada (oculta)
  // mientras se teclea en la Fase 1, y si estos objetos cambiaran de identidad
  // con cada tecla, los React.memo de todos los grupos de producto se caerían y
  // cada pulsación repintaría las dos pantallas enteras.
  const cachePrecios = useRef(new Map());
  const preciosPorAsignacion = useMemo(() => {
    if (fase !== 'reparto') return cachePrecios.current;
    const m = new Map();
    for (const [clienteId, fila] of Object.entries(filas)) {
      for (const it of fila.items) {
        if (!itemCompleto(it)) continue;
        const k = claveAsignacion(clienteId, it.referencia, it.calidad);
        if (m.has(k)) continue;
        m.set(k, {
          precio: precioDe(it),
          esPromocion: Boolean(it.esPromocion),
          origen: Number(it.precioOrigen) || 0,
          respetado: Boolean(it.respetaOrigen),
        });
      }
    }
    cachePrecios.current = m;
    return m;
  }, [filas, fase]);

  const cacheDescuentos = useRef(new Map());
  const descuentosPorCliente = useMemo(() => {
    if (fase !== 'reparto') return cacheDescuentos.current;
    const m = new Map();
    for (const [clienteId, fila] of Object.entries(filas)) {
      m.set(String(clienteId), {
        raw: parseMonto(fila.descuento),
        tipo: fila.tipo_descuento || 'valor_fijo',
      });
    }
    cacheDescuentos.current = m;
    return m;
  }, [filas, fase]);

  const cacheTotales = useRef(SIN_TOTALES);
  const totalesReparto = useMemo(() => {
    if (fase !== 'reparto') return cacheTotales.current;
    // `sinFaltante` entra en la cuenta: si no, el pie y el rótulo del botón
    // prometerían anotar faltantes que ella acaba de apagar con la casilla, y
    // el servidor escribiría menos de los que la pantalla dijo.
    const t = totalesDeReparto(filas, asignado, transporteGlobalNum, sinFaltante);
    cacheTotales.current = t;
    return t;
  }, [filas, asignado, transporteGlobalNum, fase, sinFaltante]);

  // ── Manejadores de la Fase 2 ──────────────────────────────────────────────
  const productosRef = useRef(SIN_PRODUCTOS);
  useEffect(() => { productosRef.current = reparto?.productos || SIN_PRODUCTOS; }, [reparto]);

  const productoDe = useCallback(
    (clave) => productosRef.current.find((p) => claveStock(p.referencia, p.calidad) === clave) || null,
    [],
  );

  const marcarTocado = useCallback((clave) => {
    setTocados((prev) => (prev.has(clave) ? prev : new Set(prev).add(clave)));
    // Tocar a mano un producto que ya estaba decidido lo saca del «listo»: la
    // decisión vuelve a estar en el aire y el contador tiene que decirlo.
    setListos((prev) => {
      if (!prev.has(clave)) return prev;
      const next = new Set(prev);
      next.delete(clave);
      return next;
    });
  }, []);

  /**
   * Apagar o encender el faltante de UNA línea, desde la celda «Queda falt.» de
   * la Fase 2. Marca al cliente como sucio para que el autoguardado lleve el
   * cambio al servidor: si la casilla sólo viviera en pantalla, un F5 antes de
   * crear las cotizaciones resucitaría el faltante que ella acababa de
   * descartar, y encima sin decírselo.
   */
  const marcarCuentaFaltante = useCallback((referencia, calidad, clienteId, cuenta) => {
    const k = claveAsignacion(clienteId, referencia, calidad);
    setSinFaltante((prev) => {
      if (cuenta === !prev.has(k)) return prev;
      const next = new Set(prev);
      if (cuenta) next.delete(k);
      else next.add(k);
      return next;
    });
    marcarSucio(clienteId);
  }, [marcarSucio]);

  const setCantidad = useCallback((referencia, calidad, clienteId, cantidad) => {
    const clave = claveStock(referencia, calidad);
    // De quién es la última celda que tocó en la Fase 2. Es el cliente al que
    // hay que devolverla resaltada al pulsar «Volver a los pedidos»; en un ref
    // porque esto pasa en CADA tecla y no puede provocar ni un render.
    ultimoClienteRef.current = clienteId;
    setAsignado((prev) => {
      const k = claveAsignacion(clienteId, referencia, calidad);
      const valor = Math.max(0, Math.round(Number(cantidad)) || 0);
      if ((prev.get(k) || 0) === valor) return prev;
      const m = new Map(prev);
      if (valor > 0) m.set(k, valor);
      else m.delete(k);
      return m;
    });
    marcarTocado(clave);
  }, [marcarTocado]);

  /** Aplica un Map cliente→cantidad a un producto entero, de una sola pasada. */
  const aplicarReparto = useCallback((producto, mapa) => {
    setAsignado((prev) => {
      const m = new Map(prev);
      for (const c of producto.clientes || []) {
        const k = claveAsignacion(c.cliente_id, producto.referencia, producto.calidad);
        const valor = Math.max(0, Math.round(Number(mapa.get(c.cliente_id) ?? mapa.get(String(c.cliente_id))) || 0));
        if (valor > 0) m.set(k, valor);
        else m.delete(k);
      }
      return m;
    });
  }, []);

  const aplicarCriterio = useCallback((clave, criterio) => {
    const p = productoDe(clave);
    if (!p) return;
    const lineas = (p.clientes || []).map((c) => ({
      cliente_id: c.cliente_id,
      pedida: c.pedida,
      faltante_abierto: c.faltante_abierto,
    }));
    const disponible = Math.max(0, numServidor(p.disponibles));
    const mapa = criterio === 'prorrata' ? aProrrata(lineas, disponible)
      : criterio === 'orden' ? porOrden(lineas, disponible)
      : cubrirFaltante(lineas, disponible);
    aplicarReparto(p, mapa);
    marcarTocado(clave);
  }, [productoDe, aplicarReparto, marcarTocado]);

  const vaciarProducto = useCallback((clave) => {
    const p = productoDe(clave);
    if (!p) return;
    aplicarReparto(p, new Map());
    marcarTocado(clave);
  }, [productoDe, aplicarReparto, marcarTocado]);

  const marcarListo = useCallback((clave, valor) => {
    setListos((prev) => {
      const next = new Set(prev);
      if (valor) next.add(clave);
      else next.delete(clave);
      return next;
    });
    // Al darlo por decidido deja de estar «cambiado»: ya lo revisó.
    if (valor) {
      setCambiados((prev) => {
        if (!prev.has(clave)) return prev;
        const next = new Set(prev);
        next.delete(clave);
        return next;
      });
    }
  }, []);

  const alternarAbierto = useCallback((clave) => {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }, []);

  const aceptarPropuestas = useCallback(() => {
    // «Repartir a prorrata los N que faltan» dice exactamente lo que hace, con
    // las cifras delante. La alternativa —marcar listos sin repartir— dejaría la
    // ronda decidida en cero sin que nadie lo hubiera decidido.
    // `porDecidir` y no la palabra prohibida del módulo —la que aquí dentro ya
    // significa pedido del portal, cotización y despacho por confirmar—: el
    // nombre de la variable termina siendo el texto del botón el día que alguien
    // lo pinte tal cual, y entonces la palabra vuelve a la pantalla.
    const porDecidir = productosRef.current.filter((p) => !listos.has(claveStock(p.referencia, p.calidad)));
    setAsignado((prev) => {
      const m = new Map(prev);
      for (const p of porDecidir) {
        const lineas = (p.clientes || []).map((c) => ({
          cliente_id: c.cliente_id, pedida: c.pedida, faltante_abierto: c.faltante_abierto,
        }));
        const mapa = aProrrata(lineas, Math.max(0, numServidor(p.disponibles)));
        for (const c of p.clientes || []) {
          const k = claveAsignacion(c.cliente_id, p.referencia, p.calidad);
          const valor = Math.max(0, Math.round(Number(mapa.get(c.cliente_id)) || 0));
          if (valor > 0) m.set(k, valor);
          else m.delete(k);
        }
      }
      return m;
    });
    setListos((prev) => {
      const next = new Set(prev);
      for (const p of porDecidir) next.add(claveStock(p.referencia, p.calidad));
      return next;
    });
    addToast(`Repartí a prorrata ${porDecidir.length} producto(s). Revísalo antes de crear.`, 'info');
  }, [listos, addToast]);

  // ── El paso entre fases ───────────────────────────────────────────────────
  /**
   * Arma la matriz pivotada con lo que hay en pantalla. Es el plan B de
   * `cerrar-pedidos`: si el servidor no contesta se cruza IGUAL, porque
   * bloquearla aquí la dejaría con la matriz entera tecleada y sin salida. La
   * franja ámbar de la Fase 2 dice con todas las letras que el inventario es el
   * de la última lectura buena.
   */
  const productosLocales = useCallback((mapaStock) => {
    const productos = new Map();
    for (const cliente of clientesRef.current.values()) {
      const fila = filasRef.current[cliente.id];
      if (!fila) continue;
      const info = faltantesRef.current.get(String(cliente.id));
      for (const it of fila.items) {
        if (!itemCompleto(it)) continue;
        const k = claveStock(it.referencia, it.calidad);
        let p = productos.get(k);
        if (!p) {
          p = {
            referencia: it.referencia,
            calidad: it.calidad,
            disponibles: mapaStock.get(k)?.disponibles ?? 0,
            pedido_total: 0,
            clientes: [],
          };
          productos.set(k, p);
        }
        const cant = cantidadDe(it);
        p.pedido_total += cant;
        // Un cliente no puede aparecer dos veces en el mismo producto: en la
        // Fase 2 serían dos celdas del mismo número y habría que fusionarlas a
        // mano. Se suman, igual que hace el servidor al normalizar las líneas.
        const previo = p.clientes.find((c) => String(c.cliente_id) === String(cliente.id));
        if (previo) {
          previo.pedida += cant;
          previo.cargada_faltante += Math.min(Number(it.cargado) || 0, cant);
          continue;
        }
        const linea = info?.lineas.find((l) => claveStock(l.referencia, l.calidad) === k) || null;
        p.clientes.push({
          cliente_id: cliente.id,
          cliente_nombre: cliente.nombre,
          ciudad: cliente.ciudad || '',
          pedida: cant,
          cargada_faltante: Math.min(Number(it.cargado) || 0, cant),
          precio_unitario: precioDe(it),
          tiene_promocion: Boolean(it.esPromocion),
          faltante_abierto: linea ? Number(linea.cantidad_abierta) || 0 : 0,
          precio_unitario_origen: linea ? numServidor(linea.precio_unitario_origen) : 0,
          faltante_desde: linea?.created_at || null,
          veces_aplazado: linea ? Number(linea.veces_aplazado) || 0 : 0,
          faltante_id: linea?.id || null,
        });
      }
    }
    return [...productos.values()];
  }, []);

  /** Le pega al producto del servidor lo que sólo sabe el libro de faltantes. */
  const enriquecer = useCallback((productos) => (productos || []).map((p) => ({
    ...p,
    clientes: (p.clientes || []).map((c) => {
      const info = faltantesRef.current.get(String(c.cliente_id));
      const linea = info?.lineas.find((l) => claveStock(l.referencia, l.calidad) === claveStock(p.referencia, p.calidad)) || null;
      return {
        ...c,
        faltante_abierto: Number(c.faltante_abierto) || (linea ? Number(linea.cantidad_abierta) || 0 : 0),
        precio_unitario_origen: numServidor(c.precio_unitario_origen) || (linea ? numServidor(linea.precio_unitario_origen) : 0),
        faltante_desde: c.faltante_desde || linea?.created_at || null,
        veces_aplazado: Number(c.veces_aplazado) || (linea ? Number(linea.veces_aplazado) || 0 : 0),
        faltante_id: c.faltante_id || linea?.id || null,
      };
    }),
  })), []);

  /**
   * Reconcilia lo ya repartido con la matriz nueva y precarga lo que alcanza.
   *
   * Todo producto con pedido ≤ disponible queda asignado AL 100% y nace
   * «listo», en verde. Los que no alcanzan nacen EN CERO, sin sugerencia: ella
   * reparte a dedo justamente cuando no alcanza, y precargarle un número la
   * obligaría a leer y desmentir cifras que no puso.
   */
  const prepararReparto = useCallback((productos, previos) => {
    const { asignaciones, ajustados: cambios } = reconciliarReparto(asignadoRef.current, productos);
    // Los productos de la vez anterior CON SU DISPONIBLE DE ENTONCES: es lo que
    // permite saber si el inventario subió o bajó, y no sólo si el producto ya
    // estaba. Antes esto era un Set de claves y por eso el caso de abajo no se
    // podía ni detectar.
    const yaVistos = new Map((previos || []).map((p) => [claveStock(p.referencia, p.calidad), p]));
    const yaAvisados = new Set(cambios.map((a) => claveStock(a.referencia, a.calidad)));
    const nuevas = new Map(asignaciones);
    const listosNuevos = new Set();
    for (const p of productos) {
      const clave = claveStock(p.referencia, p.calidad);
      const pedido = (p.clientes || []).reduce((s, c) => s + Math.max(0, Number(c.pedida) || 0), 0);
      const disponible = Math.max(0, numServidor(p.disponibles));
      const previo = yaVistos.get(clave);
      if (previo) {
        // ── EL DISPONIBLE SUBIÓ Y AHORA SÍ ALCANZA ────────────────────────
        // Aquí había un `continue` seco: el producto que ya estaba conservaba su
        // reparto pasara lo que pasara con el inventario. El diseño manda lo
        // contrario, y el caso es real y frecuente: llegó un contenedor, o se
        // rechazó una cotización y `liberarPacas` devolvió pacas. Tal como
        // estaba, ella pulsaba «Volver a leer», un producto pasaba de 6 a 60
        // pacas disponibles y se quedaba repartido con 6, sin chip, sin franja y
        // sin una sola señal de que ahora alcanzaba para todos. El fallo más
        // caro de esta pantalla es justo ese: el que no se ve.
        //
        // Sólo se vuelve a disparar el autorreparto cuando se cumplen las tres:
        // el disponible SUBIÓ, ahora alcanza para todo lo pedido, y todavía hay
        // alguien corto. Si ella repartió de menos a propósito sobre un
        // inventario que no se movió, no se le toca nada: retener pacas es una
        // decisión de negocio legítima y pisarla sería el otro fallo silencioso.
        const disponibleAntes = Math.max(0, numServidor(previo.disponibles));
        const repartido = (p.clientes || []).reduce(
          (s, c) => s + Math.max(0, Number(nuevas.get(claveAsignacion(c.cliente_id, p.referencia, p.calidad))) || 0), 0,
        );
        const revive = disponible > disponibleAntes && pedido > 0 && pedido <= disponible && repartido < pedido;
        if (!revive) continue;   // ya estaba: su reparto lo decidió ella
        for (const c of p.clientes || []) {
          nuevas.set(claveAsignacion(c.cliente_id, p.referencia, p.calidad), Math.max(0, Number(c.pedida) || 0));
        }
        // Entra en la MISMA lista que alimenta la franja de reconciliación y el
        // chip «N producto(s) para revisar», y pierde el «listo» por el mismo
        // camino que los demás reajustes (más abajo, `next.delete`). No se marca
        // listo solo: le acabo de cambiar el reparto y tiene que revisarlo.
        // Se comprueba `yaAvisados` porque `reconciliarReparto` pudo haberlo
        // apuntado ya —recorte por prorrata— y dos entradas con la misma
        // referencia y calidad son dos <span> con la misma key en la franja.
        if (!yaAvisados.has(clave)) {
          yaAvisados.add(clave);
          cambios.push({ referencia: p.referencia, calidad: p.calidad, antes: repartido, ahora: pedido });
        }
        continue;
      }
      if (pedido > disponible || pedido === 0) continue;   // lo escaso llega en cero
      for (const c of p.clientes || []) {
        nuevas.set(claveAsignacion(c.cliente_id, p.referencia, p.calidad), Math.max(0, Number(c.pedida) || 0));
      }
      listosNuevos.add(clave);
    }
    setAsignado(nuevas);
    setListos((prev) => {
      const next = new Set([...prev].filter((k) => productos.some((p) => claveStock(p.referencia, p.calidad) === k)));
      for (const k of listosNuevos) next.add(k);
      // Un producto que se reajustó pierde el «listo»: la decisión que ella tomó
      // ya no es la que está en pantalla.
      for (const a of cambios) next.delete(claveStock(a.referencia, a.calidad));
      return next;
    });
    setCambiados(new Set(cambios.map((a) => claveStock(a.referencia, a.calidad))));
    setAjustados(cambios);
    setTocados(new Set());
  }, []);

  const irAlReparto = useCallback(async () => {
    if (cruzando || enviando) return;
    if (impedimento) { addToast(impedimento, 'error'); return; }

    // Las líneas a medias no bloquean, pero SÍ se avisan, y con los nombres:
    // un número sin nombre no es accionable y esa línea puede hacer desaparecer
    // un producto entero del reparto.
    if (resumen.lineasIncompletas > 0) {
      const nombres = [];
      for (const [clienteId, fila] of Object.entries(filasRef.current)) {
        const n = fila.items.filter((it) => itemTieneAlgo(it) && !itemCompleto(it)).length;
        if (n > 0) nombres.push(`${clientesRef.current.get(String(clienteId))?.nombre || 'Cliente'} (${n})`);
      }
      const ok = await confirm({
        title: `Hay ${resumen.lineasIncompletas} línea(s) sin terminar`,
        message: `Les falta la calidad o el precio, así que no pasan al reparto: ${nombres.slice(0, 6).join(' y ')}`
          + `${nombres.length > 6 ? ` y ${nombres.length - 6} más` : ''}.`,
        confirmText: 'Seguir al reparto',
        cancelText: 'Volver a revisar',
        variant: 'info',
      });
      if (!ok) return;
    }

    setCruzando(true);
    // La lista de productos de la vez anterior, para saber cuáles son NUEVOS y
    // se pueden precargar sin pisar lo que ella ya decidió. Se lee del ref y no
    // del estado a propósito: `reparto` en las dependencias haría que este
    // manejador cambiara de identidad al releer el inventario, y con él se
    // repintaría la Fase 1 entera.
    const previos = productosRef.current.length ? productosRef.current : null;
    try {
      // La relectura del inventario es obligatoria: todo el control de stock de
      // esta pantalla es de cliente sobre UNA lectura, y el flujo de dos fases
      // alarga la ventana entre leer y consumir de minutos a media hora larga.
      const fresco = await cargarStock(tablasRef.current.listaPrecios);

      let productos = null;
      let leidoEn = fresco.leidoEn;
      let aviso = null;
      let numero = repartoRef.current.numero;

      try {
        const id = await asegurarReparto();
        if (!id) throw new Error('No se pudo abrir el reparto en el servidor');
        const cuerpo = {
          tasa: parseMonto(tasa),
          transporte_unitario: transporteGlobalNum,
          validez_dias: Math.max(1, Math.round(parseMonto(validezDias)) || 15),
          clientes: Object.keys(filasRef.current)
            .map((clienteId) => ({ cliente_id: Number(clienteId) || clienteId, lineas: lineasDeCliente(clienteId) }))
            .filter((c) => c.lineas.length),
        };
        const r = await matrizApi.cerrarPedidos(id, cuerpo);
        productos = enriquecer(r?.productos);
        leidoEn = r?.stock_leido_en || leidoEn;
        numero = r?.reparto?.numero || numero;
        if (r?.reparto?.numero) repartoRef.current.numero = r.reparto.numero;
        repartoRef.current.caido = false;
        setEstadoGuardado('guardado en el servidor');
      } catch (err) {
        // SE CRUZA IGUAL. Bloquear aquí la dejaría con la matriz entera tecleada
        // y sin salida, que es peor que repartir sobre una lectura de hace un
        // rato sabiendo que lo es.
        console.error('[Matriz] cerrar-pedidos', err);
        repartoRef.current.caido = true;
        productos = productosLocales(fresco.mapa);
        aviso = fresco.ok
          ? 'No pude guardar el reparto en el servidor. Estás repartiendo sobre el inventario que acabo de leer,'
            + ' pero las cotizaciones se van a crear por la vía de siempre y NO se van a anotar los faltantes.'
          : 'No pude confirmar el inventario ni guardar el reparto en el servidor. Lo que ves es la última lectura buena.'
            + ' Si otra persona apartó pacas, al crear las cotizaciones puede faltar.';
      }

      if (!fresco.ok && !aviso) {
        aviso = 'No pude confirmar el inventario. Lo que ves es la última lectura buena.'
          + ' Si otra persona apartó pacas, al crear las cotizaciones puede faltar.';
      }

      setReparto({ id: repartoRef.current.id, numero, productos, stock_leido_en: leidoEn, aviso });
      prepararReparto(productos, previos);
      // A qué altura deja la tabla de la Fase 1, para poder devolverla ahí
      // mismo cuando vuelva. La Fase 2 sí empieza arriba: es una tabla nueva
      // con otro orden y volver a su cabecera es lo correcto.
      scrollPedidosRef.current = window.scrollY;
      setFase('reparto');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setCruzando(false);
    }
  }, [
    cruzando, enviando, impedimento, addToast, confirm, resumen.lineasIncompletas,
    cargarStock, asegurarReparto, lineasDeCliente, enriquecer, productosLocales, prepararReparto,
    tasa, transporteGlobalNum, validezDias,
  ]);

  const volverAPedidos = useCallback(async (clienteId) => {
    // Sin confirmación: volver no destruye nada —`filas` y `asignado` son dos
    // estados independientes y conmutar `fase` no limpia ninguno— y pedirle
    // permiso cada vez la enseñaría a no leer los diálogos.
    setFase('pedidos');

    // ── SE VUELVE DONDE ESTABA, NO AL PRINCIPIO ─────────────────────────────
    // Aquí había un `scrollTo({ top: 0 })`, que es justo lo contrario de lo que
    // pide el diseño: devolvía la tabla a la cabecera con doscientos clientes
    // por delante y el dedo puesto en el que ella estaba mirando. Se recupera la
    // altura que tenía la Fase 1 y se resalta dos segundos el cliente del que
    // venía —el de la última celda que tocó, o el que dejó marcado en la cinta—,
    // que es el equivalente del `data-cliente-fila` + `bg-secondary/10` que la
    // Fase 2 ya usa para su cinta de clientes.
    const quien = clienteId ?? ultimoClienteRef.current;
    if (quien != null) {
      setClienteResaltadoPedidos(String(quien));
      if (resaltadoTimerRef.current) clearTimeout(resaltadoTimerRef.current);
      // Dos segundos: lo justo para que el ojo lo encuentre sin dejar la fila
      // pintada para siempre, que se leería como un estado del cliente.
      resaltadoTimerRef.current = setTimeout(() => setClienteResaltadoPedidos(null), 2000);
    }
    // El scroll se devuelve en el turno siguiente: la Fase 1 venía con `hidden`
    // y hasta que React no la vuelve a mostrar el documento no tiene altura a la
    // que volver, así que un scrollTo inmediato se quedaría corto.
    const altura = scrollPedidosRef.current;
    window.setTimeout(() => window.scrollTo({ top: altura, behavior: 'smooth' }), 0);

    if (!repartoRef.current.id || repartoRef.current.caido) return;
    try {
      await matrizApi.volver(repartoRef.current.id);
    } catch (err) {
      // Que el servidor no baje el estado no puede impedirle seguir capturando:
      // el reparto que ya hizo se conserva en pantalla y se vuelve a mandar
      // entero al cruzar otra vez.
      console.error('[Matriz] volver', err);
    }
  }, []);

  const releerInventario = useCallback(async () => {
    if (releyendo) return;
    setReleyendo(true);
    try {
      const fresco = await cargarStock(tablasRef.current.listaPrecios);
      // Los de ANTES, con su disponible de antes, se guardan aparte. Aquí se
      // pasaba `prepararReparto(productos, productos)` —la lista nueva como si
      // fuera la vieja—, así que la comparación de disponibles no podía ver
      // ningún cambio y «Volver a leer» era justamente el camino por el que un
      // producto que pasó de 6 a 60 pacas se quedaba repartido con 6.
      const previos = productosRef.current;
      const productos = previos.map((p) => ({
        ...p,
        disponibles: fresco.mapa.get(claveStock(p.referencia, p.calidad))?.disponibles ?? 0,
      }));
      setReparto((prev) => (prev ? {
        ...prev,
        productos,
        stock_leido_en: fresco.leidoEn,
        aviso: fresco.ok
          ? null
          : 'No pude confirmar el inventario. Lo que ves es la última lectura buena.',
      } : prev));
      // Conserva lo repartido, recorta si ya no cabe y vuelve a repartir solo lo
      // que ahora alcanza porque llegó mercancía.
      prepararReparto(productos, previos);
      addToast(fresco.ok ? 'Inventario releído.' : 'No pude leer el inventario.', fresco.ok ? 'success' : 'error');
    } finally {
      setReleyendo(false);
    }
  }, [releyendo, cargarStock, prepararReparto, addToast]);

  // ── Vaciar la pantalla ────────────────────────────────────────────────────
  // Vacía TAMBIÉN el borrador y el reparto. Si no, después de crear las
  // cotizaciones la matriz recién guardada seguiría en el navegador y al volver
  // a entrar la pantalla la ofrecería como trabajo a medias: se crearían dos
  // veces las mismas cotizaciones y se apartarían dos veces las mismas pacas.
  const limpiarTodo = useCallback(() => {
    setFilas({});
    setProblemas({});
    setProblemasSueltos([]);
    cacheAvisos.current.clear();
    setBorradorRecuperado(null);
    olvidarBorrador(claveBorrador(usuario?.id));
    setFase('pedidos');
    setReparto(null);
    setAsignado(new Map());
    setListos(new Set());
    setCambiados(new Set());
    setTocados(new Set());
    setAbiertos(new Set());
    setAjustados([]);
    // Las casillas «esto no queda debiendo» también se vacían: son de ESTA
    // ronda. Si sobrevivieran, la ronda siguiente nacería con faltantes
    // apagados que nadie apagó, y esos no se ven hasta que el cliente llama.
    setSinFaltante(new Set());
    repartoRef.current = { id: null, numero: null, creando: null, caido: repartoRef.current.caido };
  }, [usuario?.id]);

  const descartarBorrador = useCallback(async () => {
    // El «Empezar de cero» sí toca el servidor cuando hay un reparto abierto:
    // dejarlo vivo allí haría que mañana la pantalla volviera a recuperar lo que
    // ella acaba de tirar.
    const id = repartoRef.current.id;
    limpiarTodo();
    addToast('Listo, empezamos de cero.', 'info');
    if (!id) return;
    try {
      await matrizApi.descartar(id, { motivo: 'La usuaria empezó de cero desde la Matriz' });
    } catch (err) {
      // ESTE FALLO NO SE TRAGA, Y EL SERVIDOR ESCRIBE EL TEXTO. Aquí sólo había
      // un console.error, así que el único rastro de que la ronda NO se
      // descartó de verdad quedaba en la consola: la pantalla ya se había
      // vaciado y el toast verde ya había dicho «empezamos de cero». Al día
      // siguiente la pantalla recuperaba del servidor la ronda que ella acaba de
      // tirar y nadie sabía de dónde había salido. El caso llega solo: si el
      // `volver` de antes no aterrizó, allá sigue en el paso 2 y el servidor
      // responde 409 con una explicación escrita para ella («Este reparto ya
      // está en el paso 2, repartiendo…»), que es justo la que hay que enseñar.
      console.error('[Matriz] descartar', err);
      addToast(
        `Vacié la pantalla, pero el servidor no dio la ronda por descartada: ${err.message}`,
        'error',
        9000,
      );
    }
  }, [limpiarTodo, addToast]);

  // ── Borrador (1/3): se lee al abrir, UNA sola vez ───────────────────────
  // Se restaura sin preguntar. Un diálogo "¿recuperar?" antes de enseñar nada
  // obliga a decidir a ciegas sobre un trabajo que todavía no se ve; se enseña
  // primero, se avisa con el toast y se deja "Empezar de cero" a la vista.
  // OJO CON EL ORDEN: si el servidor devolvió un reparto abierto con líneas,
  // manda el servidor y este efecto no pisa nada. Por eso mira `restauradoRef`,
  // que la carga inicial pone en true justo después de volcar lo del servidor.
  useEffect(() => {
    if (cargando) return undefined;
    if (restauradoRef.current && Object.keys(filasRef.current).length) return undefined;
    const guardado = leerBorrador(claveBorrador(usuario?.id));
    if (tieneAlgo(guardado)) {
      setFilas(guardado.filas);
      // Los datos de arriba sólo se pisan si el borrador traía algo escrito.
      if (guardado.tasa) setTasa(guardado.tasa);
      if (guardado.transporte_global) setTransporteGlobal(guardado.transporte_global);
      if (guardado.validez_dias) setValidezDias(guardado.validez_dias);

      const cuantos = Object.keys(guardado.filas).length;
      const cuando = selloBorrador(guardado.guardado_en);
      setBorradorRecuperado({ cuantos, cuando, origen: 'navegador' });
      addToast(
        `Recuperé la matriz a medias${cuando ? ` del ${cuando}` : ''}: ${cuantos} cliente(s) con líneas.`
        + ' Si no la querías, pulsa "Empezar de cero" arriba.',
        'info',
        9000,
      );
    }
    restauradoRef.current = true;
    return undefined;
    // Sólo cuando termina la carga inicial, y una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando]);

  // ── Borrador (2/3): se escribe con un segundo de retardo ────────────────
  // Un segundo, y no en cada tecla: serializar el objeto entero de filas por
  // pulsación en una matriz de cientos de clientes es trabajo real en el hilo
  // que está pintando la tabla.
  useEffect(() => {
    const foto = {
      v: 1,
      guardado_en: new Date().toISOString(),
      filas,
      tasa,
      transporte_global: transporteGlobal,
      validez_dias: validezDias,
    };
    fotoRef.current = foto;
    if (!restauradoRef.current) return undefined;
    const clave = claveBorrador(usuario?.id);
    const t = setTimeout(() => {
      if (tieneAlgo(foto)) escribirBorrador(clave, foto);
      else olvidarBorrador(clave);
    }, 1000);
    return () => clearTimeout(t);
  }, [filas, tasa, transporteGlobal, validezDias, usuario?.id]);

  // ── Borrador (3/3): y también al cerrar ─────────────────────────────────
  // beforeunload cubre el cierre y el F5; la limpieza del efecto cubre el otro
  // camino, que es irse a otra pantalla de la aplicación —una navegación de
  // React Router NO dispara beforeunload—.
  useEffect(() => {
    const guardarYa = () => {
      if (!restauradoRef.current) return;
      const clave = claveBorrador(usuario?.id);
      if (tieneAlgo(fotoRef.current)) escribirBorrador(clave, fotoRef.current);
      else olvidarBorrador(clave);
    };
    window.addEventListener('beforeunload', guardarYa);
    return () => {
      window.removeEventListener('beforeunload', guardarYa);
      guardarYa();
    };
  }, [usuario?.id]);

  // ── EL PUNTO DE NO RETORNO ────────────────────────────────────────────────
  // «Repartir lo que hay» es reversible las veces que quiera. Esto no: aquí se
  // apartan pacas, se crean documentos y se escribe el libro de faltantes. Por
  // eso es el único con confirmación de peso, y por eso la confirmación dice los
  // NOMBRES en vez de un número.
  const crearCotizaciones = useCallback(async () => {
    if (enviando) return;
    const productos = productosRef.current;
    if (!productos.length) { addToast('No hay nada que repartir.', 'error'); return; }

    const t = totalesReparto;
    if (t.unidades <= 0 && t.faltando <= 0) {
      addToast('No hay nada repartido ni nada que anotar como faltante.', 'error');
      return;
    }

    // Los que se quedan faltando, con nombre y cifra, ordenados por lo que más
    // les falta. Es lo que va en el diálogo: un número sin nombre no es
    // accionable y esta es la última pantalla antes de que salga el documento.
    const conFaltante = [];
    for (const c of clientes) {
      const suyo = t.clientes.get(c.id) || t.clientes.get(String(c.id));
      if (suyo && suyo.faltando > 0) conFaltante.push({ nombre: c.nombre, cuantas: suyo.faltando });
    }
    conFaltante.sort((a, b) => b.cuantas - a.cuantas);
    const listaNombres = conFaltante.slice(0, 5).map((x) => `${x.nombre} (${x.cuantas})`).join(', ')
      + (conFaltante.length > 5 ? ` y ${conFaltante.length - 5} más` : '');

    const hayFaltantes = t.faltando > 0;
    const ok = await confirm({
      title: hayFaltantes
        ? `A ${t.clientesConFaltante} cliente(s) les vas a cotizar menos de lo que pidieron`
        : `¿Crear ${t.numClientes} cotización(es)?`,
      message:
        `Se crean ${t.numClientes} cotización(es) con ${t.unidades} paca(s) apartadas por ${formatCOP(t.total)}.`
        + ' Cada cotización sale SOLO con lo que le repartiste.'
        + (hayFaltantes
          ? ` Quedan anotadas ${t.faltando} paca(s) faltando a ${listaNombres}.`
            + ' Ojo: eso no le aparta nada — esas pacas todavía no existen.'
          : '')
        + (repartoRef.current.caido
          ? ' AVISO: el servidor del reparto no respondió, así que las cotizaciones se crean por la vía de siempre'
            + ' y los faltantes NO se van a anotar en el libro.'
          : ''),
      confirmText: hayFaltantes ? 'Sí, crear y anotar los faltantes' : 'Sí, crear',
      cancelText: 'Volver a repartir',
      variant: hayFaltantes ? 'warning' : 'success',
    });
    if (!ok) return;

    // ── ¿Damos por cerrado el resto? ─────────────────────────────────────────
    // Cuando alguien pidió MENOS de lo que se le venía debiendo y se le entregó
    // todo lo que pidió, el libro se queda con un resto abierto que quizá ya no
    // tiene sentido. Se pregunta aparte y en un diálogo propio: la respuesta
    // afirmativa va a `cantidad_anulada` y no a `cantidad_saldada` —no se le
    // entregó, se le perdonó— y mezclarlas corrompe el libro. Por defecto, NO.
    const cierres = [];
    if (!repartoRef.current.caido) {
      const candidatos = [];
      for (const p of productos) {
        for (const c of p.clientes || []) {
          const faltaba = Number(c.faltante_abierto) || 0;
          if (faltaba <= 0 || !c.faltante_id) continue;
          const pedida = Math.max(0, Number(c.pedida) || 0);
          const dado = Math.max(0, Number(asignado.get(claveAsignacion(c.cliente_id, p.referencia, p.calidad))) || 0);
          if (dado < pedida) continue;             // sigue faltándole de esta ronda
          const abono = Math.min(dado, Math.max(0, Number(c.cargada_faltante) || 0));
          const resto = Math.max(0, faltaba - abono);
          if (resto <= 0) continue;
          candidatos.push({
            faltante_id: c.faltante_id,
            cantidad: resto,
            nombre: c.cliente_nombre,
            producto: `${p.referencia} / ${p.calidad || 'sin calidad'}`,
            pedida, faltaba,
          });
        }
      }
      if (candidatos.length) {
        const detalle = candidatos.slice(0, 4)
          .map((x) => `${x.nombre} pidió ${x.pedida} y le faltaban ${x.faltaba} de ${x.producto} (quedan ${x.cantidad})`)
          .join('; ');
        const cerrar = await confirm({
          title: '¿Damos por cerrado lo que sobra del faltante?',
          message: `${detalle}${candidatos.length > 4 ? ` y ${candidatos.length - 4} caso(s) más` : ''}.`
            + ' Si dices que sí, ese resto se da de baja como perdonado (no como entregado) y deja de aparecer.'
            + ' Si dices que no, se le sigue debiendo.',
          confirmText: 'Sí, dar por cerrado el resto',
          cancelText: 'No, que sigan faltando',
          variant: 'info',
        });
        if (cerrar) {
          for (const x of candidatos) {
            cierres.push({ faltante_id: x.faltante_id, cantidad: x.cantidad, motivo: 'Cerrado al repartir: pidió menos de lo que se le debía' });
          }
        }
      }
    }

    setEnviando(true);
    setProblemas({});
    setProblemasSueltos([]);
    try {
      // La proyección: `filas` con las cantidades REPARTIDAS. De aquí sale todo
      // el dinero, pasando por la `totalesFila` de siempre.
      //
      // TODO ESTO SE LEE DE LOS REFS ESPEJO, NO DEL ESTADO, Y NO ES CAPRICHO. Si
      // `filas`, la tasa, el transporte o la validez estuvieran en las
      // dependencias de este useCallback, `onCrear` cambiaría de identidad con
      // CADA TECLA de la Fase 1 —cada letra de un nombre, cada dígito de una
      // cantidad, cada cifra de la tasa— y con ella se caería el React.memo de la
      // Fase 2 entera, que sigue montada y oculta detrás. El resultado es una
      // pantalla que se vuelve melaza sin que nada falle y sin nada que culpar.
      // Los refs se actualizan en un efecto, así que aquí siempre traen lo
      // último tecleado: se leen en el clic, no en el render.
      const datos = datosRef.current;
      const proyeccion = proyectarFilas(filasRef.current, asignado);
      const validez = Math.max(1, Math.round(parseMonto(datos.validezDias)) || 15);
      const tasaNum = parseMonto(datos.tasa);
      const transporteNum = parseMonto(datos.transporteGlobal);

      const metaDeCliente = (cliente) => {
        const fila = proyeccion[cliente.id] || proyeccion[String(cliente.id)];
        if (!fila) return null;
        const cuentas = totalesFila(fila, transporteNum);
        const entrega = entregaDeCliente(cliente);
        return { cuentas, entrega, fila };
      };

      if (repartoRef.current.id && !repartoRef.current.caido) {
        const asignaciones = [];
        for (const p of productos) {
          for (const c of p.clientes || []) {
            const k = claveAsignacion(c.cliente_id, p.referencia, p.calidad);
            const cantidad = Math.max(0, Number(asignado.get(k)) || 0);
            const info = preciosPorAsignacion.get(k);
            asignaciones.push({
              cliente_id: c.cliente_id,
              referencia: p.referencia,
              calidad: p.calidad,
              cantidad_repartida: cantidad,
              precio_unitario: info ? info.precio : numServidor(c.precio_unitario),
              respeta_precio_origen: Boolean(info?.respetado),
              // Iba `true` fijo y por eso la casilla de la Fase 2 no llegaba
              // nunca al servidor: el backend respeta `cuenta_faltante` desde el
              // principio, y mandarle siempre `true` era anotar como faltante
              // hasta lo que ella acababa de descartar a mano. Se lee del ref, no
              // del estado, para no meter otra dependencia en este useCallback.
              cuenta_faltante: !sinFaltanteRef.current.has(k),
            });
          }
        }

        const clientesMeta = [];
        for (const cliente of clientes) {
          const m = metaDeCliente(cliente);
          if (!m) continue;
          clientesMeta.push({
            cliente_id: cliente.id,
            // EL DESCUENTO VIAJA COMO MONTO YA CALCULADO SOBRE LO REPARTIDO, no
            // como porcentaje ni sobre lo pedido. El servidor no lo recalcula:
            // hacerlo lo cobraría dos veces. Es la misma regla de /masiva.
            descuento: m.cuentas.descuento,
            tipo_descuento: m.fila.tipo_descuento || 'valor_fijo',
            transporte_unitario: m.cuentas.transporteUnitario,
            tipo_transporte: m.fila.tipo_transporte?.trim() || null,
            destinatario: m.entrega.destinatario || null,
            direccion_entrega: m.entrega.direccion_entrega || null,
            ciudad_entrega: m.entrega.ciudad_entrega || null,
            celular: m.entrega.celular || null,
          });
        }

        const r = await matrizApi.repartir(repartoRef.current.id, {
          tasa: tasaNum > 0 ? tasaNum : 1,
          transporte_unitario: transporteNum,
          validez_dias: validez,
          asignaciones,
          cierres_faltante: cierres,
          clientes_meta: clientesMeta,
        });

        const creadas = Array.isArray(r?.creadas) ? r.creadas : [];
        addToast(
          `${r?.total_cotizaciones ?? creadas.length} cotización(es) · ${r?.total_unidades ?? t.unidades} paca(s) apartadas`
          + (r?.total_faltante ? ` · ${r.total_faltante} faltante(s) anotado(s)` : ''),
          'success',
        );
        setUltimoEnvio({
          cuantas: r?.total_cotizaciones ?? creadas.length,
          unidades: r?.total_unidades ?? t.unidades,
          total: t.total,
          faltantes: r?.total_faltante ?? t.faltando,
          numero: r?.reparto?.numero || repartoRef.current.numero || null,
        });
        limpiarTodo();
        await cargarFaltantes();
      } else {
        // ── PLAN B: el servidor del reparto no está ───────────────────────────
        // Se crean las cotizaciones por la vía de siempre con lo REPARTIDO (no
        // con lo pedido), que además nunca se pasa del stock y por tanto no
        // puede toparse con el «todo o nada» de /masiva. Lo que se pierde son
        // los faltantes, y eso ya se dijo en el confirm con todas las letras.
        const cotizaciones = [];
        for (const cliente of clientes) {
          const m = metaDeCliente(cliente);
          if (!m || !m.cuentas.validos.length) continue;
          cotizaciones.push({
            cliente_id: cliente.id,
            vendedor_id: usuario?.id ?? null,
            validez_dias: validez,
            tasa: tasaNum > 0 ? tasaNum : 1,
            notas: null,
            descuento: m.cuentas.descuento,
            tipo_descuento: m.fila.tipo_descuento || 'valor_fijo',
            transporte_unitario: m.cuentas.transporteUnitario,
            tipo_transporte: m.fila.tipo_transporte?.trim() || null,
            destinatario: m.entrega.destinatario || null,
            direccion_entrega: m.entrega.direccion_entrega || null,
            ciudad_entrega: m.entrega.ciudad_entrega || null,
            celular: m.entrega.celular || null,
            detalles: m.cuentas.validos.map((it) => ({
              referencia: it.referencia,
              calidad: it.calidad,
              cantidad: cantidadDe(it),
              precio_unitario: precioDe(it),
              subtotal: cantidadDe(it) * precioDe(it),
              tiene_promocion: Boolean(it.esPromocion),
            })),
          });
        }
        if (!cotizaciones.length) { addToast('No hay nada que crear: no le repartiste nada a nadie.', 'error'); return; }
        const respuesta = await cotizacionesApi.crearMasiva({
          vendedor_id: usuario?.id ?? null,
          validez_dias: validez,
          tasa: tasaNum > 0 ? tasaNum : 1,
          transporte_unitario: transporteNum,
          cotizaciones,
        });
        const creadas = Array.isArray(respuesta?.creadas) ? respuesta.creadas
          : Array.isArray(respuesta?.cotizaciones) ? respuesta.cotizaciones
          : Array.isArray(respuesta) ? respuesta
          : [];
        addToast(
          `${creadas.length || cotizaciones.length} cotización(es) creada(s) · ${t.unidades} paca(s) apartadas.`
          + ' Los faltantes NO quedaron anotados: el servidor del reparto no respondió.',
          'success',
        );
        setUltimoEnvio({
          cuantas: creadas.length || cotizaciones.length,
          unidades: t.unidades,
          total: t.total,
          faltantes: 0,
          numero: null,
        });
        limpiarTodo();
      }

      // El stock cambió: lo que se acaba de apartar ya no está disponible.
      const stockFresco = await cargarStock(tablasRef.current.listaPrecios);
      if (!stockFresco.ok) {
        setAvisoCarga('No se pudo releer el stock después de guardar: lo que ves puede incluir pacas que acabas de apartar. Recarga la pantalla antes de crear más cotizaciones.');
      }
    } catch (err) {
      // 409: alguien (o ella misma en otra pestaña, o un reintento tras un
      // timeout) ya cerró este reparto. No se reintenta NADA: el servidor no
      // escribió dos veces y la pantalla tiene que dejar de creerse dueña de un
      // reparto que ya no existe.
      if (err?.status === 409) {
        setProblemasSueltos([err.message || 'Este reparto ya se cerró. Recarga la pantalla.']);
        addToast('Este reparto ya se cerró. Recarga la pantalla.', 'error');
        return;
      }
      const detalle = err?.datos?.problemas;
      if (Array.isArray(detalle) && detalle.length) {
        const porCliente = {};
        const sueltos = [];
        for (const p of detalle) {
          const mensaje = typeof p === 'string'
            ? p
            : (p?.mensaje || p?.error || p?.detalle || p?.motivo || 'No se pudo crear esta cotización.');
          const id = typeof p === 'string' ? '' : String(p?.cliente_id ?? p?.clienteId ?? p?.id ?? '');
          // Con cliente identificado el mensaje va A SU FILA (y a su tarjeta de
          // la cinta); sólo lo que no se puede atribuir a nadie sube arriba.
          if (id) (porCliente[id] = porCliente[id] || []).push(mensaje);
          else sueltos.push(mensaje);
        }
        setProblemas(porCliente);
        setProblemasSueltos(sueltos);
        const marcados = Object.keys(porCliente).length;
        addToast(
          marcados
            ? `No se creó nada. Hay ${detalle.length} problema(s); revisa las ${marcados} fila(s) marcadas en rojo.`
            : `No se creó nada: ${err.message}`,
          'error',
        );
      } else {
        addToast(err.message, 'error');
      }
    } finally {
      setEnviando(false);
    }
    // OJO CON ESTA LISTA: ES LA DE UNA PROP DE UN React.memo QUE SIGUE MONTADO.
    // `onCrear` baja a la Fase 2, que no se desmonta al volver a los pedidos, así
    // que cada dependencia que cambie mientras ella teclea en la Fase 1 le tira
    // el memo y repinta la fase entera —barra, cinta, cabecera, pie y los veinte
    // productos— en cada pulsación. Por eso NO están aquí `filas`, `tasa`,
    // `transporteGlobal` ni `validezDias`, que cambian con cada letra: se leen de
    // `filasRef` y `datosRef` DENTRO de la función, en el momento del clic, que
    // además es cuando de verdad importan. `asignado` sí está, y no molesta:
    // sólo cambia tecleando en la Fase 2, que es justo cuando la Fase 2 tiene
    // que repintarse de todas formas.
  }, [
    enviando, totalesReparto, clientes, confirm, addToast, asignado,
    preciosPorAsignacion, usuario?.id, limpiarTodo, cargarStock, cargarFaltantes,
  ]);

  // La matriz en Excel, pero SÓLO si se pide. Se relee del servidor para que
  // salga con lo recién guardado, no con el stock de cuando se abrió.
  const descargarMatriz = useCallback(async () => {
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
  }, [generandoMatriz, addToast]);

  return (
    <Layout
      title="Matriz"
      subtitle={
        fase === 'reparto'
          ? 'Fase 2 de 2 — reparte lo que hay. Lo que no alcance queda como faltante del cliente.'
          : 'Fase 1 de 2 — anota lo que pidió cada cliente, aunque no alcance. Lo repartes en el paso 2.'
      }
      /* El reparto pide pantalla completa; los pedidos no. Repartir es teclear
         de arriba abajo mirando una cabecera que no se puede ir, y con el
         scroll de la página encima había que rodar dos ruedas para llegar al
         mismo producto. La captura, en cambio, es una lista larga que se lee
         como cualquier otra pantalla de la aplicación. */
      pantallaCompleta={fase === 'reparto'}
    >
      {/* LAS DOS FASES SE MONTAN A LA VEZ. La que no está activa se oculta con
          `hidden`, NO se desmonta: desmontar y remontar cientos de <tbody> con
          sus <select> en cada ida y vuelta es un congelón perceptible, y el
          diseño promete que volver es gratis. Lo que lo hace sostenible es que
          las dos son React.memo y que sus props tienen identidad estable. */}
      <FasePedidos
        oculto={fase !== 'pedidos'}
        clienteResaltado={clienteResaltadoPedidos}
        cargando={cargando}
        clientes={clientes}
        clientesVisibles={clientesVisibles}
        filas={filas}
        avisos={avisosPorCliente}
        problemas={problemas}
        problemasSueltos={problemasSueltos}
        transportes={transportes}
        transporteGlobalNum={transporteGlobalNum}
        opcionesReferencia={opcionesReferencia}
        opcionesSinStock={opcionesSinStock}
        calidadesPorReferencia={calidadesPorReferencia}
        calidadesCatalogo={calidadesCatalogo}
        faltantes={faltantesRef.current}
        selloFaltantes={selloFaltantes}
        clientesConFaltante={clientesConFaltante}
        unidadesFaltantes={unidadesFaltantes}
        enviando={enviando}
        cruzando={cruzando}
        impedimento={impedimento}
        resumen={resumen}
        conflictos={conflictos}
        avisoCarga={avisoCarga}
        borradorRecuperado={borradorRecuperado}
        ultimoEnvio={ultimoEnvio}
        generandoMatriz={generandoMatriz}
        estadoGuardado={estadoGuardado}
        tasa={tasa}
        transporteGlobal={transporteGlobal}
        validezDias={validezDias}
        buscar={buscar}
        soloConItems={soloConItems}
        soloConFaltante={soloConFaltante}
        onTasa={setTasa}
        onTransporte={setTransporteGlobal}
        onValidez={setValidezDias}
        onBuscar={setBuscar}
        onSoloConItems={setSoloConItems}
        onSoloConFaltante={setSoloConFaltante}
        onCampo={setCampo}
        onItemCampo={setItemCampo}
        onAgregarItem={agregarItem}
        onQuitarItem={quitarItem}
        onCatalogo={setTransportes}
        onCargarFaltante={cargarFaltanteDe}
        onCargarTodoFaltante={cargarTodoFaltante}
        onRespetarPrecio={respetarPrecio}
        onDescartarBorrador={descartarBorrador}
        onRepartir={irAlReparto}
        onDescargarMatriz={descargarMatriz}
      />

      {reparto && (
        <FaseDistribucion
          oculto={fase !== 'reparto'}
          productos={reparto.productos}
          asignado={asignado}
          precios={preciosPorAsignacion}
          descuentos={descuentosPorCliente}
          totales={totalesReparto}
          clientes={clientes}
          listos={listos}
          cambiados={cambiados}
          tocados={tocados}
          abiertos={abiertos}
          faltantesFallo={faltantesFallo}
          sinFaltante={sinFaltante}
          problemas={problemas}
          problemasSueltos={problemasSueltos}
          stockLeidoEn={reparto.stock_leido_en}
          avisoStock={reparto.aviso}
          ajustados={ajustados}
          enviando={enviando}
          releyendo={releyendo}
          numeroReparto={reparto.numero}
          onVolver={volverAPedidos}
          onReleer={releerInventario}
          onCantidad={setCantidad}
          onCriterio={aplicarCriterio}
          onVaciar={vaciarProducto}
          onListo={marcarListo}
          onAbrir={alternarAbierto}
          onCuentaFaltante={marcarCuentaFaltante}
          onAceptarPropuestas={aceptarPropuestas}
          onCrear={crearCotizaciones}
        />
      )}
    </Layout>
  );
}
