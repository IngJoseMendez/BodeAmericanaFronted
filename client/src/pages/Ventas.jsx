// `Fragment` con nombre y no <>…</>: la fila de la venta y la de su desglose
// son dos <tr> hermanos que necesitan UNA key, y la forma corta no admite key.
import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink, CampoMonto, BuscadorLista } from '../components/common';
import { ventasApi, pacasApi, clientesApi, reservasApi } from '../services/api';
import { PAGO_TIPOS } from '../types';
import { Plus, Search, Trash2, User, Calendar, Download, FileSpreadsheet, FileText, X, ChevronRight, Pencil } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
// autoTable se usaba en descargarPDF sin importarlo: el botón "Descargar PDF"
// reventaba con ReferenceError y para la usuaria simplemente no hacía nada.
import autoTable from 'jspdf-autotable';
import { hoy, formatFechaCorta } from '../lib/fecha';
import { parseMonto, formatCOP } from '../lib/money';
import { descargarExcel } from '../lib/descargar';
// El mismo agrupado que usa el despacho directo. Si cada pantalla agrupara
// a su manera, una ofreceria existencias que la otra no ve.
import {
  agruparPacas, preciosDeHoy, claveStock, clavesEnPromocion,
  filtrarGrupos, facetasDeGrupos, DIMENSIONES_PRODUCTO,
} from '../lib/stock';
// LA MISMA CUENTA DEL DESCUENTO QUE LA COTIZACION, importada y no copiada. Es
// por unidad y topada al precio de cada paca, y si aqui se escribiera otra vez
// acabaria dando otro numero: cotizar algo y venderlo directamente darian
// totales distintos, y el cliente tendria un papel con una cifra y la cartera
// con otra.
import { precioConDescuento } from '../lib/cotizacion';

import { mensajeDeError } from '../lib/errores';
/**
 * Los renglones de una venta, agrupados por producto y contados.
 *
 * El servidor manda UNA FILA POR PACA, porque una venta se hace contra pacas
 * concretas. Para leerlo hace falta lo contrario: «2× mixta verano supreme» en
 * vez de la misma línea dos veces. La cantidad ES la información, y repetir el
 * nombre la esconde.
 *
 * Se agrupa por referencia + calidad, que es el par con el que trabaja toda la
 * bodega, y se respeta el orden en que vino: el servidor ya los manda ordenados.
 */
function agruparItemsVenta(items) {
  const m = new Map();
  for (const d of items || []) {
    const referencia = String(d?.referencia ?? '').trim() || 'sin referencia';
    const calidad = String(d?.calidad ?? '').trim();
    const clave = `${referencia.toLowerCase()}|${calidad.toLowerCase()}`;
    const ya = m.get(clave);
    if (ya) { ya.cantidad += 1; continue; }
    m.set(clave, { clave, referencia, calidad, cantidad: 1 });
  }
  return [...m.values()];
}

// Los rótulos de los cuatro filtros del selector de productos. `categoria` se
// llama TEMPORADA en la bodega, y es como hay que escribirlo en la pantalla.
const FILTROS_PRODUCTO = [
  { dim: 'categoria', rotulo: 'Temporada', todos: 'Las dos' },
  { dim: 'clasificacion', rotulo: 'Clasificación', todos: 'Todas' },
  { dim: 'referencia', rotulo: 'Referencia', todos: 'Todas' },
  { dim: 'calidad', rotulo: 'Calidad', todos: 'Todas' },
];

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Buscador de cliente con soporte de teclado.
 *
 * Antes cada opción era un <div onClick> sin role ni tabIndex: con el teclado no
 * había ninguna forma de elegir cliente y, por tanto, de registrar una venta o
 * una reserva. Ahora es un combobox con listbox real (flechas para moverse,
 * Enter para elegir, Escape para cerrar) y el lector de pantalla anuncia cuántas
 * coincidencias hay. Estaba duplicado en los dos modales; una sola copia evita
 * que vuelvan a divergir.
 */
function BuscadorCliente({ id, clientes, clienteId, onSelect, onClear }) {
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState(false);
  const [indice, setIndice] = useState(0);
  const contenedorRef = useRef(null);

  const seleccionado = clientes.find(c => String(c.id) === String(clienteId));

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return clientes
      .filter(c =>
        c.nombre?.toLowerCase().includes(q) ||
        c.ciudad?.toLowerCase().includes(q) ||
        c.telefono?.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [clientes, busqueda]);

  useEffect(() => {
    const clicFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) setAbierta(false);
    };
    document.addEventListener('mousedown', clicFuera);
    return () => document.removeEventListener('mousedown', clicFuera);
  }, []);

  const listaId = `${id}-lista`;
  const listaVisible = abierta && Boolean(busqueda) && !clienteId;

  const elegir = (c) => {
    if (!c) return;
    onSelect(c);
    setBusqueda('');
    setAbierta(false);
    setIndice(0);
  };

  const alTeclear = (e) => {
    if (e.key === 'Escape') {
      // Modal escucha Escape en `document`. Sin stopPropagation, el Escape que
      // sólo pretendía cerrar la lista de clientes seguía subiendo y cerraba
      // TODO el modal de la venta: se perdían las pacas ya seleccionadas y el
      // precio escrito. Si la lista no está abierta se deja pasar, para que
      // Escape siga cerrando el modal como en el resto de la aplicación.
      if (listaVisible) {
        e.stopPropagation();
        setAbierta(false);
      }
      return;
    }
    if (e.key === 'Enter') {
      // Sin este preventDefault, pulsar Enter en el buscador enviaba el
      // formulario de la venta con el cliente todavía sin elegir.
      e.preventDefault();
      if (listaVisible) elegir(coincidencias[Math.min(indice, coincidencias.length - 1)]);
      return;
    }
    if (coincidencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setAbierta(true);
      setIndice(i => (i + 1) % coincidencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setAbierta(true);
      setIndice(i => (i - 1 + coincidencias.length) % coincidencias.length);
    }
  };

  return (
    <div className="relative" ref={contenedorRef}>
      <label htmlFor={id} className="block text-sm font-medium text-primary mb-1">
        Cliente <span className="text-error" aria-hidden="true">*</span>
        <span className="sr-only">(obligatorio)</span>
      </label>

      {clienteId ? (
        <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
          <div className="p-2 bg-secondary/20 rounded-lg">
            <User className="w-4 h-4 text-secondary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-secondary truncate">{seleccionado?.nombre || 'Cliente'}</p>
            <p className="text-xs text-muted truncate">{seleccionado?.ciudad || ''}</p>
          </div>
          <button
            type="button"
            onClick={() => { onClear(); setBusqueda(''); setAbierta(false); }}
            title="Elegir otro cliente"
            aria-label={`Quitar a ${seleccionado?.nombre || 'el cliente'} y buscar otro`}
            className="p-1.5 rounded-lg hover:bg-secondary/20 text-secondary"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-muted" aria-hidden="true" />
          </div>
          <input
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-expanded={listaVisible}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={listaVisible && coincidencias.length > 0 ? `${listaId}-${indice}` : undefined}
            placeholder="Escribe el nombre, la ciudad o el teléfono"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setAbierta(true); setIndice(0); }}
            onFocus={() => busqueda && setAbierta(true)}
            onKeyDown={alTeclear}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
          />
        </div>
      )}

      {listaVisible && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Clientes encontrados"
          className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
        >
          {coincidencias.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">Ningún cliente coincide con “{busqueda}”.</li>
          ) : coincidencias.map((c, i) => (
            <li key={c.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listaId}-${i}`}
                aria-selected={i === indice}
                tabIndex={-1}
                onMouseEnter={() => setIndice(i)}
                onClick={() => elegir(c)}
                className={`w-full text-left px-4 py-3 transition-colors duration-150 border-b border-border/50 last:border-b-0 ${
                  i === indice ? 'bg-primary/10' : 'hover:bg-primary/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <User className="w-4 h-4 text-muted" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-primary truncate">{c.nombre}</p>
                    <p className="text-xs text-muted truncate">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <span className="sr-only" role="status" aria-live="polite">
        {listaVisible ? `${coincidencias.length} cliente(s) encontrados` : ''}
      </span>
    </div>
  );
}

export default function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    cliente_id: '', tipo_pago: 'contado', fecha: hoy()
  });
  // Lo elegido se guarda POR PRODUCTO —clave referencia|calidad— con su
  // cantidad y su precio, no como una lista de pacas. Las pacas concretas se
  // derivan de aqui al enviar (ver `pacasSeleccionadas`), que es lo que
  // permite escribir «3» en vez de marcar tres casillas.
  const [grupoSel, setGrupoSel] = useState({});
  // El inventario agregado se trae solo por los precios de PROMOCION: no
  // viajan en la fila de la paca, y sin esto se cobraria el precio de lista
  // de algo que esta rebajado.
  const [inventario, setInventario] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pacasDisponibles, setPacasDisponibles] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [buscarPacas, setBuscarPacas] = useState('');
  // ── LOS CUATRO CAMPOS POR LOS QUE SE ESCOGE UN PRODUCTO ─────────
  //
  // Aquí sólo había una caja de texto: para encontrar «mixta invierno
  // diamante» había que acordarse de cómo estaba escrita, y de que no se
  // llamaba «mixta de invierno». Son los mismos cuatro campos que el
  // inventario, así que lo que se elige aquí significa lo mismo allá.
  //
  // Se filtra en el navegador y no en el servidor porque el stock disponible ya
  // está todo cargado: pedirlo otra vez por cada filtro sería una petición para
  // volver a recibir lo que ya está en memoria.
  const [filtrosProd, setFiltrosProd] = useState({});

  // ── DESCUENTO Y FLETE, COMO EN LA COTIZACION ────────────────────
  //
  // Una venta directa no podia llevar ninguno de los dos. Para dar un descuento
  // habia que bajarle el precio a cada paca a mano, y despues nadie sabia si
  // ese precio era el de verdad o el ya rebajado: se perdia el dato de cuanto se
  // habia rebajado y de sobre que.
  const [descuentoVenta, setDescuentoVenta] = useState('');
  const [tipoDescuentoVenta, setTipoDescuentoVenta] = useState('valor_fijo');
  const [fleteUnitario, setFleteUnitario] = useState('');
  const [notasVenta, setNotasVenta] = useState('');

  const ponerFiltroProd = (dim, valor) =>
    setFiltrosProd((f) => ({ ...f, [dim]: valor }));
  // ── QUÉ VENTAS ESTÁN DESGLOSADAS ────────────────────────────────
  //
  // La venta de Felipe Herrera son SEIS pacas distintas y la lista enseñaba
  // 8.300.000 y nada más: para saber qué se había llevado había que abrir la
  // venta, y desde la lista no había manera de verlo.
  //
  // Se despliega en su sitio en vez de llevar a otra pantalla porque lo que se
  // quiere es COMPARAR —ver las seis y seguir viendo las de abajo—, y eso se
  // pierde al navegar. El total se queda arriba: la fila sigue diciendo lo que
  // decía, y debajo aparece de qué está hecho.
  //
  // Un Set y no un booleano por fila: se pueden tener varias abiertas a la vez,
  // que es como se compara una venta con otra.
  const [ventasAbiertas, setVentasAbiertas] = useState(() => new Set());

  // ── LLEGAR DESDE LA CARTERA DE UN CLIENTE ───────────────────────
  //
  // `/ventas?venta=5` abre la pantalla EN esa venta. Se filtra en el servidor y
  // no se busca entre lo que haya cargado: con la lista paginada, la venta
  // podria estar en la pagina siete y el atajo no llevaria a ninguna parte.
  //
  // El filtro se ve y se quita con un clic, porque una pantalla que ensena una
  // sola fila sin decir por que parece una pantalla vacia.
  const [paramsUrl, setParamsUrl] = useSearchParams();
  const ventaEnfocada = paramsUrl.get('venta');

  const quitarVentaEnfocada = () => {
    const siguiente = new URLSearchParams(paramsUrl);
    siguiente.delete('venta');
    setParamsUrl(siguiente, { replace: true });
  };

  // ── CORREGIR UNA VENTA YA CREADA ────────────────────────────────
  //
  // El caso que lo pidio: se registraron varias ventas y se olvido el descuento
  // de 100.000 de cada paca. Hasta ahora las dos salidas eran dejarla mal o
  // BORRARLA y volverla a hacer, y borrar devuelve las pacas al inventario,
  // quita el renglon de la cartera y pierde la fecha original. Equivocarse en un
  // precio no deberia costar eso.
  //
  // `corrigiendo` guarda la venta que se esta corrigiendo y los precios
  // tecleados. Se parte de los precios que YA tiene, no de casillas vacias: se
  // viene a cambiar uno, no a escribirlos todos otra vez.
  const [corrigiendo, setCorrigiendo] = useState(null);
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false);

  const abrirCorreccion = (venta) => {
    const items = (venta.detalles || []).map((d) => ({
      paca_id: d.paca_id,
      producto: [d.categoria, d.clasificacion, d.referencia, d.calidad].filter(Boolean).join(' / '),
      precio_original: parseMonto(d.precio_unitario),
      precio: String(Math.round(parseMonto(d.precio_unitario))),
      // Lo que esta en promocion no recibe descuento: la promocion YA es el
      // precio rebajado. Sin esto el cuadro ensenaria un total y el servidor
      // guardaria otro.
      es_promocion: Boolean(d.es_promocion),
    }));
    setCorrigiendo({
      venta,
      items,
      fecha: String(venta.fecha || '').slice(0, 10),
      tipo_pago: venta.tipo_pago || 'contado',
      // El descuento y el flete QUE YA TIENE, no vacios: se viene a corregir, y
      // una casilla vacia aqui significaria «ponlo en cero», que es un cambio
      // que nadie pidio.
      descuento: venta.descuento_valor > 0 ? String(Math.round(venta.descuento_valor)) : '',
      tipo_descuento: venta.tipo_descuento || 'valor_fijo',
      flete: venta.transporte_unitario > 0 ? String(Math.round(venta.transporte_unitario)) : '',
      notas: venta.notas || '',
    });
  };

  const cambiarPrecioCorreccion = (pacaId, valor) => setCorrigiendo((c) => (!c ? c : {
    ...c,
    items: c.items.map((i) => (i.paca_id === pacaId ? { ...i, precio: valor } : i)),
  }));

  // EL ATAJO DEL CASO REAL. Restar lo mismo a mano en seis casillas es seis
  // ocasiones de equivocarse; aqui se escribe una vez. No inventa nada: deja los
  // precios escritos en las casillas, a la vista, y todavia hay que guardar.
  const [descuentoPorPaca, setDescuentoPorPaca] = useState('');

  const aplicarDescuentoATodas = () => {
    const d = parseMonto(descuentoPorPaca);
    if (!(d > 0)) { addToast('Escribe cuánto se le baja a cada paca', 'warning'); return; }
    setCorrigiendo((c) => (!c ? c : {
      ...c,
      // Nunca por debajo de cero: un precio negativo lo rechazaria el servidor
      // despues de haber borrado lo que habia escrito.
      items: c.items.map((i) => ({ ...i, precio: String(Math.max(0, Math.round(parseMonto(i.precio) - d))) })),
    }));
    setDescuentoPorPaca('');
  };

  // LA MISMA CUENTA QUE AL CREAR Y QUE EN EL SERVIDOR: subtotal − descuento +
  // flete, con el descuento por unidad y topado al precio de cada paca. Si aqui
  // se calculara de otra forma, el cuadro ensenaria un total y la venta se
  // guardaria con otro.
  const cuentasCorreccion = (() => {
    const items = corrigiendo?.items || [];
    const subtotal = items.reduce((t, i) => t + parseMonto(i.precio), 0);
    const descuento = items.reduce((t, i) => {
      if (i.es_promocion) return t;
      const precio = parseMonto(i.precio);
      return t + (precio - precioConDescuento(
        precio, parseMonto(corrigiendo?.descuento), corrigiendo?.tipo_descuento));
    }, 0);
    const fleteUnit = parseMonto(corrigiendo?.flete);
    const fleteTotal = Math.round(fleteUnit * items.length);
    return {
      subtotal, descuento, fleteUnit, fleteTotal,
      unidades: items.length,
      total: subtotal - descuento + fleteTotal,
    };
  })();

  const totalCorreccion = cuentasCorreccion.total;
  // Lo que la venta vale HOY, para poder poner el antes al lado del despues.
  const totalOriginalCorreccion = parseMonto(corrigiendo?.venta?.total);

  const guardarCorreccion = async () => {
    if (!corrigiendo || guardandoCorreccion) return;
    const malos = corrigiendo.items.filter((i) => !(parseMonto(i.precio) > 0));
    if (malos.length) {
      addToast(`Falta el precio de ${malos[0].producto || 'una paca'}`, 'error');
      return;
    }
    try {
      setGuardandoCorreccion(true);
      const r = await ventasApi.update(corrigiendo.venta.id, {
        fecha: corrigiendo.fecha,
        tipo_pago: corrigiendo.tipo_pago,
        items: corrigiendo.items.map((i) => ({ paca_id: i.paca_id, precio_unitario: parseMonto(i.precio) })),
        descuento: parseMonto(corrigiendo.descuento) || 0,
        tipo_descuento: corrigiendo.tipo_descuento,
        transporte_unitario: parseMonto(corrigiendo.flete) || 0,
        notas: corrigiendo.notas,
      });
      // Se dice QUE cambio y en cuanto, no un «guardado» a secas: lo que se
      // acaba de mover es la deuda de un cliente.
      const dif = Number(r?.diferencia || 0);
      addToast(dif === 0
        ? 'Venta corregida'
        : `Venta corregida: ${dif < 0 ? 'baja' : 'sube'} ${formatCurrency(Math.abs(dif))}`
          + ` — ahora ${formatCurrency(r.total)}`, 'success');
      if (r && r.cartera_actualizada === false) {
        addToast('Ojo: esta venta no tenía renglón en la cartera, así que la deuda del cliente no cambió.', 'warning');
      }
      setCorrigiendo(null);
      loadVentas();
      loadPacasDisponibles();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    } finally {
      setGuardandoCorreccion(false);
    }
  };

  const claveVenta = (v) => `${v.origen || 'sistema'}-${v.id}`;

  // Al llegar con `?venta=5`: se recarga con el filtro puesto y la venta se
  // abre sola. Llegar a una fila plegada obligaria a un clic mas para ver justo
  // lo que se venia a ver.
  useEffect(() => {
    if (!ventaEnfocada) return;
    setVentasAbiertas((abiertas) => new Set(abiertas).add(`sistema-${ventaEnfocada}`));
    setPagina(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventaEnfocada]);

  const alternarVenta = (v) => setVentasAbiertas((abiertas) => {
    const siguiente = new Set(abiertas);
    const k = claveVenta(v);
    if (siguiente.has(k)) siguiente.delete(k); else siguiente.add(k);
    return siguiente;
  });
  const [despachoModalOpen, setDespachoModalOpen] = useState(false);
  const [despachoData, setDespachoData] = useState(null);
  const [filtroVista, setFiltroVista] = useState('disponible'); // 'disponible' = ventas registradas | 'reservada' | 'cartera'
  // El resumen que manda el listado: cuánto suma TODO lo que cumple el filtro
  // -no la página- y de cuántas de esas ventas se puede calcular margen.
  const [resumenVentas, setResumenVentas] = useState({ monto: 0, conCosto: 0, desde: null, hasta: null });
  const [reservasActivas, setReservasActivas] = useState([]);
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [reservaForm, setReservaForm] = useState({ cliente_id: '', cantidad: 1, notas: '', dias_expiracion: 7 });
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalVentas, setTotalVentas] = useState(0);
  const [exportando, setExportando] = useState(false);
  // Cuántas pacas disponibles hay en total frente a las que se trajeron: el
  // backend limita la consulta y sin este dato el modal aparentaba tener todo
  // el inventario cuando en realidad mostraba sólo una parte.
  const [totalPacasDisponibles, setTotalPacasDisponibles] = useState(0);
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Evita que dos peticiones en vuelo se pisen: si el usuario cambia el filtro
  // dos veces seguidas, gana la última pedida, no la última en responder.
  const peticionVentasRef = useRef(0);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroMontoMin, setFiltroMontoMin] = useState('');
  const [filtroMontoMax, setFiltroMontoMax] = useState('');

  const debouncedBuscarPacas = useDebounce(buscarPacas, 300);
  const debouncedBusqueda = useDebounce(busqueda, 350);

  // Al vaciar un campo de monto, NumberInput devuelve la cadena "0", no "": sin
  // esta normalización el botón "Limpiar" no desaparecía nunca y se seguía
  // mandando al servidor un monto_min=0 que no filtra nada.
  const montoFiltro = (v) => (parseMonto(v) > 0 ? v : '');
  const montoMin = montoFiltro(filtroMontoMin);
  const montoMax = montoFiltro(filtroMontoMax);

  const hayFiltros = Boolean(busqueda || filtroFechaInicio || filtroFechaFin || montoMin || montoMax);

  useEffect(() => {
    loadClientes();
    loadReservas();
  }, [filtroVista]);

  // Al cambiar cualquier filtro se vuelve a la página 1: quedarse en la 7 de un
  // resultado que ahora tiene 2 páginas mostraría una tabla vacía.
  useEffect(() => {
    setPagina(1);
  }, [debouncedBusqueda, filtroFechaInicio, filtroFechaFin, montoMin, montoMax]);

  useEffect(() => {
    loadVentas(pagina);
    // `ventaEnfocada` va aqui tambien: es un filtro mas, y sin el la pantalla
    // se quedaria con la lista de antes al llegar desde la cartera.
  }, [pagina, filtroVista, debouncedBusqueda, filtroFechaInicio, filtroFechaFin, montoMin, montoMax,
    ventaEnfocada]);

  // Al borrar la única venta de la última página quedaba una tabla vacía con el
  // paginador marcando una página que ya no existe.
  useEffect(() => {
    if (!loading && pagina > totalPaginas) setPagina(totalPaginas);
  }, [loading, pagina, totalPaginas]);

  // El filtrado ocurre en el servidor: `ventas` ya llega filtrado y paginado.
  const ventasFiltradas = ventas;

  /** Filtros activos tal como los espera el backend (los vacíos los descarta `qs`). */
  const filtrosVentas = () => ({
    buscar: debouncedBusqueda || undefined,
    fecha_inicio: filtroFechaInicio || undefined,
    fecha_fin: filtroFechaFin || undefined,
    monto_min: montoMin || undefined,
    monto_max: montoMax || undefined,
    // El atajo desde la cartera. Lo filtra el SERVIDOR: con la lista paginada,
    // buscar la venta entre lo que ya este cargado no la encontraria si esta en
    // la pagina siete.
    venta_id: ventaEnfocada || undefined,
  });

  // El valor por defecto es la página actual, no la 1: al eliminar una venta o
  // registrar otra se llamaba `loadVentas()` a secas y la tabla saltaba al
  // principio del histórico aunque el paginador siguiera marcando la página 5.
  const loadVentas = async (page = pagina) => {
    const miPeticion = ++peticionVentasRef.current;
    setLoading(true);
    try {
      const response = await ventasApi.getAll({ pagina: page, limite: 20, ...filtrosVentas() });
      if (miPeticion !== peticionVentasRef.current) return;   // llegó tarde: ya hay otra consulta
      const data = response.data || response;
      setVentas(Array.isArray(data) ? data : []);
      setResumenVentas({
        monto: Number(response?.monto_total) || 0,
        conCosto: Number(response?.con_costo) || 0,
        desde: response?.desde || null,
        hasta: response?.hasta || null,
      });
      setTotalPaginas(response.total_paginas || 1);
      setTotalVentas(response.total ?? (Array.isArray(data) ? data.length : 0));
      // No se reescribe `pagina` desde la respuesta: el estado ya es la fuente de
      // verdad y reasignarlo aquí devolvía siempre a la página 1, dejando el
      // histórico anterior a las últimas 20 ventas fuera de alcance.
    } catch (err) {
      if (miPeticion !== peticionVentasRef.current) return;
      addToast(mensajeDeError(err), 'error');
    } finally {
      if (miPeticion === peticionVentasRef.current) setLoading(false);
    }
};

  const loadReservas = async () => {
    try {
      const respuesta = await reservasApi.getAll({ estado: 'activa' });
      // Si el endpoint pasara a paginar, guardar el objeto crudo reventaría el
      // .map de la tabla con "reservasActivas.map is not a function".
      const data = Array.isArray(respuesta) ? respuesta : (respuesta?.data || []);
      setReservasActivas(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadClientes = async () => {
    try {
      const clientesRes = await clientesApi.getAll({ estado: 'activo' });
      const data = clientesRes.data || clientesRes;
      setClientes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  const openModal = async () => {
    try {
      const [pacasRes, clientesRes, invRes] = await Promise.all([
        // Sin `limite` el backend devuelve sólo las 50 primeras pacas: el
        // buscador del modal filtra en el navegador, así que una paca fuera de
        // esas 50 no aparecía por más que se escribiera su referencia.
        pacasApi.getAll({ estado: 'disponible', limite: 2000 }),
        clientesApi.getAll({ estado: 'activo' }),
        // Si esta llamada falla la venta se puede hacer igual: se pierde el
        // precio de promoción, que la casilla deja corregir a mano.
        pacasApi.getInventario().catch(() => []),
      ]);
      const pacasData = pacasRes.data || pacasRes;
      const clientesData = clientesRes.data || clientesRes;

      setPacasDisponibles(Array.isArray(pacasData) ? pacasData : []);
      setTotalPacasDisponibles(pacasRes.total ?? (Array.isArray(pacasData) ? pacasData.length : 0));
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      setFormData({
        cliente_id: '',
        tipo_pago: 'contado',
        fecha: hoy()
      });
      setInventario(Array.isArray(invRes) ? invRes : []);
      setGrupoSel({});
      setBuscarPacas('');
      setFiltrosProd({});
      setDescuentoVenta('');
      setTipoDescuentoVenta('valor_fijo');
      setFleteUnitario('');
      setNotasVenta('');
      setError('');
      setModalOpen(true);
    } catch (err) {
      addToast(mensajeDeError(err, 'cargar datos'), 'error');
    }
  };

  // Cambiar la cantidad de un producto. El precio se rellena con el de hoy la
  // primera vez que se pide algo de esa fila, y desde ahi se puede corregir:
  // es el mismo gesto del despacho directo.
  //
  // La cantidad se RECORTA a lo que hay. Dejar escribir 10 de un producto del
  // que quedan 4 no ayuda a nadie: el servidor rechazaria la venta entera al
  // final, cuando ya se eligio cliente, fecha y seis productos mas.
  const setCantidad = (g, valor) => {
    const k = claveStock(g.referencia, g.calidad);
    const pedido = parseInt(valor, 10) || 0;
    const cantidad = Math.max(0, Math.min(pedido, g.disponibles));
    setGrupoSel((prev) => {
      if (cantidad <= 0) {
        const { [k]: _fuera, ...resto } = prev;
        return resto;
      }
      const ya = prev[k];
      return {
        ...prev,
        // `precio` vacio cuando el grupo mezcla precios: se deja EN BLANCO y la
        // pantalla lo marca, en vez de proponer uno de los dos como si fuera el
        // bueno. Ver `agruparPacas` en lib/stock.js.
        [k]: { cantidad, precio: ya?.precio ?? (g.precio != null ? String(g.precio) : '') },
      };
    });
  };

  const setPrecioGrupo = (g, precio) => {
    const k = claveStock(g.referencia, g.calidad);
    setGrupoSel((prev) => (prev[k] ? { ...prev, [k]: { ...prev[k], precio } } : prev));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando) return;   // doble clic = venta duplicada
    setError('');

    if (!formData.cliente_id) {
      setError('Selecciona un cliente');
      return;
    }
    if (pacasSeleccionadas.length === 0) {
      setError('Pon una cantidad en al menos un producto');
      return;
    }
    // Un producto sin precio saldría vendido en cero sin que nadie se entere.
    const sinPrecio = gruposElegidos.filter(g => !(parseMonto(g.precio) > 0));
    if (sinPrecio.length > 0) {
      setError(`Falta el precio de ${sinPrecio.map(g => g.referencia).join(', ')}.`);
      return;
    }

    try {
      setEnviando(true);
      const result = await ventasApi.create({
        cliente_id: parseInt(formData.cliente_id),
        tipo_pago: formData.tipo_pago,
        fecha: formData.fecha,
        // `es_promocion` viaja porque el servidor recalcula el total y tiene que
        // saber a qué paca NO aplicarle el descuento encima.
        pacas: pacasSeleccionadas.map(p => ({
          id: p.id, precio_venta: p.precio_venta, es_promocion: p.es_promocion,
        })),
        // Se manda lo que se TECLEÓ, no el descuento ya calculado: el total lo
        // saca el servidor de los precios de las pacas. Lo que se calcula en
        // pantalla es sólo para poder enseñarlo antes de guardar.
        descuento: parseMonto(descuentoVenta) || 0,
        tipo_descuento: tipoDescuentoVenta,
        transporte_unitario: parseMonto(fleteUnitario) || 0,
        notas: notasVenta.trim() || null,
      });
      
      const cliente = clientes.find(c => c.id === parseInt(formData.cliente_id));
      const ventaInfo = {
        ...result,
        cliente,
        pacas: pacasSeleccionadas,
        total: totalVenta,
        fecha: formData.fecha,
        tipo_pago: formData.tipo_pago
      };
      
      setDespachoData(ventaInfo);
      setDespachoModalOpen(true);

      addToast(`Venta registrada — ${pacasSeleccionadas.length} paca(s) por ${formatCurrency(totalVenta)}`, 'success');
      setModalOpen(false);
      // Reset del formulario tras la venta
      setFormData({ cliente_id: '', tipo_pago: 'contado', fecha: hoy() });
      setGrupoSel({});
      // La venta recién creada es la más reciente y vive en la página 1: recargar
      // la página 5 dejaba al usuario sin ver lo que acababa de registrar.
      if (pagina === 1) loadVentas(1); else setPagina(1);
    } catch (err) {
      setError(err.message);
      addToast(mensajeDeError(err, 'registrar venta'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar venta?',
      message: 'Las pacas volverán al estado disponible. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await ventasApi.delete(id);
      addToast('Venta eliminada', 'success');
      loadVentas();
    } catch (err) {
      addToast(mensajeDeError(err, 'eliminar'), 'error');
    }
  };

  // ── Lo disponible, por producto ────────────────────────────────
  //
  // Una fila por referencia + calidad, en orden alfabético, con lo que hay y el
  // precio de hoy. De 206 casillas se pasa a unas sesenta filas, que es el
  // numero de productos distintos que de verdad tiene la bodega.
  //
  // TODO ESTE BLOQUE VA ANTES DE `totalVenta`, y no es un detalle de estilo:
  // `totalVenta` se calcula durante el render leyendo `gruposElegidos`. Cuando
  // este bloque estaba debajo, ese const seguia en zona muerta y la pantalla
  // entera reventaba con un ReferenceError antes de pintar una sola fila.

  // Tope de filas pintadas. Son unos sesenta productos hoy, pero la bodega
  // crece y una tabla de mil filas en una tableta se arrastra.
  const FILAS_PRODUCTOS_VISIBLES = 150;

  const productos = useMemo(
    () => agruparPacas(pacasDisponibles, preciosDeHoy(inventario)),
    [pacasDisponibles, inventario]
  );

  // Que productos tienen promocion corriendo hoy. La fila de una paca no trae
  // la promocion: solo viaja en el inventario agrupado, que es de donde sale.
  const promocionesHoy = useMemo(() => clavesEnPromocion(inventario), [inventario]);

  // Filtra sobre el término ya reposado (300 ms): antes se recorría el inventario
  // entero y se repintaba la tabla en cada tecla, y el `.includes()` sin
  // normalizar hacía que buscar "HOMBRE" no encontrara "hombre".
  const productosCoincidentes = useMemo(() => {
    // Primero los desplegables -comparación exacta- y después el texto. Al
    // revés da lo mismo, pero así el texto trabaja sobre mucho menos.
    const porFiltros = filtrarGrupos(productos, filtrosProd);
    const q = debouncedBuscarPacas.trim().toLowerCase();
    if (!q) return porFiltros;
    return porFiltros.filter(g =>
      g.referencia?.toLowerCase().includes(q) ||
      g.calidad?.toLowerCase().includes(q) ||
      g.clasificacion?.toLowerCase().includes(q) ||
      g.categoria?.toLowerCase().includes(q)
    );
  }, [productos, filtrosProd, debouncedBuscarPacas]);

  // Las opciones de cada desplegable, contadas sobre lo que de verdad hay
  // disponible y con los OTROS filtros puestos: así ninguna opción ofrecida
  // deja la tabla vacía.
  const facetasProd = useMemo(
    () => facetasDeGrupos(productos, filtrosProd),
    [productos, filtrosProd]
  );

  const filtrosProdPuestos = DIMENSIONES_PRODUCTO
    .map((dim) => ({ dim, valor: filtrosProd[dim] }))
    .filter((f) => f.valor);

  const productosVisibles = useMemo(
    () => productosCoincidentes.slice(0, FILAS_PRODUCTOS_VISIBLES),
    [productosCoincidentes]
  );

  // Lo elegido, con el producto al lado. Se mira SIEMPRE contra `productos`
  // completo y no contra lo filtrado: si no, escribir en el buscador despues de
  // elegir haria desaparecer del total lo que ya estaba pedido.
  const gruposElegidos = useMemo(
    () => productos
      .map(g => ({ ...g, ...grupoSel[claveStock(g.referencia, g.calidad)] }))
      .filter(g => (parseInt(g.cantidad, 10) || 0) > 0),
    [productos, grupoSel]
  );

  // LAS PACAS CONCRETAS, derivadas de las cantidades.
  //
  // El endpoint de ventas vende pacas con nombre y apellido, asi que de cada
  // producto se toman las N primeras por id: el mismo criterio que usa el
  // servidor al despachar (`ORDER BY id`), o sea que se vende lo que llego
  // antes. Es lo unico que esta pantalla decide por su cuenta, y por eso se
  // deriva aqui y no se guarda: nunca puede quedar desfasado de las cantidades.
  const pacasSeleccionadas = useMemo(
    () => gruposElegidos.flatMap(g =>
      g.ids.slice(0, parseInt(g.cantidad, 10) || 0).map(id => ({
        id,
        // LOS CUATRO CAMPOS DE LA PACA, no tres. `categoria` faltaba, y es la
        // que dice si lo que sale es de verano o de invierno: sin ella el
        // comprobante que se baja al terminar la venta salía con esa columna en
        // blanco mientras el inventario sí la sabía.
        categoria: g.categoria,
        clasificacion: g.clasificacion,
        referencia: g.referencia,
        calidad: g.calidad,
        precio_venta: parseMonto(g.precio),
        // LO QUE ESTA EN PROMOCION NO LLEVA DESCUENTO ENCIMA: la promocion ya
        // es el precio rebajado. Viaja al servidor porque es el servidor el que
        // calcula el total, y sin este dato aplicaria el descuento dos veces.
        es_promocion: promocionesHoy.has(claveStock(g.referencia, g.calidad)),
      }))
    ),
    [gruposElegidos, promocionesHoy]
  );

  // ── LAS CUENTAS DE LA VENTA ─────────────────────────────────────
  //
  // `subtotal - descuento + flete`, con el descuento POR UNIDAD y topado al
  // precio de cada paca, y sin aplicarse a lo que ya esta en promocion. Es la
  // misma cuenta que hace el servidor y la misma que hace la cotizacion:
  // `precioConDescuento` viene de lib/cotizacion, no esta escrita aqui otra vez.
  //
  // Esto se calcula en pantalla SOLO para poder ensenarlo antes de guardar. El
  // total que vale es el que devuelve el servidor, que lo recalcula de los
  // precios de las pacas: la cuenta del dinero no puede vivir en el navegador.
  const cuentasVenta = useMemo(() => {
    const subtotal = pacasSeleccionadas.reduce((t, p) => t + parseMonto(p.precio_venta), 0);
    const descuento = pacasSeleccionadas.reduce((t, p) => {
      if (p.es_promocion) return t;
      const precio = parseMonto(p.precio_venta);
      return t + (precio - precioConDescuento(precio, parseMonto(descuentoVenta), tipoDescuentoVenta));
    }, 0);
    const unidades = pacasSeleccionadas.length;
    const fleteUnit = parseMonto(fleteUnitario);
    const fleteTotal = Math.round(fleteUnit * unidades);
    return {
      subtotal, descuento, unidades, fleteUnit, fleteTotal,
      total: subtotal - descuento + fleteTotal,
      enPromocion: pacasSeleccionadas.filter((p) => p.es_promocion).length,
    };
  }, [pacasSeleccionadas, descuentoVenta, tipoDescuentoVenta, fleteUnitario]);

  // `totalVenta` se conserva con ese nombre porque la pantalla ya lo usaba en
  // varios sitios; ahora es el total DE VERDAD, con descuento y flete dentro.
  const totalVenta = cuentasVenta.total;

  const formatCurrency = formatCOP;

  const formatDate = formatFechaCorta;

  /**
   * Descarga un libro de ExcelJS.
   * El enlace se quita del DOM y el blob se libera: cada exportación dejaba una
   * URL de objeto viva hasta recargar la página.
   */
  const descargarLibro = async (wb, nombreArchivo) => {
    const buffer = await wb.xlsx.writeBuffer();
    descargarExcel(buffer, nombreArchivo);
  };

  /**
   * El comprobante de UNA venta, en Excel.
   *
   * SE LLAMA ASI Y NO `descargarExcel` POR UN BUG QUE DURO MESES: ese nombre
   * es el del ayudante importado de lib/descargar —el que monta el enlace y
   * libera la URL—, y un const con el mismo nombre dentro del componente lo
   * tapaba. `descargarLibro` llamaba a `descargarExcel(buffer, nombre)`
   * creyendo hablar con el import y acababa aqui, con un buffer donde se
   * esperaba una venta: `data.pacas.forEach` sobre algo que no tiene pacas.
   * El Excel de una venta no bajaba por ninguno de los dos caminos, y el
   * unico rastro era un toast de «Error al descargar».
   *
   * Ni el linter ni el build ven esto: son dos ambitos distintos, y para
   * JavaScript tapar un import con un const local es legal.
   */
  const comprobanteExcelDeVenta = async (data) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Comercio Global Logístico';
    wb.created = new Date();

    const ws = wb.addWorksheet('Venta');
    ws.properties.tabColor = '0f172a';
    
    // Título
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = '🌐 Comercio Global Logístico - Comprobante de Venta';
    ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    
    // Datos del cliente
    ws.getCell('A3').value = 'Cliente:';
    ws.getCell('B3').value = data.cliente?.nombre || 'N/A';
    ws.getCell('A4').value = 'Fecha:';
    ws.getCell('B4').value = formatDate(data.fecha);
    ws.getCell('A5').value = 'Tipo de Pago:';
    ws.getCell('B5').value = data.tipo_pago === 'contado' ? 'Contado' : 'Crédito';
    ws.getCell('A6').value = 'Folio:';
    ws.getCell('B6').value = data.uuid?.slice(0, 8).toUpperCase();
    
    // Encabezados
    // LOS CUATRO CAMPOS DE LA PACA. Con «Clasificación» y «Referencia» a secas
    // no se sabe si la blusa supreme que se vendió era de verano o de invierno,
    // y son justo los cuatro con los que trabajan el inventario, la matriz, las
    // promociones y el despacho.
    const headersRow = 8;
    ['Categoría', 'Clasificación', 'Referencia', 'Calidad', 'Precio Unitario'].forEach((h, i) => {
      const cell = ws.getCell(`${String.fromCharCode(65 + i)}${headersRow}`);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
    });
    
    // Datos de pacas
    let row = 9;
    (data.pacas || []).forEach(paca => {
      ws.getCell(`A${row}`).value = paca.categoria || '';
      ws.getCell(`B${row}`).value = paca.clasificacion || '';
      ws.getCell(`C${row}`).value = paca.referencia || '';
      ws.getCell(`D${row}`).value = paca.calidad || '';
      ws.getCell(`E${row}`).value = parseMonto(paca.precio_venta);
      ws.getCell(`E${row}`).numFmt = '$#,##0';
      row++;
    });

    // Total
    ws.getCell(`A${row}`).value = 'TOTAL';
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`E${row}`).value = parseMonto(data.total);
    ws.getCell(`E${row}`).numFmt = '$#,##0';
    ws.getCell(`E${row}`).font = { bold: true };

    // Ajustar anchos
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 16;
    ws.getColumn(3).width = 26;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 18;

    await descargarLibro(wb, `Venta_${data.uuid?.slice(0, 8) || 'sin-folio'}_${hoy()}.xlsx`);

    addToast('Excel descargado', 'success');
  };

  const descargarPDF = (data) => {
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 46);
    doc.text('Comercio Global Logístico', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Comprobante de Venta', 105, 28, { align: 'center' });
    doc.text(`Folio: ${data.uuid?.slice(0, 8).toUpperCase()}`, 105, 34, { align: 'center' });
    
    // Datos
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`Cliente: ${data.cliente?.nombre || 'N/A'}`, 20, 50);
    doc.text(`Fecha: ${formatDate(data.fecha)}`, 20, 56);
    doc.text(`Tipo de Pago: ${data.tipo_pago === 'contado' ? 'Contado' : 'Crédito'}`, 20, 62);
    
    // Tabla de productos, con los CUATRO campos de la paca.
    //
    // La referencia se lleva el ancho que le sobra a las demás porque es la
    // columna larga —«blusa vestido jean», «buzo con capota»— y es la que se
    // lee primero para reconocer lo que salió.
    const tableData = (data.pacas || []).map(p => [
      p.categoria || '—',
      p.clasificacion || '—',
      p.referencia || '—',
      p.calidad || '—',
      formatCurrency(parseMonto(p.precio_venta)),
    ]);
    tableData.push(['TOTAL', '', '', '', formatCurrency(parseMonto(data.total))]);

    autoTable(doc, {
      startY: 75,
      head: [['Categoría', 'Clasificación', 'Referencia', 'Calidad', 'Precio']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [26, 26, 46] },
      footStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 1.8 },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 26 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 26 },
        4: { cellWidth: 30, halign: 'right' },
      },
    });
    
    doc.save(`Venta_${data.uuid?.slice(0, 8) || 'sin-folio'}_${hoy()}.pdf`);
    addToast('PDF descargado', 'success');
  };

  /**
   * Exporta a Excel TODAS las ventas que cumplen los filtros, no sólo la página
   * en pantalla.
   *
   * Ojo con el `limite`: omitir `pagina` NO desactiva la paginación del backend,
   * que aplica su límite por defecto (~50 filas) igual que en /pacas. Sin un
   * `limite` explícito el "export completo" salía recortado a las primeras 50
   * ventas y el archivo decía "Todas las ventas registradas": un reporte
   * contable mal sin ningún aviso. Es el mismo patrón que usa Pacas.jsx
   * (`fetchInventarioActual`) para bajar el inventario entero.
   */
  const LIMITE_EXPORT = 10000;
  const exportarVentasExcel = async () => {
    if (exportando) return;
    try {
      setExportando(true);
      // `buscar` se toma del texto tal cual está escrito, no del debounce: pulsar
      // exportar justo después de teclear exportaba con el filtro anterior.
      const respuesta = await ventasApi.getAll({
        ...filtrosVentas(),
        buscar: busqueda || undefined,
        limite: LIMITE_EXPORT,
      });
      const filas = Array.isArray(respuesta) ? respuesta : (respuesta.data || []);
      // Cuántas ventas dice el servidor que cumplen los filtros: si son más de
      // las que llegaron, el archivo está incompleto y hay que decirlo.
      const totalServidor = Array.isArray(respuesta)
        ? filas.length
        : (respuesta.total ?? filas.length);
      const incompleto = totalServidor > filas.length;
      if (filas.length === 0) {
        addToast('No hay ventas que coincidan con los filtros', 'error');
        return;
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();
      const ws = wb.addWorksheet('Ventas');
      ws.properties.tabColor = '0f172a';

      // Nueve columnas desde que el archivo lleva un renglón por item.
      ws.mergeCells('A1:I1');
      ws.getCell('A1').value = '🌐 Comercio Global Logístico — Ventas';
      ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      ws.getCell('A1').alignment = { horizontal: 'center' };

      // Deja por escrito con qué filtros se sacó el archivo: sin esto, dos
      // exportaciones del mismo día parecían el mismo reporte y no lo eran.
      const detalleFiltros = [
        busqueda ? `cliente contiene "${busqueda}"` : null,
        filtroFechaInicio ? `desde ${formatDate(filtroFechaInicio)}` : null,
        filtroFechaFin ? `hasta ${formatDate(filtroFechaFin)}` : null,
        montoMin ? `mínimo ${formatCurrency(parseMonto(montoMin))}` : null,
        montoMax ? `máximo ${formatCurrency(parseMonto(montoMax))}` : null,
      ].filter(Boolean);
      ws.mergeCells('A2:I2');
      const textoFiltros = detalleFiltros.length
        ? `Filtros: ${detalleFiltros.join(' · ')}`
        : 'Todas las ventas registradas';
      ws.getCell('A2').value = incompleto
        ? `${textoFiltros} — ARCHIVO INCOMPLETO: ${filas.length} de ${totalServidor} ventas`
        : textoFiltros;
      ws.getCell('A2').font = { italic: true, size: 10, bold: incompleto };

      // ── UN RENGLÓN POR ITEM, NO UNO POR VENTA ──────────────────
      //
      // El archivo traía una línea por venta con su total. La venta de Felipe
      // Herrera son SEIS pacas distintas y en el Excel era «8.300.000» a secas:
      // no se podía filtrar por calidad, ni sumar por referencia, ni saber qué
      // salió. Un total es lo que se pone cuando ya se tiene el detalle, no en
      // su lugar.
      //
      // Cada renglón vale lo que vale SU paca, así que la columna suma el total
      // de verdad y nada se cuenta dos veces. Las líneas de los libros se quedan
      // como estaban —un renglón de libro YA ES un producto— con los cuatro
      // campos en blanco: no se sabe su categoría, y escribir una supuesta sería
      // inventarla.
      const headersRow = 4;
      const COLS = ['Fecha', 'Cliente', 'Concepto', 'Categoría', 'Clasificación',
        'Referencia', 'Calidad', 'Pago', 'Valor'];
      const COL = Object.fromEntries(COLS.map((h, i) => [h, String.fromCharCode(65 + i)]));
      COLS.forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${headersRow}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      });

      let row = headersRow + 1;
      let total = 0;
      let renglones = 0;

      // VACIO CUANDO NO SE SABE. Esto decía «Crédito» en cuanto tipo_pago no
      // fuera exactamente 'contado', y en los libros ese dato no existe: el
      // archivo afirmaba que miles de ventas fueron a crédito sin que nadie lo
      // hubiera dicho nunca.
      const comoPago = (t) => (t ? (t === 'contado' ? 'Contado' : 'Crédito') : '');

      const escribir = (v, { concepto, paca, valor }) => {
        ws.getCell(`${COL['Fecha']}${row}`).value = formatDate(v.fecha);
        ws.getCell(`${COL['Cliente']}${row}`).value = v.cliente_nombre || getClienteNombre(v.cliente_id);
        ws.getCell(`${COL['Concepto']}${row}`).value = concepto || '';
        ws.getCell(`${COL['Categoría']}${row}`).value = paca?.categoria || '';
        ws.getCell(`${COL['Clasificación']}${row}`).value = paca?.clasificacion || '';
        ws.getCell(`${COL['Referencia']}${row}`).value = paca?.referencia || '';
        ws.getCell(`${COL['Calidad']}${row}`).value = paca?.calidad || '';
        ws.getCell(`${COL['Pago']}${row}`).value = comoPago(v.tipo_pago);
        ws.getCell(`${COL['Valor']}${row}`).value = valor;
        ws.getCell(`${COL['Valor']}${row}`).numFmt = '$#,##0';
        total += valor;
        renglones++;
        row++;
      };

      filas.forEach(v => {
        const items = Array.isArray(v.detalles) ? v.detalles : [];
        if (!items.length) {
          escribir(v, { concepto: v.concepto, paca: null, valor: parseMonto(v.total) });
          return;
        }
        let suma = 0;
        items.forEach((d) => {
          const valor = parseMonto(d.precio_unitario);
          suma += valor;
          escribir(v, { concepto: '', paca: d, valor });
        });
        // Si las pacas no suman el total guardado, la diferencia se escribe como
        // lo que es y con su nombre. Repartirla entre las pacas cambiaría
        // precios que alguien escribió; callarla dejaría la columna sumando algo
        // distinto del total de la venta.
        const guardado = parseMonto(v.total);
        if (Math.round(guardado) !== Math.round(suma)) {
          escribir(v, {
            concepto: `Diferencia entre el total guardado (${formatCurrency(guardado)}) y sus pacas`,
            paca: null,
            valor: guardado - suma,
          });
        }
      });

      ws.getCell(`${COL['Pago']}${row}`).value = 'TOTAL';
      ws.getCell(`${COL['Pago']}${row}`).font = { bold: true };
      ws.getCell(`${COL['Valor']}${row}`).value = total;
      ws.getCell(`${COL['Valor']}${row}`).numFmt = '$#,##0';
      ws.getCell(`${COL['Valor']}${row}`).font = { bold: true };

      // Un filtro en la cabecera: con los cuatro campos de la paca en columnas,
      // lo primero que se quiere es ver sólo una calidad o una referencia.
      ws.autoFilter = { from: `A${headersRow}`, to: `${COL['Valor']}${row - 1}` };

      [14, 26, 34, 13, 15, 24, 15, 11, 16]
        .forEach((ancho, i) => { ws.getColumn(i + 1).width = ancho; });

      await descargarLibro(wb, `Ventas_${hoy()}.xlsx`);
      if (incompleto) {
        addToast(
          `El servidor sólo devolvió ${filas.length} de ${totalServidor} ventas: el Excel está incompleto. Acota el rango de fechas y vuelve a exportar.`,
          'error'
        );
      } else {
        addToast(`Excel descargado — ${renglones} renglón(es) de ${filas.length} venta(s)`, 'success');
      }
    } catch (err) {
      addToast(mensajeDeError(err, 'exportar'), 'error');
    } finally {
      setExportando(false);
    }
  };

  const openReservaModal = () => {
    if (clientes.length === 0) {
      loadClientes();
    }
    setReservaForm({ cliente_id: '', cantidad: 1, notas: '', dias_expiracion: 7 });
    setReservaModalOpen(true);
  };

  const handleCrearReserva = async () => {
    if (!reservaForm.cliente_id) {
      addToast('Selecciona un cliente', 'error');
      return;
    }
    if (pacasSeleccionadas.length === 0) {
      addToast('Selecciona al menos una paca', 'error');
      return;
    }
    try {
      for (const paca of pacasSeleccionadas) {
        await reservasApi.create({
          cliente_id: parseInt(reservaForm.cliente_id),
          paca_id: paca.id,
          cantidad: 1,
          notas: reservaForm.notas,
          dias_expiracion: parseInt(reservaForm.dias_expiracion)
        });
      }
      addToast(`${pacasSeleccionadas.length} reserva(s) creada(s)`, 'success');
      setReservaModalOpen(false);
      // `setPacasSeleccionadas` ya no existe: lo elegido se guarda POR PRODUCTO
      // desde que el modal pasó a pedir cantidades. Esta línea quedó viva tras
      // ese cambio y reventaba al crear una reserva -no al construir, porque un
      // identificador libre en un callback sólo falla cuando se ejecuta-. La
      // encontró el linter con `no-undef`, que es justo para lo que se montó.
      setGrupoSel({});
      loadPacasDisponibles();
      // El contador de la pestaña "Reservas" se quedaba viejo hasta recargar.
      loadReservas();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const loadPacasDisponibles = async () => {
    try {
      const pacasRes = await pacasApi.getAll({ estado: 'disponible', limite: 2000 });
      const pacasData = pacasRes.data || pacasRes;
      setPacasDisponibles(Array.isArray(pacasData) ? pacasData : []);
      setTotalPacasDisponibles(pacasRes.total ?? (Array.isArray(pacasData) ? pacasData.length : 0));
    } catch (err) {
      console.error(err);
    }
  };

  const convertirReservaAVenta = async (reserva) => {
    try {
      await ventasApi.create({
        cliente_id: reserva.cliente_id,
        tipo_pago: 'contado',
        fecha: hoy(),
        pacas: [{ id: reserva.paca_id, precio_venta: reserva.precio_venta }]
      });
      addToast('Reserva convertida a venta exitosamente', 'success');
      loadReservas();
      loadVentas();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  const descargarExcelVenta = async (venta) => {
    try {
      const ventaDetalle = await ventasApi.getOne(venta.id);
      const cliente = clientes.find(c => c.id === venta.cliente_id) || {};
      
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();
      
      const ws = wb.addWorksheet('Venta');
      ws.properties.tabColor = '0f172a';
      
      ws.mergeCells('A1:F1');
      ws.getCell('A1').value = '🌐 Comercio Global Logístico - Comprobante de Venta';
      ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      ws.getCell('A1').alignment = { horizontal: 'center' };
      
      ws.getCell('A3').value = 'Folio:';
      ws.getCell('B3').value = venta.uuid?.slice(0, 8).toUpperCase();
      ws.getCell('A4').value = 'Cliente:';
      ws.getCell('B4').value = ventaDetalle.cliente_nombre || cliente.nombre || 'N/A';
      ws.getCell('A5').value = 'Fecha:';
      // new Date('2026-08-14') se interpreta en UTC y en Colombia mostraba el día
      // anterior; formatFechaCorta ancla la fecha al mediodía local.
      ws.getCell('B5').value = formatDate(venta.fecha);
      ws.getCell('A6').value = 'Tipo de Pago:';
      ws.getCell('B6').value = venta.tipo_pago === 'contado' ? 'Contado' : 'Crédito';

      // FUERA «PESO (KG)». La pantalla pintaba esa columna, el servidor no
      // mandaba el campo y las 209 pacas lo tienen escrito en 0.00: sólo podía
      // salir vacía o con un cero que no es un peso. En su sitio van las dos
      // que faltaban de verdad, categoría y calidad.
      const headersRow = 8;
      ['Cant.', 'Categoría', 'Clasificación', 'Referencia', 'Calidad', 'Precio Unitario'].forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${headersRow}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      });
      
      let row = 9;
      let total = 0;
      (ventaDetalle.detalles || []).forEach(paca => {
        ws.getCell(`A${row}`).value = 1;
        ws.getCell(`B${row}`).value = paca.categoria || '';
        ws.getCell(`C${row}`).value = paca.clasificacion || '';
        ws.getCell(`D${row}`).value = paca.referencia || '';
        ws.getCell(`E${row}`).value = paca.calidad || '';
        ws.getCell(`F${row}`).value = parseMonto(paca.precio_unitario);
        ws.getCell(`F${row}`).numFmt = '$#,##0';
        total += parseMonto(paca.precio_unitario);
        row++;
      });

      ws.getCell(`A${row}`).value = 'TOTAL';
      ws.getCell(`A${row}`).font = { bold: true };
      ws.getCell(`F${row}`).value = total;
      ws.getCell(`F${row}`).numFmt = '$#,##0';
      ws.getCell(`F${row}`).font = { bold: true };

      // Si los items no suman el total guardado de la venta, se DICE. Dejar que
      // el pie diga 8.300.000 cuando los renglones dan otra cosa es justo el
      // documento que nadie puede desmentir después.
      const guardado = parseMonto(ventaDetalle.total ?? venta.total);
      if (guardado > 0 && Math.round(guardado) !== Math.round(total)) {
        row++;
        ws.mergeCells(`A${row}:F${row}`);
        ws.getCell(`A${row}`).value = `Atención: la venta está guardada por `
          + `${formatCurrency(guardado)} y sus renglones suman ${formatCurrency(total)}.`;
        ws.getCell(`A${row}`).font = { italic: true, bold: true, color: { argb: 'B45309' } };
      }

      ws.getColumn(1).width = 8;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 16;
      ws.getColumn(4).width = 26;
      ws.getColumn(5).width = 16;
      ws.getColumn(6).width = 18;

      await descargarLibro(wb, `Venta_${venta.uuid?.slice(0, 8) || venta.id}_${venta.fecha}.xlsx`);

      addToast('Excel descargado', 'success');
    } catch (err) {
      addToast(mensajeDeError(err, 'descargar'), 'error');
    }
  };

  // `clientes` sólo trae los activos: para una venta de un cliente ya desactivado
  // se pintaba "Cliente #12". El backend manda el nombre en la propia fila.
  const getClienteNombre = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre || `Cliente #${clienteId}`;
  };

  const nombreDeVenta = (venta) => venta.cliente_nombre || getClienteNombre(venta.cliente_id);

  // Flechas izquierda/derecha entre pestañas, como espera un lector de pantalla.
  const VISTAS = ['disponible', 'reservada'];
  const navegarPestanas = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const paso = e.key === 'ArrowRight' ? 1 : -1;
    const siguiente = VISTAS[(VISTAS.indexOf(filtroVista) + paso + VISTAS.length) % VISTAS.length];
    setFiltroVista(siguiente);
    document.getElementById(`tab-${siguiente}`)?.focus();
  };

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroFechaInicio('');
    setFiltroFechaFin('');
    setFiltroMontoMin('');
    setFiltroMontoMax('');
    // Y la venta que se abrió desde la cartera, que también es un filtro. Si se
    // quedara puesta, «Limpiar» dejaría la tabla con una sola fila y la palabra
    // del botón sería mentira.
    if (ventaEnfocada) quitarVentaEnfocada();
  };

  return (
    // El subtítulo decía "20 ventas registradas" porque contaba las filas de la
    // página en pantalla; el total real lo devuelve el servidor.
    <Layout
      title="Ventas"
      subtitle={
        loading && totalVentas === 0
          ? 'Cargando…'
          : totalVentas === 1
            ? '1 venta registrada'
            : `${totalVentas.toLocaleString('es-CO')} ventas registradas`
      }
    >
      <div className="space-y-4">
        {/* Pestañas: eran <button> sueltos diferenciados sólo por color, sin
            role ni aria-selected, así que el estado activo no se anunciaba. */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-2" role="tablist" aria-label="Vistas de ventas">
          <button
            role="tab"
            id="tab-disponible"
            aria-selected={filtroVista === 'disponible'}
            aria-controls="panel-disponible"
            tabIndex={filtroVista === 'disponible' ? 0 : -1}
            onClick={() => setFiltroVista('disponible')}
            onKeyDown={navegarPestanas}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              filtroVista === 'disponible'
                ? 'bg-primary text-white'
                : 'text-primary hover:bg-primary/10'
            }`}
          >
            Ventas registradas
          </button>
          <button
            role="tab"
            id="tab-reservada"
            aria-selected={filtroVista === 'reservada'}
            aria-controls="panel-reservada"
            tabIndex={filtroVista === 'reservada' ? 0 : -1}
            onClick={() => setFiltroVista('reservada')}
            onKeyDown={navegarPestanas}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              filtroVista === 'reservada'
                ? 'bg-success text-white'
                : 'text-primary hover:bg-success/10'
            }`}
          >
            Reservas ({reservasActivas.length})
          </button>
        </div>

        {/* Vista de Ventas registradas */}
        {filtroVista === 'disponible' && (
          <div id="panel-disponible" role="tabpanel" aria-labelledby="tab-disponible" className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={exportarVentasExcel}
                variant="outline"
                disabled={exportando}
                title={hayFiltros ? 'Descarga en Excel todas las ventas que cumplen los filtros' : 'Descarga en Excel todas las ventas'}
              >
                <Download size={18} className="mr-1" aria-hidden="true" />
                {exportando ? 'Preparando…' : (hayFiltros ? 'Exportar filtradas' : 'Exportar a Excel')}
              </Button>
              <Button onClick={openReservaModal} variant="info" disabled={pacasSeleccionadas.length === 0}>
                <Calendar size={18} className="mr-1" aria-hidden="true" /> Reservar ({pacasSeleccionadas.length})
              </Button>
              <Button onClick={openModal} variant="secondary">
                <Plus size={18} className="mr-1" aria-hidden="true" /> Nueva Venta
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-error/10 text-error rounded-lg text-sm" role="alert">{error}</div>
            )}

            {/* Filtros de ventas. Antes eran cinco campos con sólo placeholder:
                al escribir dentro, la pista desaparecía y nadie recordaba si la
                casilla de la derecha era el monto mínimo o el máximo. */}
            <Card>
              <CardBody className="p-0">
                {/* bg-primary/3 no existía: la escala de opacidad de Tailwind no
                    incluye el 3, así que esa clase nunca llegaba al CSS y la
                    banda de filtros salía sin fondo. El valor arbitrario sí se
                    genera (es el que ya usa el resto del proyecto). */}
                <div className="p-4 border-b border-border/50 bg-primary/[0.03]">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[180px]">
                      <Input
                        id="filtro-cliente"
                        label="Cliente"
                        placeholder="Nombre del cliente"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="w-full sm:w-36">
                      <Input
                        id="filtro-desde"
                        label="Desde"
                        type="date"
                        value={filtroFechaInicio}
                        onChange={(e) => setFiltroFechaInicio(e.target.value)}
                      />
                    </div>
                    <div className="w-full sm:w-36">
                      <Input
                        id="filtro-hasta"
                        label="Hasta"
                        type="date"
                        value={filtroFechaFin}
                        onChange={(e) => setFiltroFechaFin(e.target.value)}
                      />
                    </div>
                    <div className="w-[calc(50%-0.375rem)] sm:w-36">
                      <Input
                        id="filtro-min"
                        label="Monto mínimo"
                        type="number"
                        placeholder="$"
                        value={filtroMontoMin}
                        onChange={(e) => setFiltroMontoMin(e.target.value)}
                      />
                    </div>
                    <div className="w-[calc(50%-0.375rem)] sm:w-36">
                      <Input
                        id="filtro-max"
                        label="Monto máximo"
                        type="number"
                        placeholder="$"
                        value={filtroMontoMax}
                        onChange={(e) => setFiltroMontoMax(e.target.value)}
                      />
                    </div>
                    {hayFiltros && (
                      <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                        Limpiar
                      </Button>
                    )}
                  </div>

                  {/* ── SE ESTÁ MIRANDO UNA SOLA VENTA ─────────────────
                      Al llegar desde la cartera de un cliente la lista trae una
                      fila. Sin decirlo, eso parece una pantalla vacía o un
                      filtro que se quedó puesto de antes: el aviso dice por qué
                      hay una sola y la saca de un clic. */}
                  {ventaEnfocada && (
                    <div className="flex flex-wrap items-center gap-2 mt-3 p-2.5 rounded-xl bg-secondary/10">
                      <span className="text-xs text-primary">
                        Se está mostrando <strong>una sola venta</strong>, la que se abrió desde la
                        cartera del cliente.
                      </span>
                      <button
                        type="button"
                        onClick={quitarVentaEnfocada}
                        className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full
                                   text-xs font-semibold text-secondary hover:bg-secondary/20"
                      >
                        Ver todas las ventas <X size={13} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {/* El filtrado lo hace el servidor, así que el conteo debe salir
                      del total devuelto, no de las 20 filas de la página. */}
                  {hayFiltros && !loading && (
                    <p className="text-xs text-muted mt-2" role="status" aria-live="polite">
                      {totalVentas === 0
                        ? 'Ninguna venta coincide con los filtros.'
                        : `${totalVentas.toLocaleString('es-CO')} venta(s) coinciden con los filtros.`}
                    </p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <caption className="sr-only">
                      Ventas registradas, página {pagina} de {totalPaginas}
                    </caption>
                    <thead className="bg-primary/5 border-b border-border/50">
                      <tr>
                        {/* Fuera la columna ID: el listado junta dos tablas y sus
                            numeros se pisan, asi que un «#5» ya no identificaba
                            nada. El concepto ocupa su sitio, que es lo que de
                            verdad se busca al revisar un mes. */}
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Fecha</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Concepto</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Pago</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Total</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {loading ? (
                        <TableSkeleton cols={7} rows={6} />
                      ) : ventasFiltradas.length === 0 ? (
                        <tr><td colSpan={6}>
                          <EmptyState
                            title={hayFiltros ? 'Sin resultados' : 'Sin ventas'}
                            description={hayFiltros
                              ? 'Ninguna venta coincide con los filtros aplicados.'
                              : 'Todavía no hay ventas registradas. Usa el botón “Nueva Venta”.'}
                            action={hayFiltros ? { label: 'Limpiar filtros', onClick: limpiarFiltros } : undefined}
                          />
                        </td></tr>
                      ) : (
                        ventasFiltradas.map((venta) => {
                          // Una venta de los libros no tiene detalle que abrir ni
                          // pacas que devolver al inventario, asi que no se le
                          // ofrecen esas acciones. Lo que se corrige de ella se
                          // corrige en la cartera del cliente, que es donde vive,
                          // y ahi se enlaza.
                          const delSistema = venta.origen !== 'cartera';
                          const items = Array.isArray(venta.detalles) ? venta.detalles : [];
                          // Agrupado por producto para poder decir la CANTIDAD.
                          // El servidor manda un renglon por paca; «2x mixta
                          // verano supreme» se lee de un golpe y la misma linea
                          // repetida dos veces, no.
                          const porProducto = agruparItemsVenta(items);
                          const abierta = ventasAbiertas.has(claveVenta(venta));
                          const idDesglose = `desglose-${claveVenta(venta)}`;
                          return (
                            <Fragment key={claveVenta(venta)}>
                            <tr className={`transition-colors ${abierta ? 'bg-primary/5' : 'hover:bg-primary/5'}`}>
                              <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{formatDate(venta.fecha)}</td>
                              <td className="px-4 py-3 text-sm text-primary font-medium">
                                <RefLink to="/cartera" id={venta.cliente_id} title="Ver cartera del cliente">{nombreDeVenta(venta)}</RefLink>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted max-w-xs" title={venta.concepto || ''}>
                                {/* UNA VENTA DE VARIAS PACAS DICE DE CUÁNTAS, y se abre.
                                    «venta con pacas del sistema» no decía nada: ni
                                    cuántas, ni cuáles, ni que hubiera algo que mirar.
                                    El botón es un <button> de verdad -no una fila
                                    pulsable- para que se alcance con el tabulador y
                                    para que el lector de pantalla anuncie si está
                                    abierto; el galón se ve siempre, porque en la
                                    tableta no hay ratón que haga aparecer nada. */}
                                {items.length > 0 ? (
                                  /* QUÉ SE VENDIÓ, SIN TENER QUE ABRIR NADA.
                                     Antes decía «6 pacas · ver cuáles», que es
                                     mejor que nada pero obliga a un clic por
                                     venta para saber lo único que de verdad se
                                     quiere saber. Ahora los productos están
                                     ahí, con su cantidad, y el botón sólo abre
                                     lo que NO cabe en una línea: el precio de
                                     cada paca y el desglose del total. */
                                  <button
                                    type="button"
                                    onClick={() => alternarVenta(venta)}
                                    aria-expanded={abierta}
                                    aria-controls={idDesglose}
                                    title={abierta ? 'Plegar el detalle' : 'Ver los precios de cada paca'}
                                    className="block w-full text-left -mx-2 px-2 py-1.5 rounded-lg
                                               hover:bg-secondary/10"
                                  >
                                    <span className="flex items-start gap-1.5">
                                      <ChevronRight
                                        size={14}
                                        aria-hidden="true"
                                        className={`mt-0.5 shrink-0 text-secondary transition-transform ${abierta ? 'rotate-90' : ''}`}
                                      />
                                      <span className="min-w-0">
                                        {porProducto.map((d, i) => (
                                          <span key={`${d.clave}-${i}`} className="block capitalize leading-snug">
                                            <span className="font-mono text-[11px] text-muted tabular-nums mr-1">
                                              {d.cantidad}×
                                            </span>
                                            <span className="text-primary">{d.referencia}</span>
                                            {d.calidad && <span className="text-muted"> · {d.calidad}</span>}
                                          </span>
                                        ))}
                                        <span className="block text-[11px] text-muted mt-0.5">
                                          {items.length} paca{items.length === 1 ? '' : 's'}
                                          {' · '}{abierta ? 'plegar' : 'ver precios'}
                                        </span>
                                      </span>
                                    </span>
                                  </button>
                                ) : (
                                  <span className="block truncate">
                                    {venta.concepto || (delSistema ? 'venta sin detalle guardado' : '—')}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {venta.tipo_pago
                                  ? <Badge variant={venta.tipo_pago}>{venta.tipo_pago}</Badge>
                                  : <span className="text-xs text-muted">—</span>}
                              </td>
                              <td className="px-4 py-3 text-sm text-primary font-medium text-right tabular-nums whitespace-nowrap">
                                {formatCurrency(venta.total)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {delSistema ? (
                                  <div className="flex gap-1 justify-end">
                                    {/* CORREGIR va antes de descargar y de borrar:
                                        es lo que se hace cuando algo salió mal, y
                                        hasta ahora la única salida era borrar la
                                        venta entera. Sólo aparece si hay renglones
                                        que corregir. */}
                                    {items.length > 0 && (
                                      <button
                                        onClick={() => abrirCorreccion(venta)}
                                        className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10"
                                        title="Corregir precios, fecha o forma de pago"
                                        aria-label={`Corregir la venta de ${nombreDeVenta(venta)}`}
                                      >
                                        <Pencil size={16} aria-hidden="true" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => descargarExcelVenta(venta)}
                                      className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-success/10"
                                      title="Descargar Excel"
                                      aria-label={`Descargar el Excel de la venta de ${nombreDeVenta(venta)}`}
                                    >
                                      <FileSpreadsheet size={16} aria-hidden="true" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(venta.id)}
                                      className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10"
                                      title="Eliminar venta"
                                      aria-label={`Eliminar la venta de ${nombreDeVenta(venta)}`}
                                    >
                                      <Trash2 size={16} aria-hidden="true" />
                                    </button>
                                  </div>
                                ) : (
                                  <RefLink to="/cartera" id={venta.cliente_id}
                                    title="Ver esta venta en la cartera del cliente" className="text-xs">
                                    en su cartera
                                  </RefLink>
                                )}
                              </td>
                            </tr>

                            {/* EL DESGLOSE. Una tabla dentro de la celda y no
                                seis filas más de la tabla de arriba: así las
                                columnas del desglose pueden ser las suyas
                                -categoría, clasificación, referencia, calidad-
                                sin tener que caber en las de la lista.

                                Los subtotales se suman y se comparan con el
                                total guardado. Si no cuadran se DICE, en vez de
                                enseñar un pie que nadie puede desmentir. */}
                            {abierta && items.length > 0 && (() => {
                              const suma = items.reduce((t, i) => t + parseMonto(i.precio_unitario), 0);
                              const guardado = parseMonto(venta.total);
                              const cuadra = Math.round(suma) === Math.round(guardado);
                              return (
                                <tr id={idDesglose} className="bg-primary/5">
                                  <td colSpan={6} className="px-4 pb-4 pt-0">
                                    <div className="rounded-xl border border-border bg-surface overflow-hidden">
                                      <table className="w-full text-xs">
                                        <caption className="sr-only">
                                          Las {items.length} pacas de la venta de {nombreDeVenta(venta)}
                                        </caption>
                                        <thead className="bg-primary/5">
                                          <tr className="text-[11px] font-bold text-muted uppercase tracking-wider">
                                            <th scope="col" className="px-3 py-2 text-left">Categoría</th>
                                            <th scope="col" className="px-3 py-2 text-left">Clasificación</th>
                                            <th scope="col" className="px-3 py-2 text-left">Referencia</th>
                                            <th scope="col" className="px-3 py-2 text-left">Calidad</th>
                                            <th scope="col" className="px-3 py-2 text-right">Precio</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/60">
                                          {items.map((i) => (
                                            <tr key={i.paca_id}>
                                              <td className="px-3 py-2 text-muted capitalize">{i.categoria || '—'}</td>
                                              <td className="px-3 py-2 text-muted capitalize">{i.clasificacion || '—'}</td>
                                              <td className="px-3 py-2 text-primary capitalize">{i.referencia || '—'}</td>
                                              <td className="px-3 py-2 text-muted capitalize">{i.calidad || '—'}</td>
                                              <td className="px-3 py-2 text-right tabular-nums text-primary">
                                                {formatCurrency(parseMonto(i.precio_unitario))}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr className="bg-primary/5 font-semibold">
                                            <td colSpan={4} className="px-3 py-2 text-muted uppercase text-[11px] tracking-wider">
                                              Suma de las {items.length} pacas
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums text-secondary">
                                              {formatCurrency(suma)}
                                            </td>
                                          </tr>
                                          {!cuadra && (
                                            <tr>
                                              <td colSpan={5} className="px-3 py-2 text-[11px] text-warning font-semibold">
                                                La venta está guardada por {formatCurrency(guardado)} y sus pacas
                                                suman {formatCurrency(suma)}.
                                              </td>
                                            </tr>
                                          )}
                                        </tfoot>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })()}
                            </Fragment>
                          );
                        })
                      )}
</tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            {/* Paginación */}
            {totalPaginas > 1 && (
              <nav
                className="flex flex-wrap justify-center items-center gap-2 py-4 border-t border-border"
                aria-label="Paginación de ventas"
              >
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  aria-label="Página anterior"
                  className="px-3 py-1 rounded-lg border border-border text-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/5"
                >
                  Anterior
                </button>
                <span className="text-sm text-muted" role="status" aria-live="polite">
                  Página {pagina} de {totalPaginas}
                  {totalVentas > 0 && ` · ${totalVentas.toLocaleString('es-CO')} ventas`}
                </span>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  aria-label="Página siguiente"
                  className="px-3 py-1 rounded-lg border border-border text-primary disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/5"
                >
                  Siguiente
                </button>
              </nav>
            )}
          </div>
        )}

        {/* Vista de Reservas.
            Los grises fijos (bg-green-50, text-gray-600/700/800) no tienen
            equivalente en modo oscuro: index.css sólo reasigna hasta gray-600,
            así que esta tabla quedaba prácticamente negra sobre negro. Con los
            tokens del tema se lee igual en los dos modos. */}
        {filtroVista === 'reservada' && (
          <div id="panel-reservada" role="tabpanel" aria-labelledby="tab-reservada">
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">Reservas activas de pacas</caption>
                  <thead className="bg-success/10 border-b border-border/50">
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Paca</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Cliente</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Precio</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Expiración</th>
                      <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Notas</th>
                      <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {reservasActivas.length === 0 ? (
                      <tr><td colSpan={6}>
                        <EmptyState
                          title="Sin reservas activas"
                          description="Elige pacas en la pestaña de ventas y pulsa “Reservar” para apartarlas para un cliente."
                        />
                      </td></tr>
                    ) : (
                      reservasActivas.map((reserva) => (
                        <tr key={reserva.id} className="hover:bg-success/5 transition-colors">
                          <td className="px-4 py-3 text-sm text-primary">
                            <div className="font-medium">{reserva.paca_tipo}</div>
                            <div className="text-xs text-muted">{reserva.paca_categoria}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-primary font-medium">{reserva.cliente_nombre}</td>
                          <td className="px-4 py-3 text-sm text-primary whitespace-nowrap">{formatCurrency(reserva.precio_venta)}</td>
                          <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{reserva.fecha_expiracion ? formatDate(reserva.fecha_expiracion) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-muted max-w-xs truncate" title={reserva.notas || ''}>{reserva.notas || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="sm"
                              onClick={() => convertirReservaAVenta(reserva)}
                              variant="success"
                              title={`Convertir en venta la reserva de ${reserva.cliente_nombre || 'el cliente'}`}
                            >
                              Pasar a Venta
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
          </div>
        )}

      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Venta" size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm" role="alert">{error}</div>}

          {/* Tres columnas fijas apretaban los campos hasta ser inusables en móvil. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <BuscadorCliente
              id="venta-cliente"
              clientes={clientes}
              clienteId={formData.cliente_id}
              onSelect={(c) => setFormData({ ...formData, cliente_id: c.id.toString() })}
              onClear={() => setFormData({ ...formData, cliente_id: '' })}
            />

            <Select
              label="Tipo de Pago"
              value={formData.tipo_pago}
              onChange={(e) => setFormData({ ...formData, tipo_pago: e.target.value })}
              options={PAGO_TIPOS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            />
            <Input
              label="Fecha"
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
            />
          </div>

          <div className="border-t border-border/50 pt-4">
            <label htmlFor="buscar-pacas" className="block text-sm font-medium text-primary mb-2">
              Qué se vende
            </label>
            {/* ── LOS CUATRO CAMPOS DE LA PACA, PARA ESCOGER ──────────
                Aquí sólo había una caja de texto. Con sesenta productos
                distintos eso obliga a acordarse de cómo está escrito cada uno;
                un desplegable los enseña, y al lado dice cuántas unidades hay.

                Las listas se recuentan con los demás filtros puestos, así que
                ninguna opción ofrecida deja la tabla vacía. */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-2">
              {FILTROS_PRODUCTO.map((f) => (
                <div key={f.dim}>
                  <label htmlFor={`filtro-prod-${f.dim}`}
                    className="block text-[11px] font-medium text-muted mb-1">
                    {f.rotulo}
                  </label>
                  <BuscadorLista
                    id={`filtro-prod-${f.dim}`}
                    value={filtrosProd[f.dim] || ''}
                    onChange={(v) => ponerFiltroProd(f.dim, v)}
                    opcionVacia={f.todos}
                    placeholder={f.todos}
                    opciones={(facetasProd[f.dim] || []).map((o) => ({
                      value: o.valor,
                      label: o.valor,
                      detalle: `${o.unidades} disponible${o.unidades === 1 ? '' : 's'}`,
                    }))}
                    aria-label={f.rotulo}
                    anchoLista={260}
                    className="w-full px-2 py-2 rounded-lg border border-border bg-surface text-sm"
                  />
                </div>
              ))}
            </div>

            <input
              id="buscar-pacas"
              type="text"
              placeholder="O escribe parte del nombre"
              value={buscarPacas}
              onChange={(e) => setBuscarPacas(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-lg border border-border bg-surface text-primary placeholder-muted"
            />

            {/* Lo que hay puesto, con su × cada uno: con cuatro desplegables es
                fácil dejarse uno marcado y no entender por qué falta un
                producto que se sabe que está en la bodega. */}
            {(filtrosProdPuestos.length > 0 || buscarPacas) && (
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {filtrosProdPuestos.map((f) => (
                  <button
                    key={f.dim}
                    type="button"
                    onClick={() => ponerFiltroProd(f.dim, '')}
                    aria-label={`Quitar el filtro de ${f.dim}`}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs
                               bg-secondary/10 text-secondary font-medium hover:bg-secondary/20 capitalize"
                  >
                    {f.valor} <X size={12} aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setFiltrosProd({}); setBuscarPacas(''); }}
                  className="text-xs text-muted hover:text-primary underline underline-offset-2 px-2 py-1.5"
                >
                  Quitar todos
                </button>
              </div>
            )}
            <p className="text-xs text-muted mb-3" role="status" aria-live="polite">
              {productosCoincidentes.length === 0
                ? (buscarPacas
                    ? 'Ningún producto disponible coincide con la búsqueda.'
                    : 'No hay nada disponible en el inventario.')
                : `${productosCoincidentes.length} producto(s) con existencias${
                    productosCoincidentes.length > FILAS_PRODUCTOS_VISIBLES
                      ? ` — se muestran los primeros ${FILAS_PRODUCTOS_VISIBLES}; afina la búsqueda para ver el resto.`
                      : '.'
                  }`}
              {totalPacasDisponibles > pacasDisponibles.length &&
                ` (de ${totalPacasDisponibles} unidades en inventario)`}
            </p>

            <div className="max-h-72 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Productos disponibles. Escribe cuántas unidades se venden de cada uno.
                </caption>
                <thead className="bg-primary/5 sticky top-0">
                  <tr className="text-[11px] font-bold text-muted uppercase tracking-wider">
                    <th scope="col" className="px-2 py-2 text-center w-[11%]">Hay</th>
                    <th scope="col" className="px-3 py-2 text-left">Referencia</th>
                    <th scope="col" className="px-2 py-2 text-left w-[15%]">Calidad</th>
                    <th scope="col" className="px-2 py-2 text-center w-[13%]">Cantidad</th>
                    <th scope="col" className="px-2 py-2 text-right w-[18%]">Precio c/u</th>
                    <th scope="col" className="px-2 py-2 text-right w-[16%]">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {productosVisibles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted">
                        No hay productos disponibles que coincidan.
                      </td>
                    </tr>
                  )}
                  {productosVisibles.map(g => {
                    const elegido = grupoSel[claveStock(g.referencia, g.calidad)];
                    const cant = parseInt(elegido?.cantidad, 10) || 0;
                    const precio = parseMonto(elegido?.precio);
                    const etiqueta = `${g.referencia}${g.calidad ? ' / ' + g.calidad : ''}`;
                    return (
                      <tr key={claveStock(g.referencia, g.calidad)} className={cant > 0 ? 'bg-secondary/10' : ''}>
                        <td className="px-2 py-2 text-center font-mono text-xs text-muted tabular-nums">
                          {g.disponibles}
                        </td>
                        <td className="px-3 py-2 text-primary">{g.referencia}</td>
                        <td className="px-2 py-2 text-muted">{g.calidad || '—'}</td>
                        <td className="px-2 py-2">
                          {/* Tope en `max`: pedir más de lo que hay lo rechazaría
                              el servidor al final, cuando ya se eligió cliente,
                              fecha y seis productos más. */}
                          <input
                            type="number"
                            min="0"
                            max={g.disponibles}
                            step="1"
                            inputMode="numeric"
                            value={elegido?.cantidad ?? ''}
                            onChange={(e) => setCantidad(g, e.target.value)}
                            placeholder="0"
                            aria-label={`Cuántas unidades de ${etiqueta} se venden`}
                            className="w-full px-2 py-2 rounded border border-border bg-surface text-primary text-center font-mono tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          {cant > 0 ? (
                            <>
                              <CampoMonto
                                value={elegido?.precio ?? ''}
                                onChange={(e) => setPrecioGrupo(g, e.target.value)}
                                aria-label={`Precio de venta de ${etiqueta}`}
                                className="w-full text-right px-2 py-2 rounded border border-border bg-surface text-primary tabular-nums"
                              />
                              {/* El grupo mezcla precios: la casilla nace VACÍA y
                                  se dice por qué. Proponer uno de los dos sería
                                  cobrar un precio que nadie escribió. */}
                              {g.mezclado && (
                                <p className="text-[9px] mt-0.5 leading-none text-warning font-semibold">
                                  precios distintos
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-muted tabular-nums">
                              {g.precio != null ? formatCurrency(g.precio) : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-semibold text-secondary tabular-nums">
                          {cant > 0 && precio > 0
                            ? formatCurrency(cant * precio)
                            : <span className="text-muted/40">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── DESCUENTO, FLETE Y NOTA ─────────────────────────────
              Lo mismo que lleva una cotización, porque es lo mismo que pasa en
              el mostrador. Sin esto, para dar un descuento había que bajarle el
              precio a cada paca a mano, y después nadie sabía si ese precio era
              el de verdad o el ya rebajado: se perdía cuánto se había rebajado
              y sobre qué. */}
          <div className="border-t border-border/50 pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="venta-tipo-descuento" className="block text-xs font-medium text-muted mb-1">
                  Tipo de descuento
                </label>
                <Select
                  id="venta-tipo-descuento"
                  value={tipoDescuentoVenta}
                  onChange={(e) => { setTipoDescuentoVenta(e.target.value); setDescuentoVenta(''); }}
                  options={[
                    { value: 'valor_fijo', label: 'Valor por paca' },
                    { value: 'porcentaje', label: '% Porcentaje' },
                  ]}
                />
              </div>
              <div>
                <label htmlFor="venta-descuento" className="block text-xs font-medium text-muted mb-1">
                  {tipoDescuentoVenta === 'porcentaje' ? 'Descuento (%)' : 'Descuento por paca'}
                </label>
                {/* CampoMonto para el valor y un number para el porcentaje: un
                    «10» con separador de miles no es un 10 por ciento. */}
                {tipoDescuentoVenta === 'porcentaje' ? (
                  <input
                    id="venta-descuento"
                    type="number" min="0" max="100" step="0.5" inputMode="decimal"
                    value={descuentoVenta}
                    onChange={(e) => setDescuentoVenta(e.target.value)}
                    placeholder="Ej: 10"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                  />
                ) : (
                  <CampoMonto
                    id="venta-descuento"
                    value={descuentoVenta}
                    onChange={(e) => setDescuentoVenta(e.target.value)}
                    placeholder="Ej: 100.000"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                  />
                )}
              </div>
              <div>
                <label htmlFor="venta-flete" className="block text-xs font-medium text-muted mb-1">
                  Flete por paca
                </label>
                <CampoMonto
                  id="venta-flete"
                  value={fleteUnitario}
                  onChange={(e) => setFleteUnitario(e.target.value)}
                  placeholder="Ej: 95.000"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                />
              </div>
            </div>

            <div className="mt-3">
              <label htmlFor="venta-notas" className="block text-xs font-medium text-muted mb-1">
                Nota (opcional)
              </label>
              <input
                id="venta-notas"
                type="text"
                value={notasVenta}
                onChange={(e) => setNotasVenta(e.target.value)}
                placeholder="Lo que haga falta recordar de esta venta"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary placeholder-muted"
              />
            </div>

            {/* EL AVISO DE LA PROMOCIÓN. Si se pone un descuento y alguna paca
                está en promoción, esa no lo recibe —la promoción YA es el
                precio rebajado— y hay que decirlo, o el total parece mal
                calculado. */}
            {cuentasVenta.enPromocion > 0 && cuentasVenta.descuento > 0 && (
              <p className="text-xs text-warning mt-2">
                {cuentasVenta.enPromocion === 1
                  ? 'Una paca está en promoción y no recibe el descuento'
                  : `${cuentasVenta.enPromocion} pacas están en promoción y no reciben el descuento`}:
                la promoción ya es el precio rebajado.
              </p>
            )}
          </div>

          {/* ── EL TOTAL, DESGLOSADO ────────────────────────────────
              Las cuatro cifras y no sólo la última: con un descuento y un flete
              dentro, un total a secas no se puede comprobar, y es la cifra que
              se le va a cobrar a alguien. Las líneas que valen cero no se
              pintan, para que el caso normal siga siendo una sola línea. */}
          <div className="p-4 bg-primary/5 rounded-lg space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">
                Subtotal ({gruposElegidos.length} producto{gruposElegidos.length === 1 ? '' : 's'}
                {', '}{cuentasVenta.unidades} unidad{cuentasVenta.unidades === 1 ? '' : 'es'})
              </span>
              <span className="text-primary tabular-nums">{formatCurrency(cuentasVenta.subtotal)}</span>
            </div>

            {cuentasVenta.descuento > 0 && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">
                  Descuento
                  {tipoDescuentoVenta === 'porcentaje'
                    ? ` (${parseMonto(descuentoVenta)}% por paca)`
                    : ` (${formatCurrency(parseMonto(descuentoVenta))} por paca)`}
                </span>
                <span className="text-error tabular-nums">−{formatCurrency(cuentasVenta.descuento)}</span>
              </div>
            )}

            {cuentasVenta.fleteTotal > 0 && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">
                  Flete ({formatCurrency(cuentasVenta.fleteUnit)} × {cuentasVenta.unidades})
                </span>
                <span className="text-primary tabular-nums">+{formatCurrency(cuentasVenta.fleteTotal)}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/50">
              <span className="text-sm font-medium text-primary">Total</span>
              <span className="text-xl font-display text-primary tabular-nums" aria-live="polite">
                {formatCurrency(totalVenta)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Confirmar Venta'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── CORREGIR UNA VENTA ───────────────────────────────────────
          Enseña el antes y el después de cada precio y del total, porque lo que
          se está moviendo es la deuda de un cliente y la cifra tiene que verse
          antes de guardar, no después. */}
      <Modal
        isOpen={Boolean(corrigiendo)}
        onClose={() => setCorrigiendo(null)}
        title={corrigiendo ? `Corregir la venta de ${nombreDeVenta(corrigiendo.venta)}` : 'Corregir venta'}
        size="lg"
      >
        {corrigiendo && (
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Se puede cambiar el precio de cada paca, la fecha y la forma de pago.
              Para cambiar <strong>qué</strong> se vendió hay que borrar la venta y volver a
              hacerla, porque eso mueve pacas del inventario. Queda escrito quién corrigió y qué cambió.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="corregir-fecha" className="block text-xs font-medium text-muted mb-1">
                  Fecha
                </label>
                <input
                  id="corregir-fecha"
                  type="date"
                  value={corrigiendo.fecha}
                  onChange={(e) => setCorrigiendo((c) => ({ ...c, fecha: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary"
                />
              </div>
              <div>
                <label htmlFor="corregir-pago" className="block text-xs font-medium text-muted mb-1">
                  Forma de pago
                </label>
                <Select
                  id="corregir-pago"
                  value={corrigiendo.tipo_pago}
                  onChange={(e) => setCorrigiendo((c) => ({ ...c, tipo_pago: e.target.value }))}
                  options={PAGO_TIPOS.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                />
              </div>
            </div>

            {/* El atajo del caso que lo pidió: el descuento de 100.000 por paca.
                Restar lo mismo a mano en seis casillas es seis ocasiones de
                equivocarse. */}
            <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl bg-primary/5">
              <div className="flex-1 min-w-[180px]">
                <label htmlFor="corregir-precios-todas" className="block text-xs font-medium text-muted mb-1">
                  Corregir el precio de todas
                </label>
                <CampoMonto
                  id="corregir-precios-todas"
                  value={descuentoPorPaca}
                  onChange={(e) => setDescuentoPorPaca(e.target.value)}
                  placeholder="100.000"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                />
              </div>
              <Button type="button" variant="outline" onClick={aplicarDescuentoATodas}>
                Bajar a las {corrigiendo.items.length}
              </Button>
              {/* ESTO NO ES EL DESCUENTO, Y HAY QUE DECIRLO. Baja el PRECIO de
                  cada paca, que es lo que se hace cuando el precio estaba mal
                  escrito. Para un descuento está su casilla, abajo: así queda
                  escrito cuánto se rebajó y sobre qué, en vez de desaparecer
                  dentro de los precios. */}
              <p className="w-full text-[11px] text-muted">
                Baja el <strong>precio</strong> de cada paca, para cuando el precio estaba mal.
                Si lo que falta es un <strong>descuento</strong>, usa su casilla de abajo: así queda
                escrito cuánto se rebajó.
              </p>
            </div>

            {/* ── DESCUENTO Y FLETE, LO MISMO QUE AL CREAR ──────────
                Es el caso que pidió todo esto: «le hizo falta colocar el
                descuento de 100.000 cada una». Aquí tiene su sitio propio, así
                que queda escrito cuánto se rebajó y sobre qué, en vez de
                desaparecer dentro de los precios de las pacas. */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="corregir-tipo-desc" className="block text-xs font-medium text-muted mb-1">
                  Tipo de descuento
                </label>
                <Select
                  id="corregir-tipo-desc"
                  value={corrigiendo.tipo_descuento}
                  onChange={(e) => setCorrigiendo((c) => ({ ...c, tipo_descuento: e.target.value, descuento: '' }))}
                  options={[
                    { value: 'valor_fijo', label: 'Valor por paca' },
                    { value: 'porcentaje', label: '% Porcentaje' },
                  ]}
                />
              </div>
              <div>
                <label htmlFor="corregir-desc" className="block text-xs font-medium text-muted mb-1">
                  {corrigiendo.tipo_descuento === 'porcentaje' ? 'Descuento (%)' : 'Descuento por paca'}
                </label>
                {corrigiendo.tipo_descuento === 'porcentaje' ? (
                  <input
                    id="corregir-desc"
                    type="number" min="0" max="100" step="0.5" inputMode="decimal"
                    value={corrigiendo.descuento}
                    onChange={(e) => setCorrigiendo((c) => ({ ...c, descuento: e.target.value }))}
                    placeholder="Ej: 10"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                  />
                ) : (
                  <CampoMonto
                    id="corregir-desc"
                    value={corrigiendo.descuento}
                    onChange={(e) => setCorrigiendo((c) => ({ ...c, descuento: e.target.value }))}
                    placeholder="Ej: 100.000"
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                  />
                )}
              </div>
              <div>
                <label htmlFor="corregir-flete" className="block text-xs font-medium text-muted mb-1">
                  Flete por paca
                </label>
                <CampoMonto
                  id="corregir-flete"
                  value={corrigiendo.flete}
                  onChange={(e) => setCorrigiendo((c) => ({ ...c, flete: e.target.value }))}
                  placeholder="Ej: 95.000"
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary tabular-nums"
                />
              </div>
            </div>

            <div>
              <label htmlFor="corregir-notas" className="block text-xs font-medium text-muted mb-1">
                Nota (opcional)
              </label>
              <input
                id="corregir-notas"
                type="text"
                value={corrigiendo.notas}
                onChange={(e) => setCorrigiendo((c) => ({ ...c, notas: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-primary placeholder-muted"
              />
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <caption className="sr-only">Las pacas de la venta y su precio</caption>
                <thead className="bg-primary/5">
                  <tr className="text-[11px] font-bold text-muted uppercase tracking-wider">
                    <th scope="col" className="px-3 py-2 text-left">Paca</th>
                    <th scope="col" className="px-3 py-2 text-right w-32">Antes</th>
                    <th scope="col" className="px-3 py-2 text-right w-40">Ahora</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {corrigiendo.items.map((i) => {
                    const ahora = parseMonto(i.precio);
                    const cambio = Math.round(ahora) !== Math.round(i.precio_original);
                    return (
                      <tr key={i.paca_id} className={cambio ? 'bg-secondary/5' : ''}>
                        <td className="px-3 py-2 text-primary capitalize">{i.producto || `Paca ${i.paca_id}`}</td>
                        <td className="px-3 py-2 text-right text-muted tabular-nums">
                          {formatCurrency(i.precio_original)}
                        </td>
                        <td className="px-3 py-2">
                          <CampoMonto
                            value={i.precio}
                            onChange={(e) => cambiarPrecioCorreccion(i.paca_id, e.target.value)}
                            aria-label={`Precio de ${i.producto || i.paca_id}`}
                            className="w-full text-right px-2 py-2 rounded border border-border bg-surface text-primary tabular-nums"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {/* EL PIE ES EL SUBTOTAL, NO EL TOTAL. Con un descuento y un
                      flete por debajo, poner «Total» en la suma de las pacas
                      seria el numero equivocado con el rotulo mas convincente. */}
                  <tr className="bg-primary/5 font-semibold">
                    <td className="px-3 py-2 text-muted uppercase text-[11px] tracking-wider">Subtotal</td>
                    <td className="px-3 py-2 text-right text-muted tabular-nums">
                      {formatCurrency(parseMonto(corrigiendo.venta.subtotal) || totalOriginalCorreccion)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-primary">
                      {formatCurrency(cuentasCorreccion.subtotal)}
                    </td>
                  </tr>
                  {cuentasCorreccion.descuento > 0 && (
                    <tr>
                      <td className="px-3 py-2 text-muted" colSpan={2}>
                        Descuento
                        {corrigiendo.tipo_descuento === 'porcentaje'
                          ? ` (${parseMonto(corrigiendo.descuento)}% por paca)`
                          : ` (${formatCurrency(parseMonto(corrigiendo.descuento))} por paca)`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-error">
                        −{formatCurrency(cuentasCorreccion.descuento)}
                      </td>
                    </tr>
                  )}
                  {cuentasCorreccion.fleteTotal > 0 && (
                    <tr>
                      <td className="px-3 py-2 text-muted" colSpan={2}>
                        Flete ({formatCurrency(cuentasCorreccion.fleteUnit)} × {cuentasCorreccion.unidades})
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary">
                        +{formatCurrency(cuentasCorreccion.fleteTotal)}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-primary/5 font-bold border-t border-border">
                    <td className="px-3 py-2 text-primary uppercase text-[11px] tracking-wider">Total</td>
                    <td className="px-3 py-2 text-right text-muted tabular-nums">
                      {formatCurrency(totalOriginalCorreccion)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-secondary">
                      {formatCurrency(totalCorreccion)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* LA DIFERENCIA, DICHA EN VOZ ALTA. Es lo que va a cambiar en la
                cartera del cliente, y es el número que hay que mirar. */}
            {Math.round(totalCorreccion) !== Math.round(totalOriginalCorreccion) && (
              <p className="text-sm font-semibold text-primary">
                La deuda de {nombreDeVenta(corrigiendo.venta)}{' '}
                {totalCorreccion < totalOriginalCorreccion ? 'baja' : 'sube'}{' '}
                {formatCurrency(Math.abs(totalCorreccion - totalOriginalCorreccion))}.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setCorrigiendo(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={guardarCorreccion}
                disabled={guardandoCorreccion
                  || Math.round(totalCorreccion) === Math.round(totalOriginalCorreccion)}
              >
                {guardandoCorreccion ? 'Guardando…' : 'Guardar la corrección'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Despacho Post-Venta */}
      <Modal isOpen={despachoModalOpen} onClose={() => { setDespachoModalOpen(false); setGrupoSel({}); }} title="Comprobante de Venta" size="lg">
        {despachoData && (
          <div className="space-y-6">
            {/* Encabezado */}
            <div className="text-center border-b pb-4">
              <h2 className="text-xl font-bold text-primary">Comercio Global Logístico</h2>
              <p className="text-sm text-muted">Comprobante de Venta</p>
              <p className="text-xs text-muted">Folio: {despachoData.uuid?.slice(0, 8).toUpperCase()}</p>
            </div>

            {/* Datos de la venta */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted">Cliente</p>
                <p className="font-medium">{despachoData.cliente?.nombre || 'Cliente'}</p>
              </div>
              <div>
                <p className="text-muted">Fecha</p>
                <p className="font-medium">{formatDate(despachoData.fecha)}</p>
              </div>
              <div>
                <p className="text-muted">Tipo de Pago</p>
                <p className="font-medium">{despachoData.tipo_pago === 'contado' ? 'Contado' : 'Crédito'}</p>
              </div>
              <div>
                <p className="text-muted">Total</p>
                <p className="font-bold text-lg text-primary">{formatCurrency(despachoData.total)}</p>
              </div>
            </div>

            {/* Detalle de pacas */}
            <div>
              <h3 className="font-medium text-sm text-muted mb-2">Detalle de Productos</h3>
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Pacas incluidas en la venta</caption>
                <thead className="bg-primary/5">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left">Clasificación</th>
                    <th scope="col" className="px-3 py-2 text-left">Referencia</th>
                    <th scope="col" className="px-3 py-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {despachoData.pacas.map((paca, i) => (
                    <tr key={paca.id ?? i} className="border-b border-border/50">
                      <td className="px-3 py-2 text-primary">{paca.clasificacion}</td>
                      <td className="px-3 py-2 text-muted">{paca.referencia}</td>
                      <td className="px-3 py-2 text-right font-medium text-primary whitespace-nowrap">{formatCurrency(paca.precio_venta)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={2} className="px-3 py-2 text-right">Total:</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatCurrency(despachoData.total)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>

            {/* Botones de descarga. Si la generación falla (jsPDF/ExcelJS pueden
                lanzar), sin este catch el botón simplemente no respondía. */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button
                onClick={async () => {
                  try { await comprobanteExcelDeVenta(despachoData); }
                  catch (err) { addToast(mensajeDeError(err, 'generar el Excel'), 'error'); }
                }}
                variant="secondary"
                className="flex-1"
              >
                <FileSpreadsheet size={18} className="mr-2" aria-hidden="true" />
                Descargar Excel
              </Button>
              <Button
                onClick={() => {
                  try { descargarPDF(despachoData); }
                  catch (err) { addToast(mensajeDeError(err, 'generar el PDF'), 'error'); }
                }}
                variant="primary"
                className="flex-1"
              >
                <FileText size={18} className="mr-2" aria-hidden="true" />
                Descargar PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de Reserva desde Ventas */}
      <Modal isOpen={reservaModalOpen} onClose={() => setReservaModalOpen(false)} title="Reservar Paca(s)">
        <div className="space-y-4">
          <div className="p-4 bg-info/10 rounded-xl border border-info/20">
            <p className="text-sm text-muted">Pacas a reservar: {pacasSeleccionadas.length}</p>
            <p className="font-medium text-primary">
              {pacasSeleccionadas.slice(0, 3).map(p => p.clasificacion).join(', ')}
              {pacasSeleccionadas.length > 3 && ` + ${pacasSeleccionadas.length - 3} más`}
            </p>
            <p className="text-sm text-muted mt-1">Total: {formatCurrency(totalVenta)}</p>
          </div>

          {/* Selector de cliente con búsqueda para reserva */}
          <BuscadorCliente
            id="reserva-cliente"
            clientes={clientes}
            clienteId={reservaForm.cliente_id}
            onSelect={(c) => setReservaForm({ ...reservaForm, cliente_id: c.id.toString() })}
            onClear={() => setReservaForm({ ...reservaForm, cliente_id: '' })}
          />

          <Input
            label="Notas (opcional)"
            value={reservaForm.notas}
            onChange={(e) => setReservaForm({ ...reservaForm, notas: e.target.value })}
            placeholder="Observaciones de la reserva..."
          />

          <Select
            label="Días de validez"
            value={reservaForm.dias_expiracion}
            onChange={(e) => setReservaForm({ ...reservaForm, dias_expiracion: e.target.value })}
            options={[
              { value: 3, label: '3 días' },
              { value: 7, label: '7 días' },
              { value: 14, label: '14 días' },
              { value: 30, label: '30 días' }
            ]}
          />

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setReservaModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleCrearReserva} className="flex-1" disabled={!reservaForm.cliente_id}>
              Reservar {pacasSeleccionadas.length} paca(s)
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}