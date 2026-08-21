import { useEffect, useState, useMemo, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm, TableSkeleton, EmptyState, RefLink } from '../components/common';
import { pacasApi, lotesApi, reservasApi, clientesApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { PACA_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Layers, Hash, Grid, List, ChevronDown, ChevronRight, ChevronLeft, Package, Eye, EyeOff, Link, Unlink, Download, Calendar, User, X } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { hoy } from '../lib/fecha';
import { descargarExcel } from '../lib/descargar';

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
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [limite, setLimite] = useState(50);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
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
  const [error, setError] = useState('');
  const [vistaAgrupada, setVistaAgrupada] = useState(true);
  const [inventarioAgrupado, setInventarioAgrupado] = useState([]);
  const [loadingAgrupado, setLoadingAgrupado] = useState(false);
  const [tiposExpandidos, setTiposExpandidos] = useState({});
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
  const filtrosKey = `${filtroEstado}|${filtroTipo}|${debouncedSearch}|${limite}`;
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
  }, [filtroEstado, filtroTipo, debouncedSearch]);

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

  const loadPacas = async () => {
    const miCarga = ++cargaPacasRef.current;
    try {
      setLoading(true);
      const params = { pagina, limite };
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroTipo) params.tipo = filtroTipo;
      if (debouncedSearch) params.buscar = debouncedSearch;

      // Las tarjetas de resumen se calculan sobre el inventario agrupado, así que
      // ya no hace falta pedir /pacas/resumen en cada carga.
      const data = await pacasApi.getAll(params);

      if (miCarga !== cargaPacasRef.current) return; // respuesta vieja: la descartamos
      setPacas(data.data || data);
      if (data.total_paginas) setTotalPaginas(data.total_paginas);
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
      loadPacas();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        clasificacion: formData.clasificacion,
        referencia: formData.referencia,
        categoria: formData.categoria || null,
        peso: parseFloat(formData.peso) || 0,
        costo_base: parseFloat(formData.costo_base) || 0,
        precio_venta: parseFloat(formData.precio_venta) || 0,
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
      loadPacas();
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
      message: 'La unidad será eliminada del inventario permanentemente.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pacasApi.delete(id);
      loadPacas();
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
      loadPacas();
      loadLotes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getLoteNumero = (loteId) => {
    const lote = lotes.find(l => l.id === loteId);
    return lote ? lote.numero : null;
  };

  const resetForm = () => {
    setEditando(null);
    setFormData({ clasificacion: '', referencia: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1 });
  };

  const [exporting, setExporting] = useState(false);

  const fetchInventarioActual = async () => {
    const params = { limite: 10000 };
    if (filtroEstado) params.estado = filtroEstado;
    if (filtroTipo) params.tipo = filtroTipo;
    if (debouncedSearch) params.buscar = debouncedSearch;

    const res = await pacasApi.getAll(params);
    return res.data || res;
  };

  const fetchInventarioAgrupadoActual = async () => {
    const params = {};
    if (filtroEstado)    params.estado = filtroEstado;
    if (filtroTipo)      params.tipo   = filtroTipo;
    if (debouncedSearch) params.buscar = debouncedSearch;
    return await pacasApi.getInventario(params);
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
        { header: 'Físico',         key: 'fisico',         width: 10 },
        { header: 'Despachadas',    key: 'despachadas',    width: 12 },
        { header: 'Separadas',      key: 'separadas',      width: 11 },
        { header: 'Disponibles',    key: 'disponibles',    width: 12 },
        { header: 'Costo Unit.',    key: 'costo_unit',     width: 14 },
        { header: 'Precio Unit.',   key: 'precio_unit',    width: 14 },
        { header: 'Costo Total',    key: 'costo_total',    width: 16 },
        { header: 'Precio Total',   key: 'precio_total',   width: 16 },
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
          costo_unit:    parseFloat(row.costo_unitario) || 0,
          precio_unit:   parseFloat(row.precio_unitario) || 0,
          costo_total:   parseFloat(row.costo_total) || 0,
          precio_total:  parseFloat(row.precio_total) || 0,
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
      const totalPrecio   = agrupado.reduce((s, r) => s + (parseFloat(r.precio_total) || 0), 0);
      const totalRow = wsAg.addRow({
        contenedor: 'TOTAL', fisico: totalFisico, disponibles: totalDisp,
        costo_total: totalCosto, precio_total: totalPrecio,
      });
      totalRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      });

      wsAg.getColumn('costo_unit').numFmt   = '$#,##0.00';
      wsAg.getColumn('precio_unit').numFmt  = '$#,##0.00';
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
      const totalPrecio = agrupado.reduce((s, r) => s + (parseFloat(r.precio_total) || 0), 0);
      doc.text(`Pacas individuales: ${totalPacas}   ·   Físico: ${totalFisico}   ·   Disponibles: ${totalDisp}   ·   Valor: ${formatCurrency(totalPrecio)}`, 14, 31);

      // ── Sección 1: Vista Agrupada ─────────────────────────────
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text('Vista Agrupada (inventario por tipo)', 14, 41);

      autoTable(doc, {
        startY: 45,
        head: [['Contenedor', 'Proveedor', 'Clasificación', 'Referencia', 'Calidad', 'Físico', 'Separadas', 'Despachadas', 'Disponibles', 'Precio Unit.', 'Precio Total']],
        body: agrupado.map(r => [
          r.contenedor || 'Sin contenedor',
          r.proveedor_nombre || '—',
          r.clasificacion,
          r.referencia,
          r.calidad || '—',
          parseInt(r.fisico) || 0,
          parseInt(r.separadas) || 0,
          parseInt(r.despachadas) || 0,
          parseInt(r.disponibles) || 0,
          formatCurrency(r.precio_unitario),
          formatCurrency(r.precio_total),
        ]),
        foot: [[
          'TOTAL', '', '', '', '',
          totalFisico, '', '', totalDisp,
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

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num);
  };

  const pacasAgrupadas = useMemo(() => {
    const grupos = {};
    pacas.forEach(paca => {
      const key = paca.clasificacion || '';
      if (!grupos[key]) {
        grupos[key] = { clasificacion: key, pacas: [] };
      }
      grupos[key].pacas.push(paca);
    });
    return Object.values(grupos).sort((a, b) => a.clasificacion.localeCompare(b.clasificacion));
  }, [pacas]);

  const toggleTipo = (tipo) => {
    setTiposExpandidos(prev => ({ ...prev, [tipo]: !prev[tipo] }));
  };

  // ── Excel de separadas, con una hoja por cliente ──────────────────
  // Cada cliente ve solo lo suyo, agrupado por referencia y calidad, que es como
  // la bodega lo alista. La primera hoja resume cuánto tiene apartado cada uno.
  const exportarSeparadasPorCliente = async () => {
    const PRIMARY = '0f172a', WARNING = 'd97706', WHITE = 'ffffff', LIGHT = 'f1f5f9';
    try {
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
    }
  };

  // Las tarjetas de arriba resumen por CATEGORÍA. Se calculan sobre el inventario
  // agrupado —que es lo mismo que muestra la tabla— y no sobre /pacas/resumen,
  // que viene paginado y agrupa por clasificación.
  const resumenCategorias = useMemo(() => {
    const acc = {};
    for (const row of inventarioAgrupado) {
      const key = (row.categoria || '').trim() || 'Sin categoría';
      if (!acc[key]) acc[key] = { categoria: key, fisico: 0, disponibles: 0, separadas: 0, despachadas: 0 };
      acc[key].fisico      += parseInt(row.fisico) || 0;
      acc[key].disponibles += parseInt(row.disponibles) || 0;
      acc[key].separadas   += parseInt(row.separadas) || 0;
      acc[key].despachadas += parseInt(row.despachadas) || 0;
    }
    return Object.values(acc).sort((a, b) => b.fisico - a.fisico);
  }, [inventarioAgrupado]);

  // Filtro por categoría al pulsar una tarjeta (se resuelve en el cliente porque
  // el endpoint de inventario no recibe categoría).
  const filasInventario = filtroCategoria
    ? inventarioAgrupado.filter(r => ((r.categoria || '').trim() || 'Sin categoría') === filtroCategoria)
    : inventarioAgrupado;

  return (
    <Layout title="Inventario" subtitle={`${pacas.length} unidades`}>
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
                aria-label={`Filtrar por categoría ${r.categoria}: ${r.disponibles} disponibles, ${r.despachadas} despachadas, ${r.separadas} separadas, ${r.fisico} en total`}
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
                    <span className="font-medium text-sm capitalize truncate" title={r.categoria}>{r.categoria}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-xs">
                    <div>
                      <p className="text-muted">Disp</p>
                      <p className="font-bold text-emerald-600 tabular-nums">{r.disponibles}</p>
                    </div>
                    <div>
                      <p className="text-muted">Desp</p>
                      <p className="font-bold text-accent tabular-nums">{r.despachadas}</p>
                    </div>
                    <div>
                      <p className="text-muted">Sep</p>
                      <p className="font-bold text-warning tabular-nums">{r.separadas}</p>
                    </div>
                    <div>
                      <p className="text-muted">Total</p>
                      <p className="font-bold text-primary tabular-nums">{r.fisico}</p>
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
              aria-label="Buscar unidades por UUID o notas"
              placeholder="Buscar por UUID o notas..."
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
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              aria-label="Filtrar por estado"
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todos los estados</option>
              {PACA_ESTADOS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              aria-label="Filtrar por clasificación"
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todas las clasificaciones</option>
              {tiposList.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}

            </select>
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

        {error && (
          <div role="alert" className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>
        )}

        {/* Vista Agrupada */}
        {vistaAgrupada ? (
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <caption className="sr-only">Inventario agrupado por contenedor, clasificación y calidad</caption>
                <thead className="bg-primary/3 border-b border-border/50">
                  <tr>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted uppercase">Contenedor</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted uppercase">Proveedor</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted uppercase">Categoría</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted uppercase">Clasificación</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted uppercase">Referencia</th>
                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted uppercase">Calidad</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-muted uppercase">Físico</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-muted uppercase">Despachadas</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-muted uppercase">Separadas</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-muted uppercase">Disponibles</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-muted uppercase">Precio Unit.</th>
                    <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-muted uppercase">Precio Total</th>
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
                    filasInventario.map((row, idx) => (
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
                          {row.tiene_promocion && <span className="ml-1 text-xs text-amber-600">●promo</span>}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-muted capitalize">{row.referencia}</td>
                        <td className="px-3 py-2.5 text-sm text-muted capitalize">{row.calidad || <span className="text-muted/40">—</span>}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">{row.fisico}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-muted">{row.despachadas}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-warning">
                          {row.separadas > 0 ? (
                            <button type="button" onClick={() => verComprometidas(row)}
                              className="text-warning font-semibold hover:underline underline-offset-2 cursor-pointer"
                              aria-label={`Ver por quién están separadas las ${row.separadas} unidades de ${row.clasificacion} ${row.referencia}`}
                              title="Ver por quién están separadas">
                              {row.separadas}
                            </button>
                          ) : row.separadas}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-600">{row.disponibles}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-secondary">{formatCurrency(row.precio_unitario)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-sm text-secondary/70">{formatCurrency(row.precio_total)}</td>
                      </tr>
                    ))
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
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">UUID</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Clasificación</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Referencia</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Peso</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Costo</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Precio</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Contenedor</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado / Cotización</th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
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
                              {paca.cotizacion_cliente && (
                                <span className="block text-xs text-muted truncate max-w-[130px]">{paca.cotizacion_cliente}</span>
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

        {/* Paginación */}
        {totalPaginas > 0 && (
          <div className="flex flex-col sm:flex-row justify-between items-center bg-surface p-4 rounded-xl border border-border mt-4 gap-4 shadow-sm">
            <div className="flex items-center gap-2">
              <label htmlFor="pacas-por-pagina" className="text-sm text-muted">Mostrar:</label>
              <select
                id="pacas-por-pagina"
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value))}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={250}>250</option>
              </select>
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
          {error && <div role="alert" className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>}

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
              <input id="paca-categoria" list="temporadas-paca-form" className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                placeholder="Verano / Invierno" />
              <datalist id="temporadas-paca-form">
                {temporadasList.map(t => <option key={t} value={t.charAt(0).toUpperCase() + t.slice(1)} />)}
              </datalist>
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
                          <span key={p.id} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${p.estado === 'vendida' ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'}`}
                            title={`${p.estado} · ${formatCurrency(p.precio_venta)}`}>
                            {p.uuid?.slice(0, 8)} · {p.estado}
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
