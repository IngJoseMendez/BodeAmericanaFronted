import { useEffect, useState, useMemo, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm } from '../components/common';
import { pacasApi, lotesApi, tiposPacaApi, reservasApi, clientesApi } from '../services/api';
import { PACA_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Layers, Hash, Grid, List, ChevronDown, ChevronRight, ChevronLeft, Package, Eye, EyeOff, Link, Unlink, Download, Calendar, User, X } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [resumen, setResumen] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [limite, setLimite] = useState(50);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
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
  const [tiposList,      setTiposList]      = useState([]);
  const [categoriasList, setCategoriasList] = useState([]);
  const [calidadesList,  setCalidadesList]  = useState([]);
  const [temporadasList, setTemporadasList] = useState([]);
  const { addToast } = useToast();
  const confirm = useConfirm();
  
  // Buscador cliente en modal reserva
  const [busquedaClienteReserva, setBusquedaClienteReserva] = useState('');
  const [showListaClientesReserva, setShowListaClientesReserva] = useState(false);
  const clienteReservaListRef = useRef(null);

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    setPagina(1);
  }, [filtroEstado, filtroTipo, debouncedSearch, limite]);

  useEffect(() => {
    loadPacas();
  }, [filtroEstado, filtroTipo, debouncedSearch, pagina, limite]);

  useEffect(() => {
    loadInventarioAgrupado();
  }, [filtroEstado, filtroTipo, debouncedSearch]);

  useEffect(() => {
    loadLotes();
    loadTiposYCategorias();
    loadClientes();
  }, []);

  const loadInventarioAgrupado = async () => {
    try {
      setLoadingAgrupado(true);
      const params = {};
      if (filtroEstado)    params.estado = filtroEstado;
      if (filtroTipo)      params.tipo   = filtroTipo;
      if (debouncedSearch) params.buscar = debouncedSearch;
      const data = await pacasApi.getInventario(params);
      setInventarioAgrupado(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAgrupado(false);
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
    try {
      setLoading(true);
      const params = { pagina, limite };
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroTipo) params.tipo = filtroTipo;
      if (debouncedSearch) params.buscar = debouncedSearch;

      const [data, resumenData] = await Promise.all([
        pacasApi.getAll(params),
        pacasApi.getResumen()
      ]);

      setPacas(data.data || data);
      if (data.total_paginas) setTotalPaginas(data.total_paginas);
      setResumen(resumenData || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
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

  const loadTiposYCategorias = async () => {
    try {
      const [tipos, cats, cals, temps] = await Promise.all([
        tiposPacaApi.getTipos(),
        tiposPacaApi.getCategorias(),
        tiposPacaApi.getCalidades(),
        tiposPacaApi.getTemporadas(),
      ]);
      setTiposList(tipos.map(t => t.nombre));
      setCategoriasList(cats.map(c => c.nombre));
      setCalidadesList(cals.map(c => c.nombre));
      setTemporadasList(temps.map(t => t.nombre));
    } catch (err) {
      setTiposList(['mixta', 'hombre', 'mujer', 'nino']);
      setCategoriasList(['mixta', 'chaqueta', 'pantalón', 'shorts', 'blusa', 'vestido']);
      setCalidadesList(['premium', 'supreme', 'especial']);
      setTemporadasList(['verano', 'invierno']);
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

  const exportarInventarioExcel = async () => {
    try {
      setExporting(true);
      const datos = await fetchInventarioActual();
      if (!datos.length) {
        addToast('No hay datos para exportar', 'warning');
        return;
      }

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Bodega Americana';
      wb.created = new Date();
      const ws = wb.addWorksheet('Inventario Pacas');
      ws.properties.tabColor = { argb: '0f172a' };

      ws.columns = [
        { header: 'Clasificación',   key: 'clasificacion', width: 18 },
        { header: 'Referencia',     key: 'referencia', width: 14 },
        { header: 'Peso (kg)',       key: 'peso',       width: 11 },
        { header: 'Costo Base',     key: 'costo',      width: 16 },
        { header: 'Precio Venta',   key: 'precio',     width: 16 },
        { header: 'Lote',           key: 'lote',       width: 16 },
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

      const sepColor = 'FFF8E6'; // fondo suave naranja para separadas
      datos.forEach((p, idx) => {
        const isSep = p.estado === 'separada';
        const bg = isSep ? sepColor : (idx % 2 === 0 ? 'FFFFFF' : 'FAF9F7');
        const row = ws.addRow({
          clasificacion: p.clasificacion,
          referencia:    p.referencia,
          peso:       parseFloat(p.peso) || 0,
          costo:      parseFloat(p.costo_base) || 0,
          precio:     parseFloat(p.precio_venta) || 0,
          lote:       getLoteNumero(p.lote_id) || (p.lote_id ? `#${p.lote_id}` : 'Sin lote'),
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

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Inventario_Pacas_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      
      addToast('Excel exportado', 'success');
    } catch (err) {
      addToast('Error al exportar Excel', 'error');
    } finally {
      setExporting(false);
    }
  };

  const exportarInventarioPDF = async () => {
    try {
      setExporting(true);
      const datos = await fetchInventarioActual();
      if (!datos.length) {
        addToast('No hay datos para exportar', 'warning');
        return;
      }

      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text('Bodega Americana - Inventario de Pacas', 14, 20);
      
      doc.setFontSize(11);
      doc.text(`Fecha de reporte: ${new Date().toLocaleDateString('es-MX')}`, 14, 28);
      doc.text(`Total de pacas: ${datos.length}`, 14, 34);

      const tableData = datos.map(p => [
        p.clasificacion,
        p.referencia,
        `${p.peso} kg`,
        formatCurrency(p.precio_venta),
        getLoteNumero(p.lote_id) || (p.lote_id ? `#${p.lote_id}` : 'Sin lote'),
        p.estado
      ]);

      autoTable(doc, {
        startY: 40,
        head: [['Clasificación', 'Referencia', 'Peso', 'Precio Venta', 'Lote', 'Estado']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [26, 26, 46] },
        styles: { fontSize: 9 }
      });

      doc.save(`Inventario_Pacas_${new Date().toISOString().split('T')[0]}.pdf`);
      addToast('PDF exportado', 'success');
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

  return (
    <Layout title="Inventario" subtitle={`${pacas.length} unidades`}>
      <div className="space-y-6">
        {/* Resumen stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resumen.slice(0, 4).map((r, i) => (
            <Card key={i} hover className="cursor-pointer" onClick={() => setFiltroTipo(r.clasificacion)}>
              <CardBody className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-secondary" />
                  <span className="font-medium text-sm">{r.clasificacion}</span>
                </div>
                <div className="grid grid-cols-4 gap-1 text-xs">
                  <div>
                    <p className="text-muted">Disp</p>
                    <p className="font-bold text-success">{parseInt(r.disponibles) || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Sep</p>
                    <p className="font-bold text-warning">{parseInt(r.separadas) || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Vend</p>
                    <p className="font-bold text-accent">{parseInt(r.vendidas) || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Total</p>
                    <p className="font-bold text-primary">{parseInt(r.cantidad) || 0}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar por UUID o notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setVistaAgrupada(true)}
                className={`px-3 py-2 flex items-center gap-2 text-sm transition-colors ${vistaAgrupada ? 'bg-secondary text-on-surface font-medium' : 'bg-surface text-muted hover:bg-primary/5'}`}
              >
                <Grid size={16} />
                <span className="hidden sm:inline">Agrupado</span>
              </button>
              <button
                onClick={() => setVistaAgrupada(false)}
                className={`px-3 py-2 flex items-center gap-2 text-sm transition-colors ${!vistaAgrupada ? 'bg-secondary text-on-surface font-medium' : 'bg-surface text-muted hover:bg-primary/5'}`}
              >
                <List size={16} />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todos los estados</option>
              {PACA_ESTADOS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
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
            <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="secondary">
              <Plus size={16} /> Nueva Unidad
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>
        )}

        {/* Vista Agrupada */}
        {vistaAgrupada ? (
          <Card padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary/3 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Lote</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Categoría</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Clasificación</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Referencia</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Calidad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Cantidad</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Costo Total</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Precio Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loadingAgrupado ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                  ) : inventarioAgrupado.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">No hay unidades en inventario</td></tr>
                  ) : (
                    inventarioAgrupado.map((row, idx) => (
                      <tr key={idx} className="hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">{row.lote}</span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-muted">{row.categoria || <span className="text-muted/40">—</span>}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-primary capitalize">{row.clasificacion}</td>
                        <td className="px-4 py-2.5 text-sm text-muted capitalize">{row.referencia}</td>
                        <td className="px-4 py-2.5 text-sm text-muted capitalize">{row.calidad || <span className="text-muted/40">—</span>}</td>
                        <td className="px-4 py-2.5"><Badge variant={row.estado}>{row.estado}</Badge></td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-primary">{row.cantidad}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm text-muted">{formatCurrency(row.costo_total)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-secondary">{formatCurrency(row.precio_total)}</td>
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
                <thead className="bg-primary/3 border-b border-border/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">UUID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Clasificación</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Referencia</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Peso</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Costo</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Precio</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Lote</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado / Cotización</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                  ) : pacas.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">No hay unidades</td></tr>
                  ) : (
                    pacas.map((paca) => (
                      <tr key={paca.id} className={`hover:bg-primary/3 transition-colors ${paca.estado === 'separada' ? 'bg-warning/5' : ''}`}>
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
                          {paca.lote_id ? (
                            <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">
                              {getLoteNumero(paca.lote_id) || `#${paca.lote_id}`}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">Sin lote</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={paca.estado}>{paca.estado}</Badge>
                          {paca.estado === 'separada' && paca.cotizacion_numero && (
                            <div className="mt-0.5">
                              <span className="text-xs font-semibold text-warning">{paca.cotizacion_numero}</span>
                              {paca.cotizacion_cliente && (
                                <span className="block text-xs text-muted truncate max-w-[130px]">{paca.cotizacion_cliente}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {paca.estado === 'disponible' && (
                              <>
                                <button onClick={() => openReservaModal(paca)} className="p-2 rounded-lg text-muted hover:text-success hover:bg-success/10 transition-all" title="Reservar para cliente">
                                  <Calendar size={16} />
                                </button>
                                <button onClick={() => openAssignModal(paca)} className="p-2 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10 transition-all" title="Asignar a lote">
                                  <Link size={16} />
                                </button>
                              </>
                            )}
                            {paca.estado === 'separada' && (
                              <span className="text-xs bg-warning/10 text-warning px-2 py-1 rounded-full">Separada</span>
                            )}
                            <button onClick={() => handleEdit(paca)} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDelete(paca.id)} className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-all" disabled={paca.estado === 'vendida'}>
                              <Trash2 size={16} />
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
              <span className="text-sm text-muted">Mostrar:</span>
              <select
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
          {error && <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>}

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
              <label className="block text-sm font-medium text-primary mb-1">Categoría <span className="text-muted font-normal">(opcional)</span></label>
              <input list="temporadas-paca-form" className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
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
              <Hash className="w-5 h-5 text-secondary" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-primary">Cantidad</label>
                <p className="text-xs text-muted">Número de unidades del mismo tipo</p>
              </div>
              <input
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
            <div className="p-4 bg-gray-50 rounded-xl">
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
            <label className="block text-sm font-medium text-primary mb-1">
              Cliente <span className="text-error">*</span>
            </label>
            
            {reservaForm.cliente_id ? (
              <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                <div className="p-2 bg-secondary/20 rounded-lg">
                  <User className="w-4 h-4 text-secondary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-secondary">
                    {clientes.find(c => c.id === parseInt(reservaForm.cliente_id))?.nombre || 'Cliente'}
                  </p>
                  <p className="text-xs text-gray-500">
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
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={busquedaClienteReserva}
                  onChange={(e) => {
                    setBusquedaClienteReserva(e.target.value);
                    setShowListaClientesReserva(true);
                  }}
                  onFocus={() => busquedaClienteReserva && setShowListaClientesReserva(true)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                />
              </div>
            )}
            
            {!reservaForm.cliente_id && busquedaClienteReserva && (
              <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {clientes
                  .filter(c => c.estado === 'activo')
                  .filter(c => 
                    c.nombre?.toLowerCase().includes(busquedaClienteReserva.toLowerCase()) ||
                    c.ciudad?.toLowerCase().includes(busquedaClienteReserva.toLowerCase()) ||
                    c.telefono?.toLowerCase().includes(busquedaClienteReserva.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setReservaForm({ ...reservaForm, cliente_id: c.id.toString() });
                        setBusquedaClienteReserva('');
                        setShowListaClientesReserva(false);
                      }}
                      className="px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{c.nombre}</p>
                          <p className="text-xs text-gray-500">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
                        </div>
                      </div>
                    </div>
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
    </Layout>
  );
}
