import { useEffect, useState, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm, TableSkeleton, EmptyState } from '../components/common';
import { ventasApi, pacasApi, clientesApi, reservasApi } from '../services/api';
import { PAGO_TIPOS } from '../types';
import { Plus, Search, Trash2, ShoppingCart, Package, User, Calendar, CreditCard, Download, FileSpreadsheet, FileText, X } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    cliente_id: '', tipo_pago: 'contado', fecha: new Date().toISOString().split('T')[0]
  });
  const [pacasSeleccionadas, setPacasSeleccionadas] = useState([]);
  const [error, setError] = useState('');
  const [pacasDisponibles, setPacasDisponibles] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [buscarPacas, setBuscarPacas] = useState('');
  const [despachoModalOpen, setDespachoModalOpen] = useState(false);
  const [ventaCompletada, setVentaCompletada] = useState(null);
  const [despachoData, setDespachoData] = useState(null);
  const [filtroVista, setFiltroVista] = useState('disponible'); // disponible, reservada, ventas
  const [reservasActivas, setReservasActivas] = useState([]);
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [reservaForm, setReservaForm] = useState({ cliente_id: '', cantidad: 1, notas: '', dias_expiracion: 7 });
  const [pacasReservadas, setPacasReservadas] = useState([]);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const { addToast } = useToast();
  const confirm = useConfirm();
  
  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroFechaInicio, setFiltroFechaInicio] = useState('');
  const [filtroFechaFin, setFiltroFechaFin] = useState('');
  const [filtroMontoMin, setFiltroMontoMin] = useState('');
  const [filtroMontoMax, setFiltroMontoMax] = useState('');
  
  // Buscador cliente en modal
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [showListaClientes, setShowListaClientes] = useState(false);
  const clienteListRef = useRef(null);
  
  // Buscador cliente en modal reserva
  const [busquedaClienteReserva, setBusquedaClienteReserva] = useState('');
  const [showListaClientesReserva, setShowListaClientesReserva] = useState(false);
  const clienteReservaListRef = useRef(null);
  
  const debouncedBuscarPacas = useDebounce(buscarPacas, 300);

useEffect(() => {
    loadVentas();
    loadClientes();
    loadReservas();
  }, [filtroVista, pagina]);

  // Cerrar lista clientes al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (clienteListRef.current && !clienteListRef.current.contains(e.target)) {
        setShowListaClientes(false);
      }
      if (clienteReservaListRef.current && !clienteReservaListRef.current.contains(e.target)) {
        setShowListaClientesReserva(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtrar ventas
  const ventasFiltradas = ventas.filter(v => {
    const cliente = clientes.find(c => c.id === v.cliente_id);
    const nombreCliente = cliente?.nombre?.toLowerCase() || '';
    const searchLower = busqueda.toLowerCase();
    
    if (busqueda && !nombreCliente.includes(searchLower)) return false;
    
    if (filtroFechaInicio) {
      const fechaVenta = new Date(v.fecha);
      const fechaIni = new Date(filtroFechaInicio);
      if (fechaVenta < fechaIni) return false;
    }
    if (filtroFechaFin) {
      const fechaVenta = new Date(v.fecha);
      const fechaFin = new Date(filtroFechaFin);
      fechaFin.setHours(23, 59, 59);
      if (fechaVenta > fechaFin) return false;
    }
    if (filtroMontoMin && v.total < parseFloat(filtroMontoMin)) return false;
    if (filtroMontoMax && v.total > parseFloat(filtroMontoMax)) return false;
    
    return true;
  });

  const loadVentas = async (page = 1) => {
    try {
      const response = await ventasApi.getAll({ pagina: page, limite: 20 });
      const data = response.data || response;
      setVentas(Array.isArray(data) ? data : []);
      if (response.total_paginas) setTotalPaginas(response.total_paginas);
      setPagina(response.pagina || page);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
};

  const loadReservas = async () => {
    try {
      const data = await reservasApi.getAll({ estado: 'activa' });
      setReservasActivas(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadClientes = async () => {
    try {
      const clientesRes = await clientesApi.getAll({ estado: 'activo' });
      setClientes((clientesRes.data || clientesRes) || []);
    } catch (err) {
      console.error(err);
    }
  };

  const openModal = async () => {
    try {
      const [pacasRes, clientesRes] = await Promise.all([
        pacasApi.getAll({ estado: 'disponible' }),
        clientesApi.getAll({ estado: 'activo' })
      ]);
      const pacasData = pacasRes.data || pacasRes;
      const clientesData = clientesRes.data || clientesRes;
      
      setPacasDisponibles(Array.isArray(pacasData) ? pacasData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      setFormData({
        cliente_id: '',
        tipo_pago: 'contado',
        fecha: new Date().toISOString().split('T')[0]
      });
      setPacasSeleccionadas([]);
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
      setPacasSeleccionadas([...pacasSeleccionadas, { ...paca, precio_venta: paca.precio_venta }]);
    }
  };

  const updatePrecio = (pacaId, precio) => {
    setPacasSeleccionadas(pacasSeleccionadas.map(p => 
      p.id === pacaId ? { ...p, precio_venta: parseFloat(precio) } : p
    ));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.cliente_id) {
      setError('Selecciona un cliente');
      return;
    }
    if (pacasSeleccionadas.length === 0) {
      setError('Selecciona al menos una paca');
      return;
    }

    try {
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
      
      setVentaCompletada(ventaInfo);
      setDespachoData(ventaInfo);
      setDespachoModalOpen(true);
      
      addToast(`Venta registrada — ${pacasSeleccionadas.length} paca(s) por ${formatCurrency(totalVenta)}`, 'success');
      setModalOpen(false);
      // Reset form after successful sale
      setFormData({ cliente_id: '', tipo_pago: 'contado', fecha: new Date().toISOString().split('T')[0] });
      setPacasSeleccionadas([]);
      loadVentas();
    } catch (err) {
      setError(err.message);
      addToast('Error al registrar venta: ' + err.message, 'error');
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

  const totalVenta = pacasSeleccionadas.reduce((sum, p) => sum + parseFloat(p.precio_venta), 0);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-MX');
  };

  const descargarExcel = async (data) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bodega Americana';
    wb.created = new Date();
    
    const ws = wb.addWorksheet('Venta');
    ws.properties.tabColor = '0f172a';
    
    // Título
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = '📦 BODEGA AMERICANA - Comprobante de Venta';
    ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    
    // Datos del cliente
    ws.getCell('A3').value = 'Cliente:';
    ws.getCell('B3').value = data.cliente?.nombre || 'N/A';
    ws.getCell('A4').value = 'Fecha:';
    ws.getCell('B4').value = data.fecha;
    ws.getCell('A5').value = 'Tipo de Pago:';
    ws.getCell('B5').value = data.tipo_pago === 'contado' ? 'Contado' : 'Crédito';
    ws.getCell('A6').value = 'Folio:';
    ws.getCell('B6').value = data.uuid?.slice(0, 8).toUpperCase();
    
    // Encabezados
    const headersRow = 8;
    ['Tipo', 'Categoría', 'Precio Unitario'].forEach((h, i) => {
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
      ws.getCell(`C${row}`).value = parseFloat(paca.precio_venta);
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
    
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Venta_${data.uuid?.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    
    addToast('Excel descargado', 'success');
  };

  const descargarPDF = (data) => {
    const doc = new jsPDF();
    
    // Título
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 46);
    doc.text('BODEGA AMERICANA', 105, 20, { align: 'center' });
    
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
      head: [['Tipo', 'Categoría', 'Precio']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [26, 26, 46] },
      footStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9 }
    });
    
    doc.save(`Venta_${data.uuid?.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.pdf`);
    addToast('PDF descargado', 'success');
  };

  const filteredPacas = buscarPacas 
    ? pacasDisponibles.filter(p => 
        p.clasificacion?.includes(buscarPacas) || p.uuid.includes(buscarPacas)
      )
    : pacasDisponibles;

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
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const loadPacasDisponibles = async () => {
    try {
      const pacasRes = await pacasApi.getAll({ estado: 'disponible' });
      setPacasDisponibles((pacasRes.data || pacasRes) || []);
    } catch (err) {
      console.error(err);
    }
  };

  const convertirReservaAVenta = async (reserva) => {
    try {
      await ventasApi.create({
        cliente_id: reserva.cliente_id,
        tipo_pago: 'contado',
        fecha: new Date().toISOString().split('T')[0],
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
      wb.creator = 'Bodega Americana';
      wb.created = new Date();
      
      const ws = wb.addWorksheet('Venta');
      ws.properties.tabColor = '0f172a';
      
      ws.mergeCells('A1:E1');
      ws.getCell('A1').value = '📦 BODEGA AMERICANA - Comprobante de Venta';
      ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0f172a' } };
      ws.getCell('A1').alignment = { horizontal: 'center' };
      
      ws.getCell('A3').value = 'Folio:';
      ws.getCell('B3').value = venta.uuid?.slice(0, 8).toUpperCase();
      ws.getCell('A4').value = 'Cliente:';
      ws.getCell('B4').value = ventaDetalle.cliente_nombre || cliente.nombre || 'N/A';
      ws.getCell('A5').value = 'Fecha:';
      ws.getCell('B5').value = new Date(venta.fecha).toLocaleDateString('es-MX');
      ws.getCell('A6').value = 'Tipo de Pago:';
      ws.getCell('B6').value = venta.tipo_pago === 'contado' ? 'Contado' : 'Crédito';
      
      const headersRow = 8;
      ['Cantidad', 'Tipo', 'Categoría', 'Peso (kg)', 'Precio Unitario'].forEach((h, i) => {
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
        ws.getCell(`E${row}`).value = parseFloat(paca.precio_unitario || 0);
        ws.getCell(`E${row}`).numFmt = '$#,##0.00';
        total += parseFloat(paca.precio_unitario || 0);
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
      
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Venta_${venta.uuid?.slice(0, 8)}_${venta.fecha}.xlsx`;
      link.click();
      
      addToast('Excel descargado', 'success');
    } catch (err) {
      addToast('Error al descargar: ' + err.message, 'error');
    }
  };

  const getClienteNombre = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre || `Cliente #${clienteId}`;
  };

  return (
    <Layout title="Ventas" subtitle={`${ventas.length} ventas registradas`}>
      <div className="space-y-4">
        {/* Filtros / Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            onClick={() => setFiltroVista('disponible')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              filtroVista === 'disponible' 
                ? 'bg-primary text-white' 
                : 'text-primary hover:bg-primary/10'
            }`}
          >
            Nueva Venta
          </button>
          <button
            onClick={() => setFiltroVista('reservada')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              filtroVista === 'reservada' 
                ? 'bg-success text-white' 
                : 'text-green-700 hover:bg-green-50'
            }`}
          >
            Reservas ({reservasActivas.length})
          </button>
        </div>

        {/* Vista de Nueva Venta */}
        {filtroVista === 'disponible' && (
          <>
            <div className="flex justify-end gap-2">
              <Button onClick={openReservaModal} variant="info" disabled={pacasSeleccionadas.length === 0}>
                <Calendar size={18} className="mr-1" /> Reservar ({pacasSeleccionadas.length})
              </Button>
              <Button onClick={openModal} variant="secondary">
                <Plus size={18} className="mr-1" /> Nueva Venta
              </Button>
            </div>

            {error && (
              <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
            )}

            {/* Filtros de ventas */}
            <Card>
              <CardBody className="p-0">
                <div className="p-4 border-b border-border/50 bg-primary/3">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <Input
                        placeholder="Buscar por cliente..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div className="w-36">
                      <Input
                        type="date"
                        placeholder="Desde"
                        value={filtroFechaInicio}
                        onChange={(e) => setFiltroFechaInicio(e.target.value)}
                      />
                    </div>
                    <div className="w-36">
                      <Input
                        type="date"
                        placeholder="Hasta"
                        value={filtroFechaFin}
                        onChange={(e) => setFiltroFechaFin(e.target.value)}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        placeholder="Min $"
                        value={filtroMontoMin}
                        onChange={(e) => setFiltroMontoMin(e.target.value)}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        placeholder="Max $"
                        value={filtroMontoMax}
                        onChange={(e) => setFiltroMontoMax(e.target.value)}
                      />
                    </div>
                    {(busqueda || filtroFechaInicio || filtroFechaFin || filtroMontoMin || filtroMontoMax) && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        setBusqueda('');
                        setFiltroFechaInicio('');
                        setFiltroFechaFin('');
                        setFiltroMontoMin('');
                        setFiltroMontoMax('');
                      }}>
                        Limpiar
                      </Button>
                    )}
                  </div>
                  {ventasFiltradas.length !== ventas.length && (
                    <p className="text-xs text-muted mt-2">Mostrando {ventasFiltradas.length} de {ventas.length} ventas</p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-primary/5 border-b border-border/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Cliente</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo Pago</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {loading ? (
                        <TableSkeleton cols={7} rows={6} />
                      ) : ventasFiltradas.length === 0 ? (
                        <tr><td colSpan={7}><EmptyState title="Sin ventas" description="No hay ventas que coincidan con los filtros aplicados" /></td></tr>
                      ) : (
                        ventasFiltradas.map((venta) => (
                          <tr key={venta.id} className="hover:bg-primary/5 transition-colors">
                            <td className="px-4 py-3 text-sm text-muted font-mono">#{venta.id}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatDate(venta.fecha)}</td>
                            <td className="px-4 py-3 text-sm text-primary font-medium">{getClienteNombre(venta.cliente_id)}</td>
                            <td className="px-4 py-3"><Badge variant={venta.tipo_pago}>{venta.tipo_pago}</Badge></td>
                            <td className="px-4 py-3 text-sm text-primary font-medium">{formatCurrency(venta.total)}</td>
                            <td className="px-4 py-3"><Badge variant="disponible">{venta.estado}</Badge></td>
                            <td className="px-4 py-3 text-right flex gap-1 justify-end">
                              <button 
                                onClick={() => descargarExcelVenta(venta)} 
                                className="p-1.5 rounded-lg text-gray-400 hover:text-success hover:bg-success/10"
                                title="Descargar Excel"
                              >
                                <FileSpreadsheet size={16} />
                              </button>
                              <button 
                                onClick={() => handleDelete(venta.id)} 
                                className="p-1.5 rounded-lg text-gray-400 hover:text-error hover:bg-error/10"
                              >
                                <Trash2 size={16} />
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
              <div className="flex justify-center items-center gap-2 py-4 border-t border-border">
                <button
                  onClick={() => setPagina(p => Math.max(1, p - 1))}
                  disabled={pagina === 1}
                  className="px-3 py-1 rounded-lg border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/5"
                >
                  Anterior
                </button>
                <span className="text-sm text-muted">
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                  disabled={pagina === totalPaginas}
                  className="px-3 py-1 rounded-lg border border-border disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/5"
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}

        {/* Vista de Reservas */}
        {filtroVista === 'reservada' && (
          <Card>
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-green-50 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Paca</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Precio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Expiración</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Notas</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reservasActivas.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay reservas activas</td></tr>
                    ) : (
                      reservasActivas.map((reserva) => (
                        <tr key={reserva.id} className="hover:bg-green-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-800">
                            <div className="font-medium">{reserva.paca_tipo}</div>
                            <div className="text-xs text-muted">{reserva.paca_categoria}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-800 font-medium">{reserva.cliente_nombre}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{formatCurrency(reserva.precio_venta)}</td>
                          <td className="px-4 py-3 text-sm text-muted">{reserva.fecha_expiracion ? formatDate(reserva.fecha_expiracion) : '-'}</td>
                          <td className="px-4 py-3 text-sm text-muted max-w-xs truncate">{reserva.notas || '-'}</td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" onClick={() => convertirReservaAVenta(reserva)} variant="success">
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
        )}

        {/* Vista de Ventas Realizadas */}
        {filtroVista === 'ventas' && (
          <Card>
            <CardBody className="p-0">
              {/* Filtros */}
              <div className="p-4 border-b border-border/50 bg-primary/3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Input
                      placeholder="Buscar por cliente..."
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="w-36">
                    <Input
                      type="date"
                      placeholder="Desde"
                      value={filtroFechaInicio}
                      onChange={(e) => setFiltroFechaInicio(e.target.value)}
                    />
                  </div>
                  <div className="w-36">
                    <Input
                      type="date"
                      placeholder="Hasta"
                      value={filtroFechaFin}
                      onChange={(e) => setFiltroFechaFin(e.target.value)}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      placeholder="Min $"
                      value={filtroMontoMin}
                      onChange={(e) => setFiltroMontoMin(e.target.value)}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      placeholder="Max $"
                      value={filtroMontoMax}
                      onChange={(e) => setFiltroMontoMax(e.target.value)}
                    />
                  </div>
                  {(busqueda || filtroFechaInicio || filtroFechaFin || filtroMontoMin || filtroMontoMax) && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setBusqueda('');
                      setFiltroFechaInicio('');
                      setFiltroFechaFin('');
                      setFiltroMontoMin('');
                      setFiltroMontoMax('');
                    }}>
                      Limpiar
                    </Button>
                  )}
                </div>
                {ventasFiltradas.length !== ventas.length && (
                  <p className="text-xs text-muted mt-2">Mostrando {ventasFiltradas.length} de {ventas.length} ventas</p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-success/10 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Folio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Cliente</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo Pago</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Total</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ventasFiltradas.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No hay ventas realizadas</td></tr>
                    ) : (
                      ventasFiltradas.map((venta) => (
                        <tr key={venta.id} className="hover:bg-success/5 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted font-mono">{venta.uuid?.slice(0, 8).toUpperCase()}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{formatDate(venta.fecha)}</td>
                          <td className="px-4 py-3 text-sm text-primary font-medium">{getClienteNombre(venta.cliente_id)}</td>
                          <td className="px-4 py-3"><Badge variant={venta.tipo_pago}>{venta.tipo_pago}</Badge></td>
                          <td className="px-4 py-3 text-sm text-primary font-bold">{formatCurrency(venta.total)}</td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="success" onClick={() => descargarExcelVenta(venta)}>
                              <FileSpreadsheet size={14} className="mr-1" /> Excel
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
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Venta" size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}
          
          <div className="grid grid-cols-3 gap-4">
            {/* Selector de cliente con búsqueda */}
            <div className="relative" ref={clienteListRef}>
              <label className="block text-sm font-medium text-primary mb-1">
                Cliente <span className="text-error">*</span>
              </label>
              
              {formData.cliente_id ? (
                <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                  <div className="p-2 bg-secondary/20 rounded-lg">
                    <User className="w-4 h-4 text-secondary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-secondary">
                      {clientes.find(c => c.id === parseInt(formData.cliente_id))?.nombre || 'Cliente'}
                    </p>
                    <p className="text-xs text-muted">
                      {clientes.find(c => c.id === parseInt(formData.cliente_id))?.ciudad || ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, cliente_id: '' });
                      setBusquedaCliente('');
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
                    value={busquedaCliente}
                    onChange={(e) => {
                      setBusquedaCliente(e.target.value);
                      setShowListaClientes(true);
                    }}
                    onFocus={() => busquedaCliente && setShowListaClientes(true)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                  />
                </div>
              )}
              
              {!formData.cliente_id && busquedaCliente && (
                <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {clientes
                    .filter(c => 
                      c.nombre?.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
                      c.ciudad?.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
                      c.telefono?.toLowerCase().includes(busquedaCliente.toLowerCase())
                    )
                    .slice(0, 10)
                    .map(c => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setFormData({ ...formData, cliente_id: c.id.toString() });
                          setBusquedaCliente('');
                          setShowListaClientes(false);
                        }}
                        className="px-4 py-3 cursor-pointer hover:bg-primary/5 transition-colors duration-150 border-b border-border/50 last:border-b-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <User className="w-4 h-4 text-muted" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{c.nombre}</p>
                            <p className="text-xs text-muted">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
            
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
            <label className="block text-sm font-medium text-primary mb-2">Seleccionar Pacas</label>
            <input
              type="text"
              placeholder="Buscar pacas..."
              value={buscarPacas}
              onChange={(e) => setBuscarPacas(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border"
            />
            
            <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-primary/5 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left"></th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Categoría</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPacas.map(paca => {
                    const selected = pacasSeleccionadas.find(p => p.id === paca.id);
                    return (
                      <tr key={paca.id} className={selected ? 'bg-secondary/10' : ''}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!selected}
                            onChange={() => togglePaca(paca)}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-3 py-2">{paca.clasificacion}</td>
                        <td className="px-3 py-2">{paca.referencia}</td>
                        <td className="px-3 py-2 text-right">
                          {selected ? (
                            <input
                              type="number"
                              value={selected.precio_venta}
                              onChange={(e) => updatePrecio(paca.id, e.target.value)}
                              className="w-24 text-right px-2 py-1 rounded border"
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

          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
            <span className="text-sm text-muted">Total ({pacasSeleccionadas.length} pacas)</span>
            <span className="text-xl font-display text-primary">{formatCurrency(totalVenta)}</span>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">Confirmar Venta</Button>
          </div>
        </form>
      </Modal>

      {/* Modal de Despacho Post-Venta */}
      <Modal isOpen={despachoModalOpen} onClose={() => { setDespachoModalOpen(false); setPacasSeleccionadas([]); }} title="Comprobante de Venta" size="lg">
        {despachoData && (
          <div className="space-y-6">
            {/* Encabezado */}
            <div className="text-center border-b pb-4">
              <h2 className="text-xl font-bold text-primary">BODEGA AMERICANA</h2>
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
              <table className="w-full text-sm">
                <thead className="bg-primary/5">
                  <tr>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-left">Categoría</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {despachoData.pacas.map((paca, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2">{paca.clasificacion}</td>
                      <td className="px-3 py-2 text-muted">{paca.referencia}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(paca.precio_venta)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={2} className="px-3 py-2 text-right">Total:</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(despachoData.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Botones de descarga */}
            <div className="flex gap-3 pt-4">
              <Button onClick={() => descargarExcel(despachoData)} variant="secondary" className="flex-1">
                <FileSpreadsheet size={18} className="mr-2" />
                Descargar Excel
              </Button>
              <Button onClick={() => descargarPDF(despachoData)} variant="primary" className="flex-1">
                <FileText size={18} className="mr-2" />
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
                      className="px-4 py-3 cursor-pointer hover:bg-primary/5 transition-colors duration-150 border-b border-border/50 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/8 rounded-lg">
                          <User className="w-4 h-4 text-muted" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{c.nombre}</p>
                          <p className="text-xs text-muted">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
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
            <Button onClick={handleCrearReserva} className="flex-1">
              Reservar {pacasSeleccionadas.length} paca(s)
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}