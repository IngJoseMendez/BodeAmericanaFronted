import { useEffect, useState, useRef, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink } from '../components/common';
import { ventasApi, pacasApi, clientesApi, reservasApi } from '../services/api';
import { PAGO_TIPOS } from '../types';
import { Plus, Search, Trash2, User, Calendar, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
// autoTable se usaba en descargarPDF sin importarlo: el botón "Descargar PDF"
// reventaba con ReferenceError y para la usuaria simplemente no hacía nada.
import autoTable from 'jspdf-autotable';
import { hoy, formatFechaCorta } from '../lib/fecha';
import { parseMonto, formatCOP } from '../lib/money';

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
  const [pacasSeleccionadas, setPacasSeleccionadas] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pacasDisponibles, setPacasDisponibles] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [buscarPacas, setBuscarPacas] = useState('');
  const [despachoModalOpen, setDespachoModalOpen] = useState(false);
  const [despachoData, setDespachoData] = useState(null);
  const [filtroVista, setFiltroVista] = useState('disponible'); // 'disponible' = ventas registradas | 'reservada'
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
  }, [pagina, filtroVista, debouncedBusqueda, filtroFechaInicio, filtroFechaFin, montoMin, montoMax]);

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
      setTotalPaginas(response.total_paginas || 1);
      setTotalVentas(response.total ?? (Array.isArray(data) ? data.length : 0));
      // No se reescribe `pagina` desde la respuesta: el estado ya es la fuente de
      // verdad y reasignarlo aquí devolvía siempre a la página 1, dejando el
      // histórico anterior a las últimas 20 ventas fuera de alcance.
    } catch (err) {
      if (miPeticion !== peticionVentasRef.current) return;
      addToast(err.message, 'error');
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
      const [pacasRes, clientesRes] = await Promise.all([
        // Sin `limite` el backend devuelve sólo las 50 primeras pacas: el
        // buscador del modal filtra en el navegador, así que una paca fuera de
        // esas 50 no aparecía por más que se escribiera su referencia.
        pacasApi.getAll({ estado: 'disponible', limite: 2000 }),
        clientesApi.getAll({ estado: 'activo' })
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
      setPacasSeleccionadas([]);
      setBuscarPacas('');
      setError('');
      setModalOpen(true);
    } catch (err) {
      addToast('Error al cargar datos: ' + err.message, 'error');
    }
  };

  const togglePaca = (paca) => {
    const exists = pacasSeleccionadas.find(p => p.id === paca.id);
    if (exists) {
      setPacasSeleccionadas(pacasSeleccionadas.filter(p => p.id !== paca.id));
    } else {
      // El precio llega de la API como cadena (y a veces como null): normalizarlo
      // aquí evita que el <input> pase de no controlado a controlado y que el
      // total de la venta salga NaN.
      setPacasSeleccionadas([...pacasSeleccionadas, { ...paca, precio_venta: parseMonto(paca.precio_venta) }]);
    }
  };

  const updatePrecio = (pacaId, precio) => {
    // parseFloat('') es NaN y contaminaba el total de la venta: si el usuario
    // borra el campo se guarda 0, no NaN.
    const valor = parseMonto(precio);
    setPacasSeleccionadas(pacasSeleccionadas.map(p =>
      p.id === pacaId ? { ...p, precio_venta: valor } : p
    ));
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
      setError('Selecciona al menos una paca');
      return;
    }
    // Una paca sin precio saldría vendida en cero sin que nadie se entere.
    const sinPrecio = pacasSeleccionadas.filter(p => !(parseMonto(p.precio_venta) > 0));
    if (sinPrecio.length > 0) {
      setError(`${sinPrecio.length} paca(s) sin precio. Escribe el precio de venta antes de confirmar.`);
      return;
    }

    try {
      setEnviando(true);
      const result = await ventasApi.create({
        cliente_id: parseInt(formData.cliente_id),
        tipo_pago: formData.tipo_pago,
        fecha: formData.fecha,
        pacas: pacasSeleccionadas.map(p => ({ id: p.id, precio_venta: p.precio_venta }))
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
      setPacasSeleccionadas([]);
      // La venta recién creada es la más reciente y vive en la página 1: recargar
      // la página 5 dejaba al usuario sin ver lo que acababa de registrar.
      if (pagina === 1) loadVentas(1); else setPagina(1);
    } catch (err) {
      setError(err.message);
      addToast('Error al registrar venta: ' + err.message, 'error');
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
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  const totalVenta = pacasSeleccionadas.reduce((sum, p) => sum + parseMonto(p.precio_venta), 0);

  const formatCurrency = formatCOP;

  const formatDate = formatFechaCorta;

  /**
   * Descarga un libro de ExcelJS.
   * El enlace se quita del DOM y el blob se libera: cada exportación dejaba una
   * URL de objeto viva hasta recargar la página.
   */
  const descargarLibro = async (wb, nombreArchivo) => {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const descargarExcel = async (data) => {
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
    const headersRow = 8;
    ['Clasificación', 'Referencia', 'Precio Unitario'].forEach((h, i) => {
      const cell = ws.getCell(`${String.fromCharCode(65 + i)}${headersRow}`);
      cell.value = h;
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
    });
    
    // Datos de pacas
    let row = 9;
    data.pacas.forEach(paca => {
      ws.getCell(`A${row}`).value = paca.clasificacion;
      ws.getCell(`B${row}`).value = paca.referencia;
      ws.getCell(`C${row}`).value = parseMonto(paca.precio_venta);
      ws.getCell(`C${row}`).numFmt = '$#,##0.00';
      row++;
    });
    
    // Total
    ws.getCell(`A${row}`).value = 'TOTAL';
    ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`C${row}`).value = data.total;
    ws.getCell(`C${row}`).numFmt = '$#,##0.00';
    ws.getCell(`C${row}`).font = { bold: true };
    
    // Ajustar anchos
    ws.getColumn(1).width = 25;
    ws.getColumn(2).width = 15;
    ws.getColumn(3).width = 18;

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
    
    // Tabla de productos
    const tableData = data.pacas.map(p => [p.clasificacion, p.referencia, formatCurrency(p.precio_venta)]);
    tableData.push(['TOTAL', '', formatCurrency(data.total)]);

    autoTable(doc, {
      startY: 75,
      head: [['Clasificación', 'Referencia', 'Precio']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [26, 26, 46] },
      footStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Venta_${data.uuid?.slice(0, 8) || 'sin-folio'}_${hoy()}.pdf`);
    addToast('PDF descargado', 'success');
  };

  // Filtra sobre el término ya reposado (300 ms): antes se recorría el inventario
  // entero y se repintaba la tabla en cada tecla, y el `.includes()` sin
  // normalizar hacía que buscar "HOMBRE" no encontrara "hombre".
  const FILAS_PACAS_VISIBLES = 150;
  const pacasCoincidentes = useMemo(() => {
    const q = debouncedBuscarPacas.trim().toLowerCase();
    if (!q) return pacasDisponibles;
    return pacasDisponibles.filter(p =>
      p.clasificacion?.toLowerCase().includes(q) ||
      p.referencia?.toLowerCase().includes(q) ||
      p.uuid?.toLowerCase().includes(q)
    );
  }, [pacasDisponibles, debouncedBuscarPacas]);

  const filteredPacas = useMemo(
    () => pacasCoincidentes.slice(0, FILAS_PACAS_VISIBLES),
    [pacasCoincidentes]
  );

  // Buscar la paca seleccionada con find() dentro del map era O(pacas × elegidas)
  // en cada tecleo; el mapa resuelve cada fila en un solo acceso.
  const seleccionPorId = useMemo(
    () => new Map(pacasSeleccionadas.map(p => [p.id, p])),
    [pacasSeleccionadas]
  );

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

      ws.mergeCells('A1:F1');
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
      ws.mergeCells('A2:F2');
      const textoFiltros = detalleFiltros.length
        ? `Filtros: ${detalleFiltros.join(' · ')}`
        : 'Todas las ventas registradas';
      ws.getCell('A2').value = incompleto
        ? `${textoFiltros} — ARCHIVO INCOMPLETO: ${filas.length} de ${totalServidor} ventas`
        : textoFiltros;
      ws.getCell('A2').font = { italic: true, size: 10, bold: incompleto };

      const headersRow = 4;
      ['Folio', 'Fecha', 'Cliente', 'Tipo de pago', 'Estado', 'Total'].forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${headersRow}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      });

      let row = headersRow + 1;
      let total = 0;
      filas.forEach(v => {
        ws.getCell(`A${row}`).value = v.uuid?.slice(0, 8).toUpperCase() || `#${v.id}`;
        ws.getCell(`B${row}`).value = formatDate(v.fecha);
        ws.getCell(`C${row}`).value = v.cliente_nombre || getClienteNombre(v.cliente_id);
        ws.getCell(`D${row}`).value = v.tipo_pago === 'contado' ? 'Contado' : 'Crédito';
        ws.getCell(`E${row}`).value = v.estado || '';
        ws.getCell(`F${row}`).value = parseMonto(v.total);
        ws.getCell(`F${row}`).numFmt = '$#,##0';
        total += parseMonto(v.total);
        row++;
      });

      ws.getCell(`E${row}`).value = 'TOTAL';
      ws.getCell(`E${row}`).font = { bold: true };
      ws.getCell(`F${row}`).value = total;
      ws.getCell(`F${row}`).numFmt = '$#,##0';
      ws.getCell(`F${row}`).font = { bold: true };

      [14, 14, 32, 14, 14, 18].forEach((ancho, i) => { ws.getColumn(i + 1).width = ancho; });

      await descargarLibro(wb, `Ventas_${hoy()}.xlsx`);
      if (incompleto) {
        addToast(
          `El servidor sólo devolvió ${filas.length} de ${totalServidor} ventas: el Excel está incompleto. Acota el rango de fechas y vuelve a exportar.`,
          'error'
        );
      } else {
        addToast(`Excel descargado — ${filas.length} venta(s)`, 'success');
      }
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
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
      setPacasSeleccionadas([]);
      loadPacasDisponibles();
      // El contador de la pestaña "Reservas" se quedaba viejo hasta recargar.
      loadReservas();
    } catch (err) {
      addToast(err.message, 'error');
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
      addToast(err.message, 'error');
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
      
      ws.mergeCells('A1:E1');
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

      const headersRow = 8;
      ['Cantidad', 'Clasificación', 'Referencia', 'Peso (kg)', 'Precio Unitario'].forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${headersRow}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      });
      
      let row = 9;
      let total = 0;
      (ventaDetalle.detalles || []).forEach(paca => {
        ws.getCell(`A${row}`).value = 1;
        ws.getCell(`B${row}`).value = paca.clasificacion || '';
        ws.getCell(`C${row}`).value = paca.referencia || '';
        ws.getCell(`D${row}`).value = paca.peso || '';
        ws.getCell(`E${row}`).value = parseMonto(paca.precio_unitario);
        ws.getCell(`E${row}`).numFmt = '$#,##0.00';
        total += parseMonto(paca.precio_unitario);
        row++;
      });
      
      ws.getCell(`A${row}`).value = 'TOTAL';
      ws.getCell(`A${row}`).font = { bold: true };
      ws.getCell(`E${row}`).value = total;
      ws.getCell(`E${row}`).numFmt = '$#,##0.00';
      ws.getCell(`E${row}`).font = { bold: true };
      
      ws.getColumn(1).width = 10;
      ws.getColumn(2).width = 20;
      ws.getColumn(3).width = 12;
      ws.getColumn(4).width = 12;
      ws.getColumn(5).width = 18;

      await descargarLibro(wb, `Venta_${venta.uuid?.slice(0, 8) || venta.id}_${venta.fecha}.xlsx`);

      addToast('Excel descargado', 'success');
    } catch (err) {
      addToast('Error al descargar: ' + err.message, 'error');
    }
  };

  // `clientes` sólo trae los activos: para una venta de un cliente ya desactivado
  // se pintaba "Cliente #12". El backend manda el nombre en la propia fila.
  const getClienteNombre = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre || `Cliente #${clienteId}`;
  };

  const nombreDeVenta = (venta) => venta.cliente_nombre || getClienteNombre(venta.cliente_id);

  // La variante estaba fija en "disponible": una venta anulada se pintaba con el
  // mismo verde que una vigente.
  const badgeEstadoVenta = (estado) => {
    const e = String(estado || '').toLowerCase();
    if (e === 'anulada' || e === 'cancelada') return 'inactivo';
    if (e === 'pendiente') return 'separada';
    return 'disponible';
  };

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
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">ID</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Fecha</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Cliente</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo Pago</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Total</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {loading ? (
                        <TableSkeleton cols={7} rows={6} />
                      ) : ventasFiltradas.length === 0 ? (
                        <tr><td colSpan={7}>
                          <EmptyState
                            title={hayFiltros ? 'Sin resultados' : 'Sin ventas'}
                            description={hayFiltros
                              ? 'Ninguna venta coincide con los filtros aplicados.'
                              : 'Todavía no hay ventas registradas. Usa el botón “Nueva Venta”.'}
                            action={hayFiltros ? { label: 'Limpiar filtros', onClick: limpiarFiltros } : undefined}
                          />
                        </td></tr>
                      ) : (
                        ventasFiltradas.map((venta) => (
                          <tr key={venta.id} className="hover:bg-primary/5 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted font-mono">#{venta.id}</td>
                            <td className="px-4 py-3 text-sm text-muted whitespace-nowrap">{formatDate(venta.fecha)}</td>
                            <td className="px-4 py-3 text-sm text-primary font-medium">
                              <RefLink to="/cartera" id={venta.cliente_id} title="Ver cartera del cliente">{nombreDeVenta(venta)}</RefLink>
                            </td>
                            <td className="px-4 py-3"><Badge variant={venta.tipo_pago}>{venta.tipo_pago}</Badge></td>
                            <td className="px-4 py-3 text-sm text-primary font-medium whitespace-nowrap">{formatCurrency(venta.total)}</td>
                            <td className="px-4 py-3"><Badge variant={badgeEstadoVenta(venta.estado)}>{venta.estado || 'registrada'}</Badge></td>
                            <td className="px-4 py-3 text-right flex gap-1 justify-end">
                              <button
                                onClick={() => descargarExcelVenta(venta)}
                                className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-success/10"
                                title="Descargar Excel"
                                aria-label={`Descargar el Excel de la venta #${venta.id} de ${nombreDeVenta(venta)}`}
                              >
                                <FileSpreadsheet size={16} aria-hidden="true" />
                              </button>
                              <button
                                onClick={() => handleDelete(venta.id)}
                                className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10"
                                title="Eliminar venta"
                                aria-label={`Eliminar la venta #${venta.id} de ${nombreDeVenta(venta)}`}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))
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
              Seleccionar pacas
            </label>
            <input
              id="buscar-pacas"
              type="text"
              placeholder="Filtrar por clasificación, referencia o código"
              value={buscarPacas}
              onChange={(e) => setBuscarPacas(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-lg border border-border bg-surface text-primary placeholder-muted"
            />
            <p className="text-xs text-muted mb-3" role="status" aria-live="polite">
              {pacasCoincidentes.length === 0
                ? (buscarPacas
                    ? 'Ninguna paca disponible coincide con la búsqueda.'
                    : 'No hay pacas disponibles en el inventario.')
                : `${pacasCoincidentes.length} paca(s) disponibles${
                    pacasCoincidentes.length > FILAS_PACAS_VISIBLES
                      ? ` — se muestran las primeras ${FILAS_PACAS_VISIBLES}; afina la búsqueda para ver el resto.`
                      : '.'
                  }`}
              {totalPacasDisponibles > pacasDisponibles.length &&
                ` (de ${totalPacasDisponibles} en inventario)`}
            </p>

            <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <caption className="sr-only">Pacas disponibles para agregar a la venta</caption>
                <thead className="bg-primary/5 sticky top-0">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left"><span className="sr-only">Incluir</span></th>
                    <th scope="col" className="px-3 py-2 text-left">Clasificación</th>
                    <th scope="col" className="px-3 py-2 text-left">Referencia</th>
                    <th scope="col" className="px-3 py-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredPacas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted">
                        No hay pacas disponibles que coincidan.
                      </td>
                    </tr>
                  )}
                  {filteredPacas.map(paca => {
                    const selected = seleccionPorId.get(paca.id);
                    const etiquetaPaca = `${paca.clasificacion || 'Paca'} ${paca.referencia || ''}`.trim();
                    return (
                      <tr key={paca.id} className={selected ? 'bg-secondary/10' : ''}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => togglePaca(paca)}
                            aria-label={`Agregar a la venta la paca ${etiquetaPaca}`}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-3 py-2 text-primary">{paca.clasificacion}</td>
                        <td className="px-3 py-2 text-primary">{paca.referencia}</td>
                        <td className="px-3 py-2 text-right">
                          {selected ? (
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={selected.precio_venta ?? ''}
                              onChange={(e) => updatePrecio(paca.id, e.target.value)}
                              aria-label={`Precio de venta de la paca ${etiquetaPaca}`}
                              className="w-24 text-right px-2 py-1 rounded border border-border bg-surface text-primary"
                            />
                          ) : (
                            formatCurrency(paca.precio_venta)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 p-4 bg-primary/5 rounded-lg">
            <span className="text-sm text-muted">Total ({pacasSeleccionadas.length} pacas)</span>
            <span className="text-xl font-display text-primary" aria-live="polite">{formatCurrency(totalVenta)}</span>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary" disabled={enviando}>
              {enviando ? 'Registrando…' : 'Confirmar Venta'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Despacho Post-Venta */}
      <Modal isOpen={despachoModalOpen} onClose={() => { setDespachoModalOpen(false); setPacasSeleccionadas([]); }} title="Comprobante de Venta" size="lg">
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
                  try { await descargarExcel(despachoData); }
                  catch (err) { addToast('No se pudo generar el Excel: ' + err.message, 'error'); }
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
                  catch (err) { addToast('No se pudo generar el PDF: ' + err.message, 'error'); }
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