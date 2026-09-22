import { useEffect, useState, useMemo, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink, BuscadorLista } from '../components/common';
import { pacasApi, lotesApi, reservasApi, clientesApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { PACA_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Hash, Grid, List, ChevronRight, ChevronLeft, Package, Eye, Link, Download, Calendar, User, X } from 'lucide-react';
import ExcelJS from 'exceljs';
// El mínimo por línea sale del mismo helper que las hojas de Excel y el PDF:
// tres sitios calculándolo por su cuenta es como acaban enseñando cifras
// distintas del mismo inventario.
// formatCOP y no un Intl.NumberFormat propio: esta pantalla era la ÚNICA de las
// veinte que se formateaba el dinero a mano, y no salía igual. `style:'currency'`
// en es-CO mete un espacio duro («$ 1.500.000») y en algunos navegadores escribe
// «COP»; formatCOP da «$1.500.000». El mismo importe se veía distinto aquí que en
// Lista de Precios, que es la pantalla de al lado.
import { parseMonto, formatCOP } from '../lib/money';
// La promoción se resuelve con el MISMO helper que las hojas de Excel y el PDF.
// Tres sitios decidiendo por su cuenta qué precio vale es como acaban diciendo
// cifras distintas del mismo producto, que es justo lo que pasaba aquí.
import { costoDeLinea, promoDeLinea } from '../lib/entregables';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { hoy } from '../lib/fecha';
import { descargarExcel } from '../lib/descargar';

// La raya de una cabecera de tabla PEGAJOSA. Va como sombra interior y no como
// borde: un border-bottom lo pinta la TABLA, no la celda, asi que al despegarse
// la cabecera se queda clavado en su sitio y el encabezado flota sin linea.
// Mismo truco y mismo motivo que en Contenedores y en Separacion Masiva.
const RAYA_CABECERA = { boxShadow: 'inset 0 -1px 0 var(--color-border)' };

// El rotulo de las pacas que no tienen categoria. No es una categoria de
// verdad, asi que no se puede mandar al servidor como filtro: ese caso se
// resuelve aqui, sobre lo que ya llego.
const SIN_CATEGORIA = 'Sin categoría';

// ── LOS RÓTULOS DE LAS COLUMNAS, LARGOS Y CORTOS ──────────────────
//
// Doce columnas con nombres largos —«Clasificación», «Disponibles»,
// «Despachadas»— no caben en la tableta sin scroll horizontal, y con scroll
// horizontal se pierde de vista la referencia justo cuando se está leyendo su
// número. En corto caben todas de una vez.
//
// Se puede elegir, y se recuerda: en corto para trabajar, completo cuando hay
// alguien nuevo mirando la pantalla y «Clas.» no le dice nada. El nombre
// completo NO desaparece: viaja en el `title` y en el aria-label de cada
// cabecera, así que el lector de pantalla siempre lee la palabra entera.
const ROTULOS = {
  uuid:          ['UUID', 'UUID'],
  contenedor:    ['Contenedor', 'Cont.'],
  proveedor:     ['Proveedor', 'Prov.'],
  categoria:     ['Categoría', 'Cat.'],
  clasificacion: ['Clasificación', 'Clas.'],
  referencia:    ['Referencia', 'Ref.'],
  calidad:       ['Calidad', 'Cal.'],
  fisico:        ['Físico', 'Fis.'],
  separadas:     ['Separadas', 'Sep.'],
  disponibles:   ['Disponibles', 'Disp.'],
  despachadas:   ['Despachadas', 'Desp.'],
  precioHoy:     ['Precio hoy', 'Precio'],
  valorDisp:     ['Valor disp.', 'Valor'],
  peso:          ['Peso', 'Peso'],
  costo:         ['Costo', 'Costo'],
  precio:        ['Precio', 'Precio'],
  estadoCot:     ['Estado / Cotización', 'Estado'],
  acciones:      ['Acciones', 'Acc.'],
};

// ── LOS FILTROS SOBREVIVEN A UNA RECARGA ──────────────────────────
//
// Esta pantalla era la unica del sistema que los perdia: Cartera, Contenedores,
// Cotizaciones, Cuentas, Despachos, Faltantes y la Matriz ya guardan los suyos.
// Aqui, volver de mirar un contenedor con el enlace de la tabla te devolvia con
// la busqueda vacia, sin estado, sin categoria, en la pagina 1 y en la vista
// que no era. En sessionStorage y no en localStorage a proposito: un filtro es
// de la sesion de trabajo de hoy, no una preferencia para siempre.
const CLAVE_FILTROS = 'inventario.filtros.v1';

const leerFiltros = () => {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_FILTROS)) || {}; }
  catch { return {}; }   // ventana privada, permisos de sitio: se sigue sin filtros
};

// La cabecera de una columna: abreviada o entera segun el interruptor, pero el
// nombre completo NUNCA se pierde —viaja en el `title` y, para quien usa lector
// de pantalla, en un texto oculto—.
//
// Declarado FUERA del cuerpo de Pacas a proposito: dentro, React lo veria como
// un tipo nuevo en cada render y reharía las celdas. Es el mismo cuidado que
// pide SelectCatalogo en Contenedores.
function CabeceraColumna({ col, className, cortos, raya = false }) {
  const [largo, corto] = ROTULOS[col];
  const texto = cortos ? corto : largo;
  return (
    <th scope="col" className={className} style={raya ? RAYA_CABECERA : undefined}
        title={texto === largo ? undefined : largo}>
      {texto}
      {texto !== largo && <span className="sr-only"> ({largo})</span>}
    </th>
  );
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function Pacas() {
  const [pacas, setPacas] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(() => leerFiltros().pagina || 1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  // Cuantas unidades hay DE VERDAD con los filtros puestos. El backend ya lo
  // mandaba en `total` y se tiraba a la basura, asi que la cabecera contaba las
  // filas de la pagina. null mientras no se sepa: mejor sin subtitulo que con
  // un numero que no es el que dice ser.
  const [totalUnidades, setTotalUnidades] = useState(null);
  const [limite, setLimite] = useState(() => leerFiltros().limite || 50);
  const [search, setSearch] = useState(() => leerFiltros().search || '');
  const [filtroEstado, setFiltroEstado] = useState(() => leerFiltros().estado || '');
  const [filtroTipo, setFiltroTipo] = useState(() => leerFiltros().tipo || '');
  const [filtroCategoria, setFiltroCategoria] = useState(() => leerFiltros().categoria || '');
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [clientes, setClientes] = useState([]);
  const [reservaForm, setReservaForm] = useState({ cliente_id: '', notas: '', dias_expiracion: 7 });
  const [selectedPaca, setSelectedPaca] = useState(null);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    clasificacion: '', referencia: '', calidad: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1, lote_id: ''
  });
  const [vistaAgrupada, setVistaAgrupada] = useState(() => leerFiltros().agrupada ?? true);
  // Arranca en corto: es como se usa a diario, y es lo que hace que quepan las
  // doce columnas sin salirse.
  const [rotulosCortos, setRotulosCortos] = useState(() => leerFiltros().cortos ?? true);
  const [inventarioAgrupado, setInventarioAgrupado] = useState([]);
  const [loadingAgrupado, setLoadingAgrupado] = useState(false);
  // Modal "por quién están separadas"
  const [comprometidas, setComprometidas] = useState(null); // { label, loading, rows }
  const { tipos: tiposRaw, categorias: categoriasRaw, calidades: calidadesRaw, temporadas: temporadasRaw } = useCatalog();
  const tiposList      = tiposRaw.map(t => t.nombre);
  const categoriasList = categoriasRaw.map(c => c.nombre);
  const calidadesList  = calidadesRaw.map(c => c.nombre);
  const temporadasList = temporadasRaw.map(t => t.nombre);
  const { addToast } = useToast();
  const confirm = useConfirm();
  
  // Buscador cliente en modal reserva
  const [busquedaClienteReserva, setBusquedaClienteReserva] = useState('');
  const [showListaClientesReserva, setShowListaClientesReserva] = useState(false);
  const clienteReservaListRef = useRef(null);
  // Contenedor del desplegable de resultados. Hace falta para mover el foco con
  // las flechas: el input se anuncia como combobox con aria-autocomplete="list",
  // así que el lector de pantalla le dice al usuario que use las flechas. Sin
  // este manejo las flechas no hacían nada y Escape cerraba el modal entero
  // (perdiendo el formulario) en lugar de cerrar solo la lista.
  const listaClientesReservaRef = useRef(null);

  // Mueve el foco entre las opciones del desplegable de clientes.
  const moverFocoOpcionCliente = (desde, delta) => {
    const opciones = Array.from(
      listaClientesReservaRef.current?.querySelectorAll('[role="option"]') || []
    );
    if (opciones.length === 0) return;
    const actual = desde === null ? -1 : opciones.indexOf(desde);
    const siguiente = actual + delta;
    if (siguiente < 0) {
      document.getElementById('reserva-buscar-cliente')?.focus();
      return;
    }
    opciones[Math.min(siguiente, opciones.length - 1)].focus();
  };

  const debouncedSearch = useDebounce(search, 300);

  // Firma de los filtros. Antes había DOS efectos encadenados sobre los mismos
  // filtros: uno hacía setPagina(1) y otro cargaba los datos con `pagina` entre
  // sus dependencias. Estando en la página 3, cambiar un filtro disparaba una
  // carga con la página VIEJA y acto seguido otra con la página 1: quedaban dos
  // peticiones en vuelo y la tabla se quedaba con la que respondiera de última,
  // que podía ser la obsoleta. Ahora el reset ocurre dentro del mismo efecto,
  // antes de pedir nada, y cada carga descarta su respuesta si ya no es la
  // vigente (bandera de cancelación por número de carga).
  const filtrosKey = `${filtroEstado}|${filtroTipo}|${filtroCategoria}|${debouncedSearch}|${limite}`;

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_FILTROS, JSON.stringify({
        search, estado: filtroEstado, tipo: filtroTipo, categoria: filtroCategoria,
        pagina, limite, agrupada: vistaAgrupada, cortos: rotulosCortos,
      }));
    } catch { /* sin memoria de sesion se sigue funcionando igual */ }
  }, [search, filtroEstado, filtroTipo, filtroCategoria, pagina, limite, vistaAgrupada, rotulosCortos]);
  const filtrosPrevRef  = useRef(filtrosKey);
  const cargaPacasRef    = useRef(0);
  const cargaAgrupadoRef = useRef(0);

  useEffect(() => {
    if (filtrosPrevRef.current !== filtrosKey) {
      filtrosPrevRef.current = filtrosKey;
      if (pagina !== 1) {
        setPagina(1); // este mismo efecto se vuelve a ejecutar ya con la página 1
        return;       // y así no se pide nada con la página vieja
      }
    }
    loadPacas();
  }, [filtrosKey, pagina]);

  useEffect(() => {
    loadInventarioAgrupado();
  }, [filtroEstado, filtroTipo, filtroCategoria, debouncedSearch]);

  useEffect(() => {
    loadLotes();
    loadClientes();
  }, []);

  const loadInventarioAgrupado = async () => {
    const miCarga = ++cargaAgrupadoRef.current;
    try {
      setLoadingAgrupado(true);
      const params = {};
      if (filtroEstado)    params.estado = filtroEstado;
      if (filtroTipo)      params.tipo   = filtroTipo;
      if (debouncedSearch) params.buscar = debouncedSearch;
      // La categoria se filtraba SOLO en el navegador y solo sobre la tabla
      // agrupada: el chip decia "Filtrado por: Verano", cambiabas a Lista y
      // salia todo, y el Excel se descargaba entero. Lo que se descarga tiene
      // que ser lo que se ve.
      if (filtroCategoria && filtroCategoria !== SIN_CATEGORIA) params.categoria = filtroCategoria;
      const data = await pacasApi.getInventario(params);
      if (miCarga !== cargaAgrupadoRef.current) return; // respuesta vieja: ya hay otra carga en curso
      setInventarioAgrupado(data);
    } catch (err) {
      console.error(err);
    } finally {
      // El spinner lo apaga solo la carga vigente; si no, una respuesta vieja
      // apagaría el indicador mientras la buena sigue viajando.
      if (miCarga === cargaAgrupadoRef.current) setLoadingAgrupado(false);
    }
  };

  // Abre el modal con las pacas separadas de un grupo y a quién pertenecen.
  const verComprometidas = async (row) => {
    const label = [row.clasificacion, row.referencia, row.calidad].filter(Boolean).join(' / ');
    setComprometidas({ label, loading: true, rows: [] });
    try {
      const rows = await pacasApi.getComprometidas({
        clasificacion: row.clasificacion || '',
        referencia: row.referencia || '',
        calidad: row.calidad || '',
        ...(row.contenedor_id ? { contenedor_id: row.contenedor_id } : {}),
      });
      setComprometidas({ label, loading: false, rows: Array.isArray(rows) ? rows : [] });
    } catch (err) {
      addToast('No se pudo cargar la lista', 'error');
      setComprometidas(null);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clienteReservaListRef.current && !clienteReservaListRef.current.contains(e.target)) {
        setShowListaClientesReserva(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── DESPUES DE CAMBIAR ALGO SE RECARGAN LAS DOS VISTAS ─────────
  //
  // Todas las acciones (crear, editar, borrar, reservar, asignar lote) llamaban
  // SOLO a loadPacas(), que alimenta la vista Lista. Pero la vista por defecto
  // es la Agrupada, y las tarjetas de resumen se calculan sobre ella: borrabas
  // una unidad y la tabla y las tarjetas seguian contandola; reservabas una
  // paca y seguia figurando como disponible. Numeros falsos justo despues de
  // que el usuario hiciera algo, y solo se arreglaban recargando la pagina.
  const recargarInventario = () => { loadPacas(); loadInventarioAgrupado(); };

  const loadPacas = async () => {
    const miCarga = ++cargaPacasRef.current;
    try {
      setLoading(true);
      const params = { pagina, limite };
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroTipo) params.tipo = filtroTipo;
      if (debouncedSearch) params.buscar = debouncedSearch;
      if (filtroCategoria && filtroCategoria !== SIN_CATEGORIA) params.categoria = filtroCategoria;

      // Las tarjetas de resumen se calculan sobre el inventario agrupado, así que
      // ya no hace falta pedir /pacas/resumen en cada carga.
      const data = await pacasApi.getAll(params);

      if (miCarga !== cargaPacasRef.current) return; // respuesta vieja: la descartamos
      setPacas(data.data || data);
      if (typeof data.total === 'number') setTotalUnidades(data.total);
      // `if (data.total_paginas)` dejaba el valor VIEJO cuando la busqueda no
      // devolvia nada: Math.ceil(0/50) es 0, que es falsy. Se quedaba "Pagina 1
      // de 7" bajo una tabla vacia, con "Siguiente" activo, y pulsarlo llevaba a
      // la pagina 2 igual de vacia. Sin resultados hay UNA pagina, la vacia.
      if (typeof data.total_paginas === 'number') setTotalPaginas(Math.max(1, data.total_paginas));
    } catch (err) {
      if (miCarga === cargaPacasRef.current) addToast(err.message, 'error');
    } finally {
      if (miCarga === cargaPacasRef.current) setLoading(false);
    }
  };

  const loadLotes = async () => {
    try {
      const data = await lotesApi.getAll();
      setLotes(data);
    } catch (err) {
      console.error(err);
    }
  };


  const loadClientes = async () => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const openReservaModal = (paca) => {
    setSelectedPaca(paca);
    setReservaForm({ cliente_id: '', notas: '', dias_expiracion: 7 });
    setReservaModalOpen(true);
  };

  const handleCreateReserva = async () => {
    if (!reservaForm.cliente_id) {
      addToast('Selecciona un cliente', 'error');
      return;
    }
    try {
      await reservasApi.create({
        cliente_id: parseInt(reservaForm.cliente_id),
        paca_id: selectedPaca.id,
        cantidad: 1,
        notas: reservaForm.notas,
        dias_expiracion: parseInt(reservaForm.dias_expiracion)
      });
      addToast('Reserva creada correctamente', 'success');
      setReservaModalOpen(false);
      recargarInventario();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        clasificacion: formData.clasificacion,
        referencia: formData.referencia,
        // LA CALIDAD FALTABA AQUÍ. El formulario la pedía, handleEdit la cargaba
        // y el estado la guardaba… y nunca se enviaba. Toda unidad creada desde
        // esta pantalla nacía con calidad NULL, con el aviso verde de "creada" y
        // sin un solo error. Y como la clave de stock es referencia|calidad y la
        // promoción cruza por calidad, esas pacas además no casaban con ninguna
        // promoción ni con su grupo del inventario. Al editar pasaba lo mismo:
        // se cambiaba la calidad, decía "Unidad actualizada" y no cambiaba nada.
        calidad: formData.calidad || null,
        categoria: formData.categoria || null,
        peso: parseFloat(formData.peso) || 0,
        // parseMonto y no parseFloat: la casilla entrega el número crudo, pero
        // si alguna vez entregara "1.500.000" parseFloat de eso es 1,5.
        costo_base: parseMonto(formData.costo_base),
        precio_venta: parseMonto(formData.precio_venta),
        notas: formData.notas,
        cantidad: parseInt(formData.cantidad) || 1
      };

      if (editando) {
        await pacasApi.update(editando.id, payload);
        addToast('Unidad actualizada', 'success');
      } else {
        const result = await pacasApi.create(payload);
        if (result.cantidad > 1) {
          addToast(`${result.cantidad} unidades creadas exitosamente`, 'success');
        } else {
          addToast('Unidad creada', 'success');
        }
      }

      setModalOpen(false);
      resetForm();
      recargarInventario();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEdit = (paca) => {
    setEditando(paca);
    setFormData({
      clasificacion: paca.clasificacion,
      referencia: paca.referencia,
      calidad: paca.calidad || '',
      categoria: paca.categoria || '',
      peso: paca.peso,
      costo_base: paca.costo_base,
      precio_venta: paca.precio_venta,
      notas: paca.notas || '',
      cantidad: 1
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar unidad?',
      // El backend hace DELETE de sus reservas y de sus lineas de cotizacion
      // (routes/pacas.js). El dialogo no lo decia, asi que borrar una paca
      // separada le quitaba la mercancia a un cliente sin que nadie lo supiera.
      message: 'La unidad será eliminada del inventario permanentemente.'
        + ' Si estaba separada o reservada, también se quitará de la cotización'
        + ' o de la reserva del cliente.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pacasApi.delete(id);
      recargarInventario();
      addToast('Unidad eliminada', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const openAssignModal = async (paca) => {
    setSelectedPaca(paca);
    setFormData(prev => ({ ...prev, lote_id: paca.lote_id || '' }));
    setAssignModalOpen(true);
  };

  const handleAssignLote = async () => {
    try {
      const loteId = formData.lote_id === '' ? null : formData.lote_id;
      await pacasApi.update(selectedPaca.id, { lote_id: loteId });
      addToast(loteId ? 'Paca asignada al lote' : 'Paca desasignada del lote', 'success');
      setAssignModalOpen(false);
      recargarInventario();
      loadLotes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const resetForm = () => {
    setEditando(null);
    setFormData({ clasificacion: '', referencia: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1 });
  };

  const [exporting, setExporting] = useState(false);

  // Lo que se descarga tiene que ser lo que se ve: estos dos se saltaban el
  // filtro de categoria, asi que con el chip "Filtrado por: Verano" puesto el
  // Excel salia con el inventario entero.
  const fetchInventarioActual = async () => {
    const params = { limite: 10000 };
    if (filtroEstado) params.estado = filtroEstado;
    if (filtroTipo) params.tipo = filtroTipo;
    if (debouncedSearch) params.buscar = debouncedSearch;
    if (filtroCategoria && filtroCategoria !== SIN_CATEGORIA) params.categoria = filtroCategoria;

    const res = await pacasApi.getAll(params);
    return res.data || res;
  };

  const fetchInventarioAgrupadoActual = async () => {
    const params = {};
    if (filtroEstado)    params.estado = filtroEstado;
    if (filtroTipo)      params.tipo   = filtroTipo;
    if (debouncedSearch) params.buscar = debouncedSearch;
    if (filtroCategoria && filtroCategoria !== SIN_CATEGORIA) params.categoria = filtroCategoria;
    const filas = await pacasApi.getInventario(params);
    // «Sin categoria» no es una categoria que el servidor pueda filtrar.
    return filtroCategoria === SIN_CATEGORIA
      ? filas.filter((r) => !(r.categoria || '').trim())
      : filas;
  };

  const exportarInventarioExcel = async () => {
    try {
      setExporting(true);
      const [datos, agrupado] = await Promise.all([
        fetchInventarioActual(),
        fetchInventarioAgrupadoActual(),
      ]);
      if (!datos.length && !agrupado.length) {
        addToast('No hay datos para exportar', 'warning');
        return;
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();

      // ── Hoja 1: Detallado (pacas individuales) ─────────────────
      const ws = wb.addWorksheet('Detallado');
      ws.properties.tabColor = { argb: '0f172a' };

      ws.columns = [
        { header: 'Clasificación',   key: 'clasificacion', width: 18 },
        { header: 'Referencia',     key: 'referencia', width: 14 },
        { header: 'Calidad',        key: 'calidad',    width: 12 },
        { header: 'Peso (kg)',       key: 'peso',       width: 11 },
        { header: 'Costo Base',     key: 'costo',      width: 16 },
        { header: 'Precio Venta',   key: 'precio',     width: 16 },
        { header: 'Contenedor',     key: 'contenedor', width: 18 },
        { header: 'Estado',         key: 'estado',     width: 13 },
        { header: 'Cotización',     key: 'cot_numero', width: 16 },
        { header: 'Cliente Reserva',key: 'cot_cliente',width: 22 },
        { header: 'Precio Cotizado',key: 'cot_precio', width: 16 },
        { header: 'Notas',          key: 'notas',      width: 28 },
      ];

      ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: '6366f1' } } };
      });
      ws.getRow(1).height = 22;

      const sepColor = 'FFF8E6';
      datos.forEach((p, idx) => {
        const isSep = p.estado === 'separada';
        const bg = isSep ? sepColor : (idx % 2 === 0 ? 'FFFFFF' : 'FAF9F7');
        const row = ws.addRow({
          clasificacion: p.clasificacion,
          referencia:    p.referencia,
          calidad:       p.calidad || '',
          peso:       parseFloat(p.peso) || 0,
          costo:      parseFloat(p.costo_base) || 0,
          precio:     parseFloat(p.precio_venta) || 0,
          contenedor: p.contenedor_numero || 'Sin contenedor',
          estado:     p.estado,
          cot_numero: isSep ? (p.cotizacion_numero || '') : '',
          cot_cliente:isSep ? (p.cotizacion_cliente || '') : '',
          cot_precio: isSep && p.cotizacion_precio ? parseFloat(p.cotizacion_precio) : '',
          notas:      p.notas || '',
        });
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'middle' };
        });
        if (isSep) {
          row.getCell('estado').font = { bold: true, color: { argb: 'B45309' }, size: 10 };
          row.getCell('cot_numero').font = { bold: true, color: { argb: 'B45309' }, size: 10 };
        }
        row.height = 18;
      });

      ws.getColumn('costo').numFmt = '$#,##0.00';
      ws.getColumn('precio').numFmt = '$#,##0.00';
      ws.getColumn('cot_precio').numFmt = '$#,##0.00';

      // ── Hoja 2: Agrupado (cantidades por tipo) ─────────────────
      const wsAg = wb.addWorksheet('Agrupado');
      wsAg.properties.tabColor = { argb: '6366f1' };

      wsAg.columns = [
        { header: 'Contenedor',     key: 'contenedor',     width: 18 },
        { header: 'Proveedor',      key: 'proveedor',      width: 18 },
        { header: 'Categoría',      key: 'categoria',      width: 14 },
        { header: 'Clasificación',  key: 'clasificacion',  width: 18 },
        { header: 'Referencia',     key: 'referencia',     width: 14 },
        { header: 'Calidad',        key: 'calidad',        width: 12 },
        // FISICO . SEPARADAS . DISPONIBLES, y DESPACHADAS al final: ese es el
        // orden de la resta que explica la diferencia, el mismo que usan las
        // hojas de entregables y ahora tambien la tabla de la pantalla. Con
        // DESPACHADAS en medio, la unica columna que NO participa en la resta
        // partia justo las tres que si lo hacen.
        { header: 'Físico',         key: 'fisico',         width: 10 },
        { header: 'Separadas',      key: 'separadas',      width: 11 },
        { header: 'Disponibles',    key: 'disponibles',    width: 12 },
        { header: 'Despachadas',    key: 'despachadas',    width: 12 },
        // «Costo Unit.» es el prorrateo del contenedor y sale IGUAL en todas
        // las filas del mismo contenedor por construcción: es correcto para
        // valorar el inventario, pero no distingue una referencia de otra. Por
        // eso al lado va «Mínimo Unit.», que sí cambia línea a línea. No se
        // sustituye el costo por el mínimo: el mínimo lleva la utilidad dentro
        // y usarlo para valorar el inventario lo inflaría.
        { header: 'Costo Unit.',    key: 'costo_unit',     width: 14 },
        { header: 'Mínimo Unit.',   key: 'minimo_unit',    width: 14 },
        { header: 'Precio Unit.',   key: 'precio_unit',    width: 14 },
        // La promocion vigente, al lado del precio de lista. Sin esta columna
        // el Excel del inventario decia un precio y la cotizacion cobraba otro.
        { header: 'Promo',          key: 'promo',          width: 14 },
        { header: 'Costo Total',    key: 'costo_total',    width: 16 },
        // Disponibles x el precio de HOY (promocion si la hay), igual que la
        // hoja INVENTARIO(INTERNO) de entregables y que la pantalla. Antes era
        // SUM(precio_venta) de todo el grupo, despachadas incluidas.
        { header: 'Valor disp.',    key: 'precio_total',   width: 16 },
      ];

      wsAg.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '6366f1' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: '0f172a' } } };
      });
      wsAg.getRow(1).height = 22;

      agrupado.forEach((row, idx) => {
        const bg = idx % 2 === 0 ? 'FFFFFF' : 'F5F3FF';
        const r = wsAg.addRow({
          contenedor:    row.contenedor,
          proveedor:     row.proveedor_nombre || '',
          categoria:     row.categoria || '',
          clasificacion: row.clasificacion,
          referencia:    row.referencia,
          calidad:       row.calidad || '',
          fisico:        parseInt(row.fisico) || 0,
          despachadas:   parseInt(row.despachadas) || 0,
          separadas:     parseInt(row.separadas) || 0,
          disponibles:   parseInt(row.disponibles) || 0,
          // Vacio, no cero, cuando el dato no esta: un cero en una columna de
          // dinero se lee como "vale cero", y eso el sistema no lo sabe.
          costo_unit:    Number.isFinite(parseFloat(row.costo_unitario)) ? parseFloat(row.costo_unitario) : '',
          minimo_unit:   costoDeLinea(row) || '',
          precio_unit:   Number.isFinite(parseFloat(row.precio_unitario)) ? parseFloat(row.precio_unitario) : '',
          promo:         promoDeLinea(row) ?? '',
          costo_total:   Number.isFinite(parseFloat(row.costo_total)) ? parseFloat(row.costo_total) : '',
          precio_total:  (() => {
            const d = parseInt(row.disponibles) || 0;
            const e = precioHoy(row);
            return d > 0 && e != null ? e * d : '';
          })(),
        });
        r.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'middle' };
        });
        r.getCell('disponibles').font = { bold: true, size: 10 };
        r.height = 18;
      });

      // Fila de total
      const totalFisico   = agrupado.reduce((s, r) => s + (parseInt(r.fisico) || 0), 0);
      const totalDisp     = agrupado.reduce((s, r) => s + (parseInt(r.disponibles) || 0), 0);
      const totalCosto    = agrupado.reduce((s, r) => s + (parseFloat(r.costo_total) || 0), 0);
      // El total valora lo DISPONIBLE al precio de hoy, que es lo que suman las
      // filas de arriba. Sumar `precio_total` del servidor daria otra cifra.
      const totalPrecio   = agrupado.reduce((s, r) => {
        const d = parseInt(r.disponibles) || 0;
        const e = precioHoy(r);
        return s + (d > 0 && e != null ? e * d : 0);
      }, 0);
      const totalRow = wsAg.addRow({
        contenedor: 'TOTAL', fisico: totalFisico, disponibles: totalDisp,
        costo_total: totalCosto, precio_total: totalPrecio,
      });
      totalRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      });

      wsAg.getColumn('costo_unit').numFmt   = '$#,##0.00';
      wsAg.getColumn('minimo_unit').numFmt  = '$#,##0.00';
      wsAg.getColumn('precio_unit').numFmt  = '$#,##0.00';
      wsAg.getColumn('promo').numFmt        = '$#,##0.00';
      wsAg.getColumn('costo_total').numFmt  = '$#,##0.00';
      wsAg.getColumn('precio_total').numFmt = '$#,##0.00';

      const buffer = await wb.xlsx.writeBuffer();
      descargarExcel(buffer, `Inventario_Pacas_${hoy()}.xlsx`);

      addToast('Excel exportado (Detallado + Agrupado)', 'success');
    } catch (err) {
      addToast('Error al exportar Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  const exportarInventarioPDF = async () => {
    try {
      setExporting(true);
      const [datos, agrupado] = await Promise.all([
        fetchInventarioActual(),
        fetchInventarioAgrupadoActual(),
      ]);
      if (!datos.length && !agrupado.length) {
        addToast('No hay datos para exportar', 'warning');
        return;
      }

      const doc = new jsPDF({ orientation: 'landscape' });

      // ── Encabezado ────────────────────────────────────────────
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Comercio Global Logístico — Inventario', 14, 18);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Fecha de reporte: ${new Date().toLocaleDateString('es-MX')}`, 14, 25);

      const totalPacas = datos.length;
      const totalFisico = agrupado.reduce((s, r) => s + (parseInt(r.fisico) || 0), 0);
      const totalDisp   = agrupado.reduce((s, r) => s + (parseInt(r.disponibles) || 0), 0);
      // Lo DISPONIBLE al precio de hoy. Antes esta linea ponia el conteo de
      // disponibles y, pegado, un "Valor" que era la suma de TODAS las pacas del
      // grupo, despachadas incluidas: se leia inevitablemente como el valor de
      // lo disponible, y no lo era.
      const totalPrecio = agrupado.reduce((s, r) => {
        const d = parseInt(r.disponibles) || 0;
        const e = precioHoy(r);
        return s + (d > 0 && e != null ? e * d : 0);
      }, 0);
      doc.text(`Pacas individuales: ${totalPacas}   ·   Físico: ${totalFisico}   ·   Disponibles: ${totalDisp}   ·   Valor de lo disponible: ${formatCurrency(totalPrecio)}`, 14, 31);

      // ── Sección 1: Vista Agrupada ─────────────────────────────
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('Vista Agrupada (inventario por tipo)', 14, 41);
      // Un asterisco sin leyenda es un misterio impreso.
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text('* precio de promoción vigente', 120, 41);
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');

      autoTable(doc, {
        startY: 45,
        // MISMO ORDEN QUE LA PANTALLA Y QUE EL EXCEL. Aqui las columnas
        // Separadas y Despachadas iban al reves que en los otros dos sitios:
        // quien comparara un PDF impreso con la pantalla leia el numero
        // equivocado y nada lo advertia.
        head: [['Contenedor', 'Proveedor', 'Clasificación', 'Referencia', 'Calidad', 'Físico', 'Separadas', 'Disponibles', 'Despachadas', 'Precio hoy', 'Valor disp.']],
        body: agrupado.map(r => {
          const d = parseInt(r.disponibles) || 0;
          const e = precioHoy(r);
          return [
            r.contenedor || 'Sin contenedor',
            r.proveedor_nombre || '—',
            r.clasificacion,
            r.referencia,
            r.calidad || '—',
            parseInt(r.fisico) || 0,
            parseInt(r.separadas) || 0,
            d,
            parseInt(r.despachadas) || 0,
            // La promocion gana, y si no hay precio se deja vacio.
            e != null ? formatCurrency(e) + (promoDeLinea(r) != null ? ' *' : '') : '',
            d > 0 && e != null ? formatCurrency(e * d) : '',
          ];
        }),
        foot: [[
          'TOTAL', '', '', '', '',
          totalFisico, '', totalDisp, '',
          '', formatCurrency(totalPrecio),
        ]],
        theme: 'striped',
        headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' },
          8: { halign: 'right', fontStyle: 'bold' },
          9: { halign: 'right' },
          10: { halign: 'right' },
        },
      });

      // ── Sección 2: Vista Detallada (pacas individuales) ───────
      doc.addPage();
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('Vista Detallada (pacas individuales)', 14, 18);

      autoTable(doc, {
        startY: 23,
        head: [['Clasificación', 'Referencia', 'Calidad', 'Peso', 'Costo', 'Precio Venta', 'Contenedor', 'Estado', 'Cotización']],
        body: datos.map(p => [
          p.clasificacion,
          p.referencia,
          p.calidad || '—',
          `${p.peso} kg`,
          formatCurrency(p.costo_base),
          formatCurrency(p.precio_venta),
          p.contenedor_numero || 'Sin contenedor',
          p.estado,
          p.estado === 'separada' ? (p.cotizacion_numero || '—') : '—',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
        didParseCell: (data) => {
          // Resaltar filas con estado "separada"
          if (data.section === 'body' && datos[data.row.index]?.estado === 'separada') {
            data.cell.styles.fillColor = [255, 248, 230];
          }
        },
      });

      doc.save(`Inventario_Pacas_${hoy()}.pdf`);
      addToast('PDF exportado (Agrupado + Detallado)', 'success');
    } catch (err) {
      addToast('Error al exportar PDF: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // El de la casa. Ver el comentario del import.
  const formatCurrency = formatCOP;

  // ── DINERO QUE FALTA SE DEJA VACÍO, NUNCA EN $ 0 ────────────────
  // `parseFloat(x) || 0` convertía un precio o un costo ausente en «$ 0», que se
  // lee como "esto no vale nada" y es una afirmación que el sistema no puede
  // hacer. Vacío dice lo único cierto: que ese dato no está. Es la misma regla
  // que ya cumple la columna «Mínimo Unit.» del Excel de esta pantalla.
  // ── EL PRECIO DE HOY DE UNA LINEA, o null si no tiene ──────────
  // La promocion gana sobre el precio de lista, igual que en Cotizaciones, en
  // la Lista de Precios y en el Excel de la MATRIZ. `precioDeLinea` de
  // entregables.js hace lo mismo pero cae a 0 cuando no hay precio, que en una
  // hoja pasa y en pantalla no: un $0 se lee como "esto no vale nada".
  const precioHoy = (row) => {
    const promo = promoDeLinea(row);
    if (promo != null) return promo;
    const lista = parseFloat(row?.precio_unitario);
    return Number.isFinite(lista) ? lista : null;
  };

  // `raya` solo la de la tabla agrupada, que es la que lleva cabecera pegada.
  const Rotulo      = (props) => <CabeceraColumna {...props} cortos={rotulosCortos} raya />;
  const RotuloLista = (props) => <CabeceraColumna {...props} cortos={rotulosCortos} />;

  const dineroOVacio = (valor) => {
    const n = parseFloat(valor);
    return Number.isFinite(n) ? formatCurrency(n) : '';
  };

  // ── Excel de separadas, con una hoja por cliente ──────────────────
  // Cada cliente ve solo lo suyo, agrupado por referencia y calidad, que es como
  // la bodega lo alista. La primera hoja resume cuánto tiene apartado cada uno.
  const exportarSeparadasPorCliente = async () => {
    const PRIMARY = '0f172a', WARNING = 'd97706', WHITE = 'ffffff', LIGHT = 'f1f5f9';
    try {
      // setExporting faltaba: el boton se declaraba `disabled={exporting}` y
      // esta funcion nunca lo encendia, asi que en tableta un doble toque
      // generaba dos libros y dos descargas.
      setExporting(true);
      addToast('Generando Excel de separadas…', 'info');
      const rows = await pacasApi.getComprometidas({});
      const separadas = (Array.isArray(rows) ? rows : []).filter(r => r.estado !== 'despachada');

      if (!separadas.length) {
        addToast('No hay unidades separadas en este momento', 'warning');
        return;
      }

      // cliente → referencia|calidad → cantidad
      const porCliente = new Map();
      for (const r of separadas) {
        const cliente = (r.cliente_nombre || 'Sin cliente asignado').trim();
        if (!porCliente.has(cliente)) porCliente.set(cliente, { total: 0, cotizaciones: new Set(), items: new Map() });
        const c = porCliente.get(cliente);
        c.total++;
        if (r.cotizacion_numero) c.cotizaciones.add(r.cotizacion_numero);
        const k = `${r.referencia || '—'}||${r.calidad || '—'}`;
        if (!c.items.has(k)) c.items.set(k, { referencia: r.referencia || '—', calidad: r.calidad || '—', cantidad: 0 });
        c.items.get(k).cantidad++;
      }

      const clientes = [...porCliente.entries()].sort((a, b) => b[1].total - a[1].total);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();

      // Hoja resumen
      const wr = wb.addWorksheet('Resumen');
      wr.properties.tabColor = { argb: WARNING };
      wr.columns = [{ width: 38 }, { width: 14 }, { width: 30 }];
      wr.mergeCells('A1:C1');
      const t = wr.getCell('A1');
      t.value = `UNIDADES SEPARADAS POR CLIENTE — ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`;
      t.font = { size: 13, bold: true, color: { argb: WHITE } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
      t.alignment = { horizontal: 'center', vertical: 'middle' };
      wr.getRow(1).height = 28;

      ['Cliente', 'Separadas', 'Cotizaciones'].forEach((h, i) => {
        const c = wr.getCell(3, i + 1);
        c.value = h;
        c.font = { bold: true, size: 10, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
        c.alignment = { horizontal: i === 1 ? 'center' : 'left', vertical: 'middle', indent: i === 1 ? 0 : 1 };
      });
      wr.getRow(3).height = 22;

      clientes.forEach(([nombre, data], i) => {
        const r = wr.getRow(4 + i);
        r.height = 20;
        const bg = i % 2 === 0 ? LIGHT : WHITE;
        [nombre, data.total, [...data.cotizaciones].join(', ') || '—'].forEach((v, ci) => {
          const c = r.getCell(ci + 1);
          c.value = v;
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          c.font = ci === 1 ? { bold: true, size: 11, color: { argb: WARNING } } : { size: 10, color: { argb: PRIMARY } };
          c.alignment = { horizontal: ci === 1 ? 'center' : 'left', vertical: 'middle', indent: ci === 1 ? 0 : 1 };
        });
      });

      const totRow = wr.getRow(4 + clientes.length);
      totRow.height = 24;
      totRow.getCell(1).value = `TOTAL — ${clientes.length} cliente(s)`;
      totRow.getCell(2).value = separadas.length;
      [1, 2, 3].forEach(ci => {
        const c = totRow.getCell(ci);
        c.font = { bold: true, size: 11, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
        c.alignment = { horizontal: ci === 2 ? 'center' : 'left', vertical: 'middle', indent: ci === 2 ? 0 : 1 };
      });

      // Una hoja por cliente
      const usados = new Set();
      clientes.forEach(([nombre, data]) => {
        // Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ]
        let base = nombre.replace(/[*?:/\\[\]]/g, ' ').slice(0, 28).trim() || 'Cliente';
        let hoja = base, n = 2;
        while (usados.has(hoja)) hoja = `${base.slice(0, 26)} ${n++}`;
        usados.add(hoja);

        const ws = wb.addWorksheet(hoja);
        ws.columns = [{ width: 6 }, { width: 32 }, { width: 20 }, { width: 14 }];

        ws.mergeCells('A1:D1');
        const th = ws.getCell('A1');
        th.value = nombre;
        th.font = { size: 13, bold: true, color: { argb: WHITE } };
        th.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
        th.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(1).height = 28;

        ws.mergeCells('A2:D2');
        ws.getCell('A2').value = data.cotizaciones.size
          ? `Cotización(es): ${[...data.cotizaciones].join(', ')}`
          : 'Sin cotización asociada';
        ws.getCell('A2').font = { size: 10, italic: true, color: { argb: '64748b' } };
        ws.getCell('A2').alignment = { horizontal: 'center' };

        ['#', 'Referencia', 'Calidad', 'Cantidad'].forEach((h, i) => {
          const c = ws.getCell(4, i + 1);
          c.value = h;
          c.font = { bold: true, size: 10, color: { argb: WHITE } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
          c.alignment = { horizontal: i === 0 || i === 3 ? 'center' : 'left', vertical: 'middle', indent: i === 1 || i === 2 ? 1 : 0 };
        });
        ws.getRow(4).height = 22;

        const items = [...data.items.values()].sort(
          (a, b) => a.referencia.localeCompare(b.referencia, 'es') || a.calidad.localeCompare(b.calidad, 'es')
        );
        items.forEach((it, i) => {
          const r = ws.getRow(5 + i);
          r.height = 22;
          const bg = i % 2 === 0 ? LIGHT : WHITE;
          [i + 1, it.referencia, it.calidad, it.cantidad].forEach((v, ci) => {
            const c = r.getCell(ci + 1);
            c.value = v;
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            c.font = ci === 3 ? { bold: true, size: 12, color: { argb: PRIMARY } } : { size: 10, color: { argb: PRIMARY } };
            c.alignment = { horizontal: ci === 0 || ci === 3 ? 'center' : 'left', vertical: 'middle', indent: ci === 1 || ci === 2 ? 1 : 0 };
          });
        });

        const tr = ws.getRow(5 + items.length);
        tr.height = 26;
        ws.mergeCells(`A${5 + items.length}:C${5 + items.length}`);
        tr.getCell(1).value = 'TOTAL SEPARADAS';
        tr.getCell(4).value = data.total;
        [1, 4].forEach(ci => {
          const c = tr.getCell(ci);
          c.font = { bold: true, size: 12, color: { argb: WHITE } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNING } };
          c.alignment = { horizontal: ci === 4 ? 'center' : 'right', vertical: 'middle', indent: ci === 4 ? 0 : 1 };
        });
        tr.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNING } };
        tr.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNING } };
      });

      const buffer = await wb.xlsx.writeBuffer();
      descargarExcel(buffer, `Separadas_por_cliente_${hoy()}.xlsx`);
      addToast(`${separadas.length} unidades separadas de ${clientes.length} cliente(s)`, 'success');
    } catch (err) {
      addToast('No se pudo generar el Excel: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Las tarjetas de arriba resumen por CATEGORÍA. Se calculan sobre el inventario
  // agrupado —que es lo mismo que muestra la tabla— y no sobre /pacas/resumen,
  // que viene paginado y agrupa por clasificación.
  const resumenCategorias = useMemo(() => {
    const acc = {};
    for (const row of inventarioAgrupado) {
      const key = (row.categoria || '').trim() || SIN_CATEGORIA;
      if (!acc[key]) acc[key] = { categoria: key, fisico: 0, disponibles: 0, separadas: 0, despachadas: 0 };
      acc[key].fisico      += parseInt(row.fisico) || 0;
      acc[key].disponibles += parseInt(row.disponibles) || 0;
      acc[key].separadas   += parseInt(row.separadas) || 0;
      acc[key].despachadas += parseInt(row.despachadas) || 0;
    }
    return Object.values(acc).sort((a, b) => b.fisico - a.fisico);
  }, [inventarioAgrupado]);

  // El filtro por categoría YA lo aplica el servidor, y por eso lo respetan
  // también la vista Lista y las exportaciones. Aquí sólo queda el caso de
  // «Sin categoría», que no es una categoría que se pueda pedir por nombre.
  const filasInventario = filtroCategoria === SIN_CATEGORIA
    ? inventarioAgrupado.filter(r => !(r.categoria || '').trim())
    : inventarioAgrupado;

  // `pacas` es la PÁGINA actual de /pacas (como mucho `limite` filas), así que
  // con 4.000 pacas y límite 50 la cabecera decía "50 unidades". Y en la vista
  // agrupada, que es la de por defecto, decía 50 mientras la tabla enseñaba otra
  // cosa. Ahora sale lo que de verdad hay, que el backend ya mandaba en `total`.
  return (
    <Layout title="Inventario" subtitle={totalUnidades != null ? `${totalUnidades.toLocaleString('es-CO')} unidades` : undefined}>
      <div className="space-y-6">
        {/* Resumen por categoría. Cada tarjeta filtra el inventario al pulsarla:
            como Card es un <div>, sin role/tabIndex/teclado no había manera de
            usarla sin ratón. La barra espaciadora necesita preventDefault o el
            navegador hace scroll de la página en lugar de activar el filtro.
            El aria-label sustituye al contenido como nombre accesible, así que
            lleva dentro los cuatro números: con solo "Filtrar por categoría X"
            el lector de pantalla perdía los datos que sí ve quien mira. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resumenCategorias.map((r) => {
            const activa = filtroCategoria === r.categoria;
            return (
              <Card
                key={r.categoria}
                hover
                className={`cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${activa ? 'ring-2 ring-secondary' : ''}`}
                onClick={() => setFiltroCategoria(activa ? '' : r.categoria)}
                role="button"
                tabIndex={0}
                aria-pressed={activa}
                aria-label={`Filtrar por categoría ${r.categoria}: ${r.fisico} en bodega, ${r.separadas} separadas, ${r.disponibles} disponibles, ${r.despachadas} ya despachadas`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setFiltroCategoria(activa ? '' : r.categoria);
                  }
                }}
              >
                <CardBody className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-4 h-4 text-secondary flex-shrink-0" aria-hidden="true" />
                    {/* break-words y no truncate: la tarjeta es ademas el boton de filtrar,
                        y con `truncate` se filtraba por algo que en la tableta no se
                        podia leer —el title no existe sin raton—. */}
                    <span className="font-medium text-sm capitalize break-words leading-tight">{r.categoria}</span>
                  </div>
                  {/* EL ULTIMO NUMERO SE LLAMA FISICO, NO "TOTAL".
                      Decia "Total" y era `fisico`, que EXCLUYE las despachadas.
                      Con "Desp" justo al lado, el orden invitaba a leer
                      Disp + Desp + Sep = Total, y esa cuenta nunca cuadraba: le
                      sobraban las despachadas. Ademas la tabla llama "Fisico" a
                      ese mismo numero treinta pixeles mas abajo.
                      Ahora el orden es el de la resta que si se cumple
                      —Fisico = Sep + Disp— y las despachadas van al final,
                      apagadas, porque son las que ya no estan en la bodega. */}
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <div>
                      <p className="text-muted">Fisico</p>
                      <p className="font-bold text-primary tabular-nums">{r.fisico}</p>
                    </div>
                    <div>
                      <p className="text-muted">Sep</p>
                      <p className="font-bold text-warning tabular-nums">{r.separadas}</p>
                    </div>
                    <div>
                      <p className="text-muted">Disp</p>
                      <p className="font-bold text-emerald-600 tabular-nums">{r.disponibles}</p>
                    </div>
                    <div>
                      <p className="text-muted/70">Desp</p>
                      <p className="font-semibold text-muted tabular-nums">{r.despachadas}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>

        {filtroCategoria && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Filtrado por categoría:</span>
            <button
              onClick={() => setFiltroCategoria('')}
              className="inline-flex items-center gap-1.5 bg-secondary/10 text-secondary font-semibold px-2.5 py-1 rounded-full hover:bg-secondary/20 transition-colors capitalize"
            >
              {filtroCategoria} <X size={13} />
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden="true" />
            {/* El placeholder desaparece al escribir: sin aria-label el lector de
                pantalla anunciaba solo "campo de texto". */}
            <input
              id="pacas-buscar"
              type="text"
              aria-label="Buscar unidades por referencia, calidad, clasificación, UUID o notas"
              placeholder="Buscar referencia, calidad, clasificación, UUID o notas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {/* En pantallas pequeñas el rótulo se oculta y solo queda el icono:
                aria-label + aria-pressed dejan claro cuál vista está activa. */}
            <div className="flex rounded-xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setVistaAgrupada(true)}
                aria-pressed={vistaAgrupada}
                aria-label="Ver inventario agrupado"
                className={`px-3 py-2 flex items-center gap-2 text-sm transition-colors ${vistaAgrupada ? 'bg-secondary text-on-surface font-medium' : 'bg-surface text-muted hover:bg-primary/5'}`}
              >
                <Grid size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Agrupado</span>
              </button>
              <button
                type="button"
                onClick={() => setVistaAgrupada(false)}
                aria-pressed={!vistaAgrupada}
                aria-label="Ver inventario en lista"
                className={`px-3 py-2 flex items-center gap-2 text-sm transition-colors ${!vistaAgrupada ? 'bg-secondary text-on-surface font-medium' : 'bg-surface text-muted hover:bg-primary/5'}`}
              >
                <List size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>
            {/* Nombres de columna cortos o enteros. Va pegado al interruptor de
                vista porque es lo mismo: como se quiere ver la tabla. */}
            <button
              type="button"
              onClick={() => setRotulosCortos((v) => !v)}
              aria-pressed={rotulosCortos}
              title={rotulosCortos
                ? 'Ahora las columnas se llaman Cont., Prov., Clas… Toca para ver los nombres completos'
                : 'Ahora las columnas llevan su nombre completo. Toca para abreviarlos y que quepan todas'}
              className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                rotulosCortos
                  ? 'border-secondary/40 bg-secondary/10 text-secondary font-medium'
                  : 'border-border bg-surface text-muted hover:bg-primary/5'}`}
            >
              {rotulosCortos ? 'Cols. cortas' : 'Cols. completas'}
            </button>
            <BuscadorLista
              value={filtroEstado}
              onChange={(valorElegido) => setFiltroEstado(valorElegido)}
              opcionVacia="Todos los estados"
              placeholder="Todos los estados"
              opciones={[
                ...PACA_ESTADOS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
              ]}
              aria-label="Filtrar por estado"
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            />
            <BuscadorLista
              value={filtroTipo}
              onChange={(valorElegido) => setFiltroTipo(valorElegido)}
              opcionVacia="Todas las clasificaciones"
              placeholder="Todas las clasificaciones"
              opciones={[
                ...tiposList.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
              ]}
              aria-label="Filtrar por clasificación"
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            />
            <Button onClick={exportarInventarioExcel} variant="outline" disabled={exporting}>
              <Download size={16} className="mr-1" /> Excel
            </Button>
            <Button onClick={exportarInventarioPDF} variant="outline" disabled={exporting}>
              <Download size={16} className="mr-1" /> PDF
            </Button>
            <Button onClick={exportarSeparadasPorCliente} variant="outline" disabled={exporting}
              title="Excel con una hoja por cliente: qué tiene apartado cada uno">
              <Download size={16} className="mr-1" /> Separadas x cliente
            </Button>
            <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="secondary">
              <Plus size={16} /> Nueva Unidad
            </Button>
          </div>
        </div>

        {/* Vista Agrupada */}
        {vistaAgrupada ? (
          <Card padding={false}>
            {/* CON LOS RÓTULOS CORTOS LA TABLA CABE, y sin envoltorio de scroll
                horizontal la cabecera puede pegarse de verdad: un ancestro con
                overflow distinto de visible se convierte en el contenedor de
                desplazamiento del sticky, y la cabecera se queda pegada a un
                sitio que no se mueve, o sea a nada.
                Con los rótulos completos la tabla puede no caber, así que ahí
                vuelve el scroll horizontal y se renuncia a la cabecera pegada.
                En pantallas estrechas manda siempre el scroll. */}
            <div className={rotulosCortos ? 'overflow-x-auto md:overflow-x-visible' : 'overflow-x-auto'}>
              <table className="w-full">
                <caption className="sr-only">Inventario agrupado por contenedor, clasificación y calidad</caption>
                {/* CABECERA PEGAJOSA: con hasta 250 filas, a media tabla no se
                    sabe qué columna se está leyendo, y son nueve números
                    seguidos. La raya va como sombra interior porque un
                    border-bottom lo pinta la tabla y se queda clavado al
                    despegarse la cabecera (mismo motivo que en Contenedores).
                    El orden es FÍSICO · SEPARADAS · DISPONIBLES, con
                    DESPACHADAS al final: esa es la resta que explica la
                    diferencia, y es el orden que ya usan las hojas de Excel.
                    Aquí DESPACHADAS iba en medio, justo la columna que NO
                    participa en la resta. */}
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr>
                    <Rotulo col="contenedor" className="bg-surface px-3 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <Rotulo col="proveedor" className="bg-surface px-3 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <Rotulo col="categoria" className="bg-surface px-3 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <Rotulo col="clasificacion" className="bg-surface px-3 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <Rotulo col="referencia" className="bg-surface px-3 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <Rotulo col="calidad" className="bg-surface px-3 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <Rotulo col="fisico" className="bg-surface px-3 py-3 text-right text-xs font-medium text-muted uppercase" />
                    <Rotulo col="separadas" className="bg-surface px-3 py-3 text-right text-xs font-medium text-muted uppercase" />
                    <Rotulo col="disponibles" className="bg-surface px-3 py-3 text-right text-xs font-medium text-muted uppercase" />
                    <Rotulo col="despachadas" className="bg-surface px-3 py-3 text-right text-xs font-medium text-muted uppercase" />
                    <Rotulo col="precioHoy" className="bg-surface px-3 py-3 text-right text-xs font-medium text-muted uppercase" />
                    <Rotulo col="valorDisp" className="bg-surface px-3 py-3 text-right text-xs font-medium text-muted uppercase" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingAgrupado ? (
                    <TableSkeleton cols={12} rows={6} />
                  ) : filasInventario.length === 0 ? (
                    <tr><td colSpan={12}><EmptyState
                      title={filtroCategoria ? `Sin unidades en "${filtroCategoria}"` : 'Sin unidades en inventario'}
                      description={filtroCategoria ? 'Quita el filtro de categoría para ver todo el inventario' : 'Las unidades del inventario aparecerán aquí'}
                    /></td></tr>
                  ) : (
                    filasInventario.map((row, idx) => {
                      // ── EL PRECIO DE HOY, NO EL DE LISTA ──────────────
                      // Esta pantalla enseñaba `precio_unitario` a secas: el de
                      // lista. Cotizaciones cobra el rebajado, la Lista de
                      // Precios tiene su columna de promoción y el Excel de la
                      // MATRIZ también, todos leyendo ESTE mismo endpoint. O
                      // sea: la bodega miraba aquí el precio antes de vender y
                      // era el único sitio donde la rebaja no existía.
                      //
                      // Y el indicador «●promo» salía de `tiene_promocion`, que
                      // es una bandera estampada en la paca al nacer, mientras
                      // que la rebaja es una consulta viva con fechas. Se
                      // desincronizaban en los dos sentidos: promoción caducada
                      // ayer seguía con su puntito, promoción creada hoy sobre
                      // pacas viejas no lo tenía. Ahora las dos cosas salen del
                      // mismo helper, y además dice cuánto es.
                      const promo    = promoDeLinea(row);
                      const efectivo = precioHoy(row);
                      const lista    = parseFloat(row.precio_unitario);
                      const disp     = parseInt(row.disponibles) || 0;
                      return (
                      <tr key={idx} className="hover:bg-primary/3 transition-colors duration-150">
                        <td className="px-3 py-2.5">
                          {row.contenedor_id ? (
                            <RefLink to="/contenedores" id={row.contenedor_id} title="Ver contenedor"
                              className="text-xs bg-secondary/10 px-2 py-0.5 rounded-full font-semibold">{row.contenedor}</RefLink>
                          ) : (
                            <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">{row.contenedor}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-muted">{row.proveedor_nombre || <span className="text-muted/40">—</span>}</td>
                        <td className="px-3 py-2.5 text-sm capitalize">
                          {row.categoria
                            ? <span className="text-xs bg-primary/8 text-primary px-2 py-0.5 rounded-full font-medium">{row.categoria}</span>
                            : <span className="text-muted/40">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-sm font-semibold text-primary capitalize">
                          {row.clasificacion}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-muted capitalize">{row.referencia}</td>
                        <td className="px-3 py-2.5 text-sm text-muted capitalize">{row.calidad || <span className="text-muted/40">—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">{row.fisico}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-warning">
                          {/* El conteo es un botón y su única pista era un
                              subrayado al pasar el ratón: en la tableta era un
                              número igual a los de al lado. Ahora se ve que es
                              pulsable sin necesidad de puntero. */}
                          {row.separadas > 0 ? (
                            <button type="button" onClick={() => verComprometidas(row)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-warning/10 text-warning font-semibold underline underline-offset-2 decoration-warning/40 hover:bg-warning/20"
                              aria-label={`Ver por quién están separadas las ${row.separadas} unidades de ${row.clasificacion} ${row.referencia}`}
                              title="Ver por quién están separadas">
                              {row.separadas}
                            </button>
                          ) : row.separadas}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-600">{row.disponibles}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-muted">{row.despachadas}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm">
                          <span className={promo != null ? 'font-bold text-amber-600' : 'font-semibold text-secondary'}>
                            {dineroOVacio(efectivo) || <span className="text-muted/40">—</span>}
                          </span>
                          {promo != null && Number.isFinite(lista) && lista > promo && (
                            <span className="block text-[10px] text-muted line-through leading-tight">
                              {dineroOVacio(lista)}
                            </span>
                          )}
                          {promo != null && (
                            <span className="block text-[9px] font-bold text-amber-600 uppercase tracking-wide leading-tight">promoción</span>
                          )}
                        </td>
                        {/* Disponibles × precio de hoy, que es exactamente lo
                            que calcula la columna PRECIO TOTAL del Excel de esta
                            misma pantalla. Antes era SUM(precio_venta) de TODO
                            el grupo, despachadas incluidas: un "valor del
                            inventario" que contaba mercancía que ya había salido
                            por la puerta, y dividirlo por el precio unitario no
                            daba ninguna de las cuatro columnas de la tabla. */}
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-secondary/70">
                          {disp > 0 && efectivo != null ? dineroOVacio(efectivo * disp) : <span className="text-muted/40">—</span>}
                        </td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          /* Vista Lista/Tabla */
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Unidades del inventario, una fila por paca</caption>
                <thead className="bg-primary/3 border-b border-border/50">
                  <tr>
                    <RotuloLista col="uuid" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="clasificacion" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="referencia" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="peso" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="costo" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="precio" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="contenedor" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="estadoCot" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase" />
                    <RotuloLista col="acciones" className="px-4 py-3 text-right text-xs font-medium text-muted uppercase" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <TableSkeleton cols={9} rows={6} />
                  ) : pacas.length === 0 ? (
                    <tr><td colSpan={9}><EmptyState title="Sin unidades" description="No hay unidades que coincidan con los filtros aplicados" /></td></tr>
                  ) : (
                    pacas.map((paca) => (
                      <tr key={paca.id} className={`hover:bg-primary/3 transition-colors duration-150 ${paca.estado === 'separada' ? 'bg-warning/5' : ''}`}>
                        <td className="px-4 py-3 text-sm text-muted font-mono">{paca.uuid?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-primary">{paca.clasificacion}</td>
                        <td className="px-4 py-3 text-sm text-muted">{paca.referencia}</td>
                        <td className="px-4 py-3 text-sm text-muted">{paca.peso} kg</td>
                        <td className="px-4 py-3 text-sm text-muted">{formatCurrency(paca.costo_base)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-primary">
                          {formatCurrency(paca.precio_venta)}
                          {paca.estado === 'separada' && paca.cotizacion_precio && parseFloat(paca.cotizacion_precio) !== parseFloat(paca.precio_venta) && (
                            <span className="block text-xs text-warning">Cot: {formatCurrency(paca.cotizacion_precio)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {paca.contenedor_numero ? (
                            <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">
                              {paca.contenedor_numero}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">Sin contenedor</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={paca.estado}>{paca.estado}</Badge>
                          {paca.cotizacion_numero && (
                            <div className="mt-0.5">
                              <RefLink to="/cotizaciones" id={paca.cotizacion_id} title="Ver cotización"
                                className="text-xs font-semibold" icon={false}>{paca.cotizacion_numero}</RefLink>
                              {/* Llevaba `truncate` SIN title: no es que estuviera
                                  escondido tras el ratón, es que no había forma de
                                  leerlo, ni siquiera con ratón. */}
                              {paca.cotizacion_cliente && (
                                <span className="block text-xs text-muted break-words max-w-[160px] leading-tight">{paca.cotizacion_cliente}</span>
                              )}
                            </div>
                          )}
                          {paca.despacho_numero && (
                            <div className="mt-0.5">
                              <RefLink to="/despachos" id={paca.despacho_id} title="Ver despacho"
                                className="text-xs" icon={false}>{paca.despacho_numero}</RefLink>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {/* Botones de solo icono: sin aria-label el lector de
                                pantalla solo decía "botón" y no se distinguía
                                editar de eliminar. Se nombra la unidad concreta. */}
                            {paca.estado === 'disponible' && (
                              <>
                                <button type="button" onClick={() => openReservaModal(paca)} className="p-2 rounded-lg text-muted hover:text-success hover:bg-success/10 transition-all" title="Reservar para cliente" aria-label={`Reservar para cliente la unidad ${paca.uuid?.slice(0, 8)}`}>
                                  <Calendar size={16} aria-hidden="true" />
                                </button>
                                <button type="button" onClick={() => openAssignModal(paca)} className="p-2 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10 transition-all" title="Asignar a lote" aria-label={`Asignar a lote la unidad ${paca.uuid?.slice(0, 8)}`}>
                                  <Link size={16} aria-hidden="true" />
                                </button>
                              </>
                            )}
                            {paca.estado === 'separada' && (
                              <span className="text-xs bg-warning/10 text-warning px-2 py-1 rounded-full">Separada</span>
                            )}
                            <button type="button" onClick={() => handleEdit(paca)} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all" title="Editar unidad" aria-label={`Editar la unidad ${paca.uuid?.slice(0, 8)}`}>
                              <Edit2 size={16} aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => handleDelete(paca.id)} className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-all" disabled={paca.estado === 'vendida'} title="Eliminar unidad" aria-label={`Eliminar la unidad ${paca.uuid?.slice(0, 8)}`}>
                              <Trash2 size={16} aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* PAGINACION SOLO EN LA VISTA LISTA.
            La vista agrupada sale de /pacas/inventario, que NO pagina: salia
            "Mostrar 50 por pagina" y "Pagina 1 de 7" debajo de una tabla que ya
            ensenaba todo, y tocarlos recargaba /pacas sin ningun efecto visible.
            Un control que no hace nada es peor que no tenerlo. */}
        {!vistaAgrupada && totalPaginas > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center bg-surface p-4 rounded-xl border border-border mt-4 gap-4 shadow-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="pacas-por-pagina" className="text-sm text-muted">Mostrar:</label>
              <BuscadorLista
                id="pacas-por-pagina"
                value={limite}
                onChange={(v) => setLimite(Number(v))}
                opciones={[20, 50, 100, 250].map((n) => ({ value: n, label: String(n) }))}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 w-24"
              />
              <span className="text-sm text-muted">por página</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
                className="px-3 py-1.5 h-auto text-sm"
              >
                <ChevronLeft size={16} className="mr-1" /> Anterior
              </Button>
              <span className="text-sm font-medium px-4 text-primary">
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
                className="px-3 py-1.5 h-auto text-sm"
              >
                Siguiente <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Unidad' : 'Nueva Unidad'}>
        <form onSubmit={handleSubmit} className="space-y-5">

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Clasificación"
              value={formData.clasificacion}
              onChange={(e) => setFormData({ ...formData, clasificacion: e.target.value })}
              options={tiposList.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              placeholder="Seleccionar..."
              required
            />
            <Select
              label="Referencia"
              value={formData.referencia}
              onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
              options={categoriasList.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              placeholder="Seleccionar..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Calidad"
              value={formData.calidad || ''}
              onChange={(e) => setFormData({ ...formData, calidad: e.target.value })}
              options={calidadesList.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              placeholder="Seleccionar..."
            />
            <div>
              <label htmlFor="paca-categoria" className="block text-sm font-medium text-primary mb-1">Categoría <span className="text-muted font-normal">(opcional)</span></label>
              {/* Era el unico <datalist> de la pantalla, y en tableta apenas
                  funciona: en iOS el desplegable puede no aparecer. Los otros
                  tres campos de catalogo de este mismo formulario usan
                  BuscadorLista, que si es tactil y ademas no deja teclear una
                  categoria que no existe en el catalogo. */}
              <BuscadorLista id="paca-categoria"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
                value={formData.categoria}
                onChange={(val) => setFormData({ ...formData, categoria: val })}
                opciones={temporadasList.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                placeholder="Verano / Invierno" />
            </div>
          </div>

          <Input
            label="Peso (kg)"
            type="number"
            step="0.01"
            value={formData.peso}
            onChange={(e) => setFormData({ ...formData, peso: e.target.value })}
            placeholder="0.00"
            suffix="kg"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Costo Base"
              type="currency"
              value={formData.costo_base}
              onChange={(e) => setFormData({ ...formData, costo_base: e.target.value })}
              placeholder="0"
              required
            />
            <Input
              label="Precio Venta"
              type="currency"
              value={formData.precio_venta}
              onChange={(e) => setFormData({ ...formData, precio_venta: e.target.value })}
              placeholder="0"
              required
            />
          </div>

          {!editando && (
            <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-xl border border-secondary/20">
              <Hash className="w-5 h-5 text-secondary" aria-hidden="true" />
              <div className="flex-1">
                <label htmlFor="paca-cantidad" className="block text-sm font-medium text-primary">Cantidad</label>
                <p id="paca-cantidad-ayuda" className="text-xs text-muted">Número de unidades del mismo tipo</p>
              </div>
              <input
                id="paca-cantidad"
                aria-describedby="paca-cantidad-ayuda"
                type="number"
                min="1"
                max="100"
                value={formData.cantidad}
                onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                className="w-20 px-3 py-2 rounded-xl border border-border text-center font-bold"
              />
            </div>
          )}

          <Input
            label="Notas"
            value={formData.notas}
            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
            placeholder="Notas adicionales..."
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">
              {editando ? 'Actualizar' : `Crear ${formData.cantidad > 1 ? formData.cantidad + ' pacas' : 'Paca'}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Asignar a Lote */}
      <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Asignar a Lote">
        <div className="space-y-4">
          {selectedPaca && (
            <div className="p-4 bg-primary/5 rounded-xl">
              <p className="text-sm text-muted">Paca seleccionada</p>
              <p className="font-medium">{selectedPaca.clasificacion} - {selectedPaca.referencia}</p>
              <p className="text-sm text-muted">Precio: {formatCurrency(selectedPaca.precio_venta)}</p>
            </div>
          )}

          <Select
            label="Lote"
            value={formData.lote_id}
            onChange={(e) => setFormData({ ...formData, lote_id: e.target.value })}
            options={[
              { value: '', label: 'Sin asignar' },
              ...lotes.map(l => ({ value: l.id, label: `${l.numero} (${l.total_pacas || 0} pacas)` }))
            ]}
            placeholder="Seleccionar lote..."
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAssignModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleAssignLote} className="flex-1">
              Asignar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Reservar Paca */}
      <Modal isOpen={reservaModalOpen} onClose={() => setReservaModalOpen(false)} title="Reservar Paca para Cliente">
        <div className="space-y-4">
          {selectedPaca && (
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
              <p className="text-sm text-muted">Paca a reservar</p>
              <p className="font-medium text-primary">{selectedPaca.clasificacion} - {selectedPaca.referencia}</p>
              <p className="text-sm text-muted">Precio: {formatCurrency(selectedPaca.precio_venta)}</p>
              <p className="text-xs text-muted mt-1">Peso: {selectedPaca.peso} kg</p>
            </div>
          )}

          {/* Selector de cliente con búsqueda */}
          <div className="relative" ref={clienteReservaListRef}>
            {/* Con un cliente ya elegido el input de búsqueda no existe: el
                htmlFor apuntaría a un id inexistente, así que solo se pone
                cuando el campo está realmente en pantalla. */}
            <label
              htmlFor={reservaForm.cliente_id ? undefined : 'reserva-buscar-cliente'}
              className="block text-sm font-medium text-primary mb-1"
            >
              Cliente <span className="text-error">*</span>
            </label>

            {reservaForm.cliente_id ? (
              <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                <div className="p-2 bg-secondary/20 rounded-lg">
                  <User className="w-4 h-4 text-secondary" aria-hidden="true" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-secondary">
                    {clientes.find(c => c.id === parseInt(reservaForm.cliente_id))?.nombre || 'Cliente'}
                  </p>
                  <p className="text-xs text-muted">
                    {clientes.find(c => c.id === parseInt(reservaForm.cliente_id))?.ciudad || ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReservaForm({ ...reservaForm, cliente_id: '' });
                    setBusquedaClienteReserva('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary/20 text-secondary"
                  aria-label="Quitar el cliente seleccionado"
                  title="Quitar el cliente seleccionado"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </div>
                <input
                  id="reserva-buscar-cliente"
                  type="text"
                  role="combobox"
                  aria-expanded={!!busquedaClienteReserva && showListaClientesReserva}
                  /* aria-controls solo mientras la lista existe: apuntar a un id
                     que no está en el DOM es una referencia rota. */
                  aria-controls={
                    !!busquedaClienteReserva && showListaClientesReserva
                      ? 'reserva-lista-clientes'
                      : undefined
                  }
                  aria-autocomplete="list"
                  autoComplete="off"
                  placeholder="Buscar cliente..."
                  value={busquedaClienteReserva}
                  onChange={(e) => {
                    setBusquedaClienteReserva(e.target.value);
                    setShowListaClientesReserva(true);
                  }}
                  onFocus={() => busquedaClienteReserva && setShowListaClientesReserva(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (!busquedaClienteReserva) return;
                      setShowListaClientesReserva(true);
                      // La lista puede acabar de montarse: se espera al pintado.
                      requestAnimationFrame(() => moverFocoOpcionCliente(null, 1));
                    } else if (e.key === 'Escape' && showListaClientesReserva) {
                      // Sin stopPropagation el Escape llega al Modal y cierra
                      // toda la reserva en vez de cerrar solo el desplegable.
                      e.stopPropagation();
                      setShowListaClientesReserva(false);
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                />
              </div>
            )}
            
            {/* Cada resultado era un <div onClick> sin role ni tabIndex: con
                teclado no había forma de elegir cliente y, por tanto, de crear la
                reserva. Ahora son <button role="option">, que se activan con
                Enter y Espacio y entran en el orden de tabulación. */}
            {/* `showListaClientesReserva` no entraba en la condición, así que el
                cierre al hacer clic fuera (efecto de arriba) no tenía efecto y la
                lista se quedaba abierta encima del resto del formulario. */}
            {!reservaForm.cliente_id && busquedaClienteReserva && showListaClientesReserva && (
              <div
                id="reserva-lista-clientes"
                ref={listaClientesReservaRef}
                role="listbox"
                aria-label="Clientes que coinciden con la búsqueda"
                className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
              >
                {clientes
                  .filter(c => c.estado === 'activo')
                  .filter(c =>
                    c.nombre?.toLowerCase().includes(busquedaClienteReserva.toLowerCase()) ||
                    c.ciudad?.toLowerCase().includes(busquedaClienteReserva.toLowerCase()) ||
                    c.telefono?.toLowerCase().includes(busquedaClienteReserva.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => {
                        setReservaForm({ ...reservaForm, cliente_id: c.id.toString() });
                        setBusquedaClienteReserva('');
                        setShowListaClientesReserva(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                          e.preventDefault();
                          moverFocoOpcionCliente(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1);
                        } else if (e.key === 'Escape') {
                          e.stopPropagation(); // que no cierre el modal entero
                          setShowListaClientesReserva(false);
                          document.getElementById('reserva-buscar-cliente')?.focus();
                        }
                      }}
                      className="w-full text-left px-4 py-3 cursor-pointer hover:bg-primary/5 focus:bg-primary/10 focus:outline-none transition-colors duration-150 border-b border-border/50 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/8 rounded-lg">
                          <User className="w-4 h-4 text-muted" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{c.nombre}</p>
                          <p className="text-xs text-muted">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
            )}
          </div>

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

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setReservaModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleCreateReserva} className="flex-1">
              Reservar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: por quién están separadas las pacas de un grupo */}
      <Modal isOpen={!!comprometidas} onClose={() => setComprometidas(null)}
        title={comprometidas ? `Separadas · ${comprometidas.label}` : ''} size="lg">
        {comprometidas && (
          <div className="space-y-3">
            {comprometidas.loading ? (
              <p className="text-center text-muted py-8 text-sm">Cargando…</p>
            ) : comprometidas.rows.length === 0 ? (
              <p className="text-center text-muted py-8 text-sm">No hay pacas separadas en este grupo.</p>
            ) : (
              <>
                <p className="text-xs text-muted">{comprometidas.rows.length} paca(s) comprometida(s). Agrupadas por cliente / cotización:</p>
                {(() => {
                  // Agrupar por cotización para ver claramente a quién pertenecen
                  const grupos = {};
                  comprometidas.rows.forEach(r => {
                    const k = r.cotizacion_id || `sin-${r.id}`;
                    if (!grupos[k]) grupos[k] = { cotizacion_id: r.cotizacion_id, cotizacion_numero: r.cotizacion_numero, cliente_nombre: r.cliente_nombre, despacho_id: r.despacho_id, despacho_numero: r.despacho_numero, pacas: [] };
                    grupos[k].pacas.push(r);
                  });
                  return Object.values(grupos).map((g, i) => (
                    <div key={i} className="rounded-xl border border-border/60 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {g.cotizacion_id ? (
                            <RefLink to="/cotizaciones" id={g.cotizacion_id} title="Ver cotización" className="text-sm font-semibold">
                              {g.cotizacion_numero || `Cot. #${g.cotizacion_id}`}
                            </RefLink>
                          ) : (
                            <span className="text-sm font-semibold text-muted">Sin cotización</span>
                          )}
                          {g.cliente_nombre && <span className="text-xs text-muted">· {g.cliente_nombre}</span>}
                          {g.despacho_id && (
                            <RefLink to="/despachos" id={g.despacho_id} title="Ver despacho" className="text-xs" icon={false}>
                              {g.despacho_numero}
                            </RefLink>
                          )}
                        </div>
                        <span className="text-xs font-bold text-warning">{g.pacas.length} paca(s)</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.pacas.map(p => (
                          // El precio vivia SOLO en el title: en la tableta,
                          // que es donde se usa esto, no existia. Y es dinero.
                          <span key={p.id} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${p.estado === 'vendida' ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'}`}>
                            {p.uuid?.slice(0, 8)} · {p.estado}
                            {p.precio_venta != null && <> · <b>{dineroOVacio(p.precio_venta)}</b></>}
                          </span>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </>
            )}
            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setComprometidas(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
