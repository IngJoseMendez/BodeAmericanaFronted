import { useEffect, useState, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm } from '../components/common';
import { carteraApi, clientesApi, pagosApi } from '../services/api';
import { METODOS_PAGO } from '../types';
import ExcelJS from 'exceljs';
import { Plus, Search, Wallet, TrendingDown, TrendingUp, Download, FileSpreadsheet, User, X, Edit2, Trash2, AlertTriangle, CheckCircle } from 'lucide-react';

export default function Cartera() {
  const [cartera, setCartera] = useState([]);
  const [carteraOriginal, setCarteraOriginal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detalleCliente, setDetalleCliente] = useState(null);
  const [editandoAbono, setEditandoAbono] = useState(null); // { id, monto, fecha, metodo_pago, referencia }
  const [formData, setFormData] = useState({
    cliente_id: '', monto: '', fecha: new Date().toISOString().split('T')[0], metodo_pago: 'efectivo', referencia: ''
  });
  const [saldoCliente, setSaldoCliente] = useState(null); // saldo pendiente del cliente seleccionado
  const [clientes, setClientes] = useState([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteList, setShowClienteList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const clienteListRef = useRef(null);
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Cerrar lista de clientes al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (clienteListRef.current && !clienteListRef.current.contains(event.target)) {
        setShowClienteList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    loadCartera();
  }, []);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setCartera(carteraOriginal);
    } else {
      const filtered = carteraOriginal.filter(c => 
        c.nombre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.ciudad?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.telefono?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setCartera(filtered);
    }
  }, [searchQuery, carteraOriginal]);

  const loadCartera = async () => {
    try {
      const data = await carteraApi.getAll();
      setCartera(data);
      setCarteraOriginal(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const openDetalle = async (clienteId) => {
    try {
      const data = await carteraApi.getOne(clienteId);
      setDetalleCliente(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const openPagoModal = async () => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
      setFormData({
        cliente_id: '',
        monto: '',
        fecha: new Date().toISOString().split('T')[0],
        metodo_pago: 'efectivo',
        referencia: ''
      });
      setClienteSearch('');
      setSaldoCliente(null);
      setError('');
      setModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Cargar saldo del cliente seleccionado para mostrar aviso de sobreabono
  const cargarSaldoCliente = async (clienteId) => {
    if (!clienteId) { setSaldoCliente(null); return; }
    try {
      const data = await carteraApi.getOne(clienteId);
      setSaldoCliente(data.saldo_pendiente);
    } catch {
      setSaldoCliente(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.cliente_id) {
      setError('Selecciona un cliente');
      return;
    }
    if (!formData.monto || parseFloat(formData.monto) <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }

    try {
      await pagosApi.create({
        cliente_id: parseInt(formData.cliente_id),
        monto: parseFloat(formData.monto),
        fecha: formData.fecha,
        metodo_pago: formData.metodo_pago,
        referencia: formData.referencia
      });

      addToast(
        `Abono de ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(parseFloat(formData.monto))} registrado correctamente`,
        'success'
      );

      setModalOpen(false);
      setSaldoCliente(null);
      loadCartera();
    } catch (err) {
      setError(err.message);
      addToast('Error al registrar el abono: ' + err.message, 'error');
    }
  };

  // Eliminar abono desde el modal de detalle
  const handleEliminarAbono = async (abonoId) => {
    const ok = await confirm({
      title: '¿Eliminar abono?',
      message: 'Esta acción no se puede deshacer. El saldo del cliente se recalculará automáticamente.',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pagosApi.delete(abonoId);
      addToast('Abono eliminado', 'success');
      // Recargar detalle
      const data = await carteraApi.getOne(detalleCliente.cliente.id);
      setDetalleCliente(data);
      loadCartera();
    } catch (err) {
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  // Guardar edición de abono
  const handleGuardarEdicionAbono = async () => {
    if (!editandoAbono || !editandoAbono.monto || parseFloat(editandoAbono.monto) <= 0) {
      addToast('El monto debe ser mayor a cero', 'error');
      return;
    }
    try {
      await pagosApi.update(editandoAbono.id, {
        monto: parseFloat(editandoAbono.monto),
        fecha: editandoAbono.fecha,
        metodo_pago: editandoAbono.metodo_pago,
        referencia: editandoAbono.referencia,
      });
      addToast('Abono actualizado', 'success');
      setEditandoAbono(null);
      const data = await carteraApi.getOne(detalleCliente.cliente.id);
      setDetalleCliente(data);
      loadCartera();
    } catch (err) {
      addToast('Error al actualizar: ' + err.message, 'error');
    }
  };

  const exportarExcel = async (clienteId, clienteNombre) => {
    try {
      const data = await carteraApi.exportOne(clienteId);
      
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Bodega Americana';
      wb.created = new Date();
      
      const primaryColor = '1a1a2e';
      const secondaryColor = 'd4a373';
      const accentColor = 'bc4749';
      const successColor = '6a994e';
      
      const fmt = (val) => formatCurrency(val);
      
      const ws = wb.addWorksheet('Estado de Cuenta');
      ws.properties.tabColor = secondaryColor;
      
      ws.mergeCells('A1:G1');
      const titleCell = ws.getCell('A1');
      titleCell.value = '📦 BODEGA AMERICANA - Estado de Cuenta';
      titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 30;
      
      ws.mergeCells('A2:G2');
      ws.getCell('A2').value = data.cliente.nombre;
      ws.getCell('A2').font = { size: 14, bold: true, color: { argb: primaryColor } };
      ws.getCell('A2').alignment = { horizontal: 'center' };
      
      ws.mergeCells('A3:G3');
      ws.getCell('A3').value = `Generado: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      ws.getCell('A3').font = { size: 10, italic: true, color: { argb: '666666' } };
      ws.getCell('A3').alignment = { horizontal: 'center' };
      
      ws.getColumn(1).width = 14;
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 25;
      ws.getColumn(4).width = 14;
      ws.getColumn(5).width = 14;
      ws.getColumn(6).width = 16;
      ws.getColumn(7).width = 14;
      
      let row = 5;
      
      ws.getCell(`A${row}`).value = 'Información del Cliente';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      ws.mergeCells(`A${row}:G${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      const infoFields = [
        ['Teléfono:', data.cliente.telefono || '-', 'Ciudad:', data.cliente.ciudad || '-'],
        ['Dirección:', data.cliente.direccion || '-', 'Tipo:', data.cliente.tipo_cliente?.toUpperCase() || '-'],
      ];
      
      for (const [label1, val1, label2, val2] of infoFields) {
        ws.getCell(`A${row}`).value = label1;
        ws.getCell(`A${row}`).font = { bold: true };
        ws.getCell(`B${row}`).value = val1;
        ws.getCell(`C${row}`).value = label2;
        ws.getCell(`C${row}`).font = { bold: true };
        ws.getCell(`D${row}`).value = val2;
        ws.mergeCells(`B${row}:B${row}`);
        ws.mergeCells(`D${row}:G${row}`);
        row++;
      }
      
      row++;
      
      ws.getCell(`A${row}`).value = 'Resumen de Cuenta';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondaryColor } };
      ws.mergeCells(`A${row}:G${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      const kpis = [
        { label: 'Total Vendido', value: data.total_vendido, color: primaryColor },
        { label: 'Total Abonado', value: data.total_abonado, color: successColor },
        { label: 'SALDO PENDIENTE', value: data.saldo_pendiente, color: accentColor },
      ];
      
      for (const kpi of kpis) {
        ws.getCell(`A${row}`).value = kpi.label;
        ws.getCell(`A${row}`).font = { bold: true, size: 11 };
        ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f5f5f5' } };
        
        ws.getCell(`B${row}`).value = kpi.value;
        ws.getCell(`B${row}`).font = { bold: true, size: 14, color: { argb: kpi.color } };
        ws.getCell(`B${row}`).numFmt = '$#,##0.00';
        ws.getCell(`B${row}`).alignment = { horizontal: 'right' };
        ws.mergeCells(`B${row}:G${row}`);
        row++;
      }
      
      row++;
      
      ws.getCell(`A${row}`).value = 'Movimientos';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      ws.mergeCells(`A${row}:G${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      const headers = ['Fecha', 'Tipo', 'Descripción', 'Monto', 'Método', 'Referencia', 'Saldo'];
      headers.forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${row}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
        cell.alignment = { horizontal: 'center' };
      });
      row++;
      
      for (const m of data.movimientos) {
        const esVenta = m.tipo === 'VENTA';
        ws.getCell(`A${row}`).value = new Date(m.fecha);
        ws.getCell(`A${row}`).numFmt = 'dd/mm/yyyy';
        
        ws.getCell(`B${row}`).value = m.tipo;
        ws.getCell(`B${row}`).font = { bold: true, color: { argb: esVenta ? primaryColor : successColor } };
        
        ws.getCell(`C${row}`).value = m.descripcion;
        
        ws.getCell(`D${row}`).value = parseFloat(m.monto);
        ws.getCell(`D${row}`).numFmt = '$#,##0.00';
        ws.getCell(`D${row}`).font = { bold: true, color: { argb: esVenta ? primaryColor : successColor } };
        ws.getCell(`D${row}`).alignment = { horizontal: 'right' };
        
        ws.getCell(`E${row}`).value = m.metodo_pago || '-';
        ws.getCell(`F${row}`).value = m.referencia || '-';
        
        ws.getCell(`G${row}`).value = parseFloat(m.saldo);
        ws.getCell(`G${row}`).numFmt = '$#,##0.00';
        ws.getCell(`G${row}`).font = { bold: true };
        ws.getCell(`G${row}`).alignment = { horizontal: 'right' };
        
        row++;
      }
      
      row++;
      ws.getCell(`A${row}`).value = `Documento generado el ${new Date().toLocaleString('es-MX')}`;
      ws.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: '999999' } };
      ws.mergeCells(`A${row}:G${row}`);
      
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Estado_Cuenta_${data.cliente.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      
      addToast('Excel descargado correctamente', 'success');
    } catch (err) {
      setError('Error al exportar: ' + err.message);
    }
  };
  
  const exportarPDF = async (clienteId, clienteNombre) => {
    try {
      const data = await carteraApi.exportOne(clienteId);
      
      const contenido = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Estado de Cuenta - ${data.cliente.nombre}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1a1a2e; }
            .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #d4a373; }
            .header h1 { color: #1a1a2e; font-size: 24px; margin-bottom: 5px; }
            .header .subtitle { color: #666; font-size: 14px; }
            .info-cliente { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .info-cliente h3 { color: #d4a373; margin-bottom: 10px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .info-grid span { font-size: 13px; }
            .info-grid strong { color: #333; }
            .resumen { background: #1a1a2e; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .resumen h3 { color: #d4a373; margin-bottom: 15px; }
            .resumen-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; }
            .resumen-item .label { font-size: 12px; opacity: 0.8; }
            .resumen-item .value { font-size: 20px; font-weight: bold; }
            .resumen-item.total .value { color: #d4a373; }
            .resumen-item.abonado .value { color: #6a994e; }
            .resumen-item.pendiente .value { color: #bc4749; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #1a1a2e; color: white; padding: 12px; text-align: left; font-size: 12px; }
            td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
            tr.venta td { color: #1a1a2e; }
            tr.abono td { color: #6a994e; }
            tr.venta td:nth-child(4) { font-weight: bold; }
            tr.abono td:nth-child(4) { font-weight: bold; }
            .saldo-col { text-align: right; font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📦 BODEGA AMERICANA</h1>
            <div class="subtitle">Estado de Cuenta</div>
          </div>
          
          <div class="info-cliente">
            <h3>Información del Cliente</h3>
            <div class="info-grid">
              <span><strong>Nombre:</strong> ${data.cliente.nombre}</span>
              <span><strong>Teléfono:</strong> ${data.cliente.telefono || '-'}</span>
              <span><strong>Ciudad:</strong> ${data.cliente.ciudad || '-'}</span>
              <span><strong>Tipo:</strong> ${data.cliente.tipo_cliente || '-'}</span>
              <span><strong>Dirección:</strong> ${data.cliente.direccion || '-'}</span>
            </div>
          </div>
          
          <div class="resumen">
            <h3>Resumen de Cuenta</h3>
            <div class="resumen-grid">
              <div class="resumen-item total">
                <div class="label">Total Vendido</div>
                <div class="value">${formatCurrency(data.total_vendido)}</div>
              </div>
              <div class="resumen-item abonado">
                <div class="label">Total Abonado</div>
                <div class="value">${formatCurrency(data.total_abonado)}</div>
              </div>
              <div class="resumen-item pendiente">
                <div class="label">Saldo Pendiente</div>
                <div class="value">${formatCurrency(data.saldo_pendiente)}</div>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th style="text-align:right">Monto</th>
                <th>Método</th>
                <th>Referencia</th>
                <th style="text-align:right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${data.movimientos.map(m => `
                <tr class="${m.tipo === 'VENTA' ? 'venta' : 'abono'}">
                  <td>${new Date(m.fecha).toLocaleDateString('es-MX')}</td>
                  <td>${m.tipo}</td>
                  <td>${m.descripcion}</td>
                  <td style="text-align:right">${m.tipo === 'VENTA' ? '+' : '-'}${formatCurrency(m.monto)}</td>
                  <td>${m.metodo_pago || '-'}</td>
                  <td>${m.referencia || '-'}</td>
                  <td class="saldo-col">${formatCurrency(m.saldo)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            Documento generado el ${new Date().toLocaleString('es-MX')}
          </div>
        </body>
        </html>
      `;
      
      const printWindow = window.open('', '_blank');
      printWindow.document.write(contenido);
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
      }, 250);
      
      addToast('PDF listo para imprimir', 'success');
    } catch (err) {
      setError('Error al exportar PDF: ' + err.message);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  };

  return (
    <Layout title="Cartera" subtitle="Estado de cuentas por cobrar" actions={
      <Button onClick={openPagoModal} variant="secondary">
        <Plus size={18} className="mr-1" /> Registrar Abono
      </Button>
    }>
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
        )}

        {/* Barra de búsqueda */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente por nombre, ciudad o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-3 flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : cartera.length === 0 ? (
            <div className="col-span-3 text-center py-8 text-gray-400">No hay cartera</div>
          ) : (
            cartera.map((c) => (
              <Card key={c.id} hover className="animate-fade-in" onClick={() => openDetalle(c.id)}>
                <CardBody>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-display text-lg text-primary">{c.nombre}</h3>
                      <p className="text-sm text-gray-500">{c.ciudad || 'Sin ciudad'}</p>
                    </div>
                    <Badge variant={c.tipo_cliente}>{c.tipo_cliente}</Badge>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-gray-100">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Vendido</span>
                      <span className="text-primary">{formatCurrency(c.total_vendido)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Abonado</span>
                      <span className="text-success">{formatCurrency(c.total_abonado)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-100">
                      <span className="font-medium">Saldo Pendiente</span>
                      <span className="font-display text-lg text-accent">{formatCurrency(c.saldo_pendiente)}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={!!detalleCliente} onClose={() => setDetalleCliente(null)} title={detalleCliente?.cliente?.nombre} size="lg">
        {detalleCliente && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">Total Vendido</p>
                <p className="text-lg font-display text-primary">{formatCurrency(detalleCliente.total_vendido)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Abonado</p>
                <p className="text-lg font-display text-success">{formatCurrency(detalleCliente.total_abonado)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Saldo Pendiente</p>
                <p className="text-lg font-display text-accent">{formatCurrency(detalleCliente.saldo_pendiente)}</p>
              </div>
            </div>

            <h4 className="font-display text-primary">Movimientos</h4>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-left">Método</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detalleCliente.movimientos.map(m => (
                    <tr key={m.id} className={editandoAbono?.id === m.id ? 'bg-secondary/5' : ''}>
                      {editandoAbono?.id === m.id ? (
                        // Fila en modo edición
                        <>
                          <td className="px-2 py-1" colSpan={4}>
                            <div className="grid grid-cols-4 gap-2">
                              <input
                                type="number" step="0.01" min="0.01"
                                value={editandoAbono.monto}
                                onChange={e => setEditandoAbono({ ...editandoAbono, monto: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                                placeholder="Monto"
                              />
                              <input
                                type="date"
                                value={editandoAbono.fecha?.split('T')[0]}
                                onChange={e => setEditandoAbono({ ...editandoAbono, fecha: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                              />
                              <select
                                value={editandoAbono.metodo_pago || 'efectivo'}
                                onChange={e => setEditandoAbono({ ...editandoAbono, metodo_pago: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                              >
                                {METODOS_PAGO.map(mp => <option key={mp} value={mp}>{mp}</option>)}
                              </select>
                              <input
                                type="text"
                                value={editandoAbono.referencia || ''}
                                onChange={e => setEditandoAbono({ ...editandoAbono, referencia: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                                placeholder="Referencia"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={handleGuardarEdicionAbono} className="p-1.5 rounded text-success hover:bg-success/10" title="Guardar">
                                <CheckCircle size={15} />
                              </button>
                              <button onClick={() => setEditandoAbono(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-100" title="Cancelar">
                                <X size={15} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // Fila normal
                        <>
                          <td className="px-3 py-2">{new Date(m.fecha).toLocaleDateString('es-MX')}</td>
                          <td className="px-3 py-2">
                            <Badge variant={m.tipo === 'venta' ? 'vendida' : 'disponible'}>
                              {m.tipo === 'venta' ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                              {m.tipo}
                            </Badge>
                          </td>
                          <td className={`px-3 py-2 text-right ${m.tipo === 'venta' ? 'text-primary' : 'text-success'}`}>
                            {m.tipo === 'venta' ? '+' : '-'}{formatCurrency(m.monto)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">{m.metodo_pago || '-'}</td>
                          <td className="px-3 py-2 text-right">
                            {m.tipo === 'abono' && (
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setEditandoAbono({ id: m.id, monto: m.monto, fecha: m.fecha, metodo_pago: m.metodo_pago, referencia: m.referencia })}
                                  className="p-1.5 rounded text-gray-400 hover:text-secondary hover:bg-secondary/10"
                                  title="Editar abono"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleEliminarAbono(m.id)}
                                  className="p-1.5 rounded text-gray-400 hover:text-error hover:bg-error/10"
                                  title="Eliminar abono"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <div className="flex gap-2">
                <Button 
                  variant="secondary" 
                  onClick={() => exportarExcel(detalleCliente.cliente.id, detalleCliente.cliente.nombre)}
                  icon={FileSpreadsheet}
                >
                  Excel
                </Button>
                <Button 
                  variant="secondary" 
                  onClick={() => exportarPDF(detalleCliente.cliente.id, detalleCliente.cliente.nombre)}
                  icon={Download}
                >
                  PDF
                </Button>
              </div>
              <Button variant="ghost" onClick={() => setDetalleCliente(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Abono">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}

          {/* Selector de cliente con búsqueda */}
          <div className="relative" ref={clienteListRef}>
            <label className="block text-sm font-medium text-primary mb-1">
              Cliente <span className="text-error">*</span>
            </label>
            
            {/* Si ya hay cliente seleccionado, mostrar tag */}
            {formData.cliente_id ? (
              <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                <div className="p-2 bg-secondary/20 rounded-lg">
                  <User className="w-4 h-4 text-secondary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-secondary">
                    {clientes.find(c => c.id === formData.cliente_id)?.nombre || 'Cliente'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {clientes.find(c => c.id === formData.cliente_id)?.ciudad || ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, cliente_id: '' });
                    setClienteSearch('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary/20 text-secondary"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              /* Si no hay cliente, mostrar buscador */
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre..."
                  value={clienteSearch}
                  onChange={(e) => {
                    setClienteSearch(e.target.value);
                    setShowClienteList(true);
                  }}
                  onFocus={() => clienteSearch && setShowClienteList(true)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                />
              </div>
            )}
            
            {/* Lista de clientes filtrados - solo mostrar si hay texto y no hay cliente seleccionado */}
            {!formData.cliente_id && clienteSearch && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {clientes
                  .filter(c => 
                    c.nombre?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                    c.ciudad?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                    c.telefono?.toLowerCase().includes(clienteSearch.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setFormData({ ...formData, cliente_id: c.id });
                        setClienteSearch('');
                        setShowClienteList(false);
                        cargarSaldoCliente(c.id);
                      }}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                        formData.cliente_id === c.id ? 'bg-secondary/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{c.nombre}</p>
                          <p className="text-xs text-gray-500">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                {clientes.filter(c => 
                  c.nombre?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                  c.ciudad?.toLowerCase().includes(clienteSearch.toLowerCase())
                ).length === 0 && (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">
                    No se encontraron clientes
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="Monto"
                type="number"
                step="0.01"
                value={formData.monto}
                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                required
              />
              {/* Aviso de sobreabono */}
              {saldoCliente !== null && formData.monto && parseFloat(formData.monto) > 0 && (() => {
                const monto = parseFloat(formData.monto);
                const exceso = monto - saldoCliente;
                if (saldoCliente <= 0) {
                  return (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>Este cliente no tiene deuda pendiente. El abono quedará como <strong>saldo a favor</strong>.</span>
                    </div>
                  );
                } else if (monto > saldoCliente) {
                  return (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>El abono excede el saldo ({formatCurrency(saldoCliente)}). Los {formatCurrency(exceso)} restantes quedarán como <strong>saldo a favor</strong>.</span>
                    </div>
                  );
                } else {
                  return (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-success bg-success/5 rounded-lg px-3 py-2">
                      <CheckCircle size={13} className="shrink-0" />
                      <span>Saldo pendiente: {formatCurrency(saldoCliente)}. Quedaría {formatCurrency(saldoCliente - monto)} por cobrar.</span>
                    </div>
                  );
                }
              })()}
            </div>
            <Input
              label="Fecha"
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Método de Pago"
              value={formData.metodo_pago}
              onChange={(e) => setFormData({ ...formData, metodo_pago: e.target.value })}
              options={METODOS_PAGO.map(m => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))}
            />
            <Input
              label="Referencia"
              value={formData.referencia}
              onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
              placeholder="No. transacción"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">Registrar Abono</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}