import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, Badge, useToast, useConfirm } from '../components/common';
import { cotizacionesApi, clientesApi } from '../services/api';
import { PACA_TIPOS, PACA_CATEGORIAS } from '../types';
import { FileText, Plus, Eye, Trash2, Download, Check, X, Clock, User, X as XIcon, Search, ShoppingCart } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value || 0);
};

const generarPDF = (cotizacion) => {
  const contenido = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Cotización ${cotizacion.numero}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a2e; font-size: 14px; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #d4a373; }
        .header h1 { font-size: 28px; margin-bottom: 5px; color: #1a1a2e; }
        .header p { color: #666; font-size: 14px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-box { background: #f9f9f9; padding: 15px; border-radius: 8px; }
        .info-box h3 { color: #d4a373; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; }
        .info-box p { margin: 3px 0; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #1a1a2e; color: white; padding: 12px 15px; text-align: left; font-size: 12px; }
        td { padding: 12px 15px; border-bottom: 1px solid #eee; }
        .text-right { text-align: right; }
        .totals { margin-top: 20px; }
        .totals-row { display: flex; justify-content: flex-end; margin: 5px 0; }
        .totals-label { width: 150px; text-align: right; color: #666; }
        .totals-value { width: 120px; text-align: right; font-weight: bold; }
        .totals-total { font-size: 18px; color: #1a1a2e; border-top: 2px solid #1a1a2e; padding-top: 10px; margin-top: 10px; }
        .notes { background: #fff8e6; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #d4a373; }
        .footer { margin-top: 50px; text-align: center; color: #999; font-size: 11px; }
        .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-pendiente { background: #fff3cd; color: #856404; }
        .status-aprobada { background: #d4edda; color: #155724; }
        .status-rechazada { background: #f8d7da; color: #721c24; }
        .status-vencida { background: #e2e3e5; color: #383d41; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📦 BODEGA AMERICANA</h1>
        <p>COTIZACIÓN</p>
      </div>
      
      <div class="info-grid">
        <div class="info-box">
          <h3>Datos de la Cotización</h3>
          <p><span class="bold">Número:</span> ${cotizacion.numero}</p>
          <p><span class="bold">Fecha:</span> ${new Date(cotizacion.created_at).toLocaleDateString('es-MX')}</p>
          <p><span class="bold">Válida hasta:</span> ${new Date(cotizacion.fecha_vencimiento).toLocaleDateString('es-MX')}</p>
          <p>
            <span class="bold">Estado:</span> 
            <span class="status status-${cotizacion.estado}">${cotizacion.estado?.toUpperCase()}</span>
          </p>
        </div>
        <div class="info-box">
          <h3>Datos del Cliente</h3>
          <p><span class="bold">Cliente:</span> ${cotizacion.cliente_nombre || 'N/A'}</p>
          <p><span class="bold">Teléfono:</span> ${cotizacion.cliente_telefono || 'N/A'}</p>
          <p><span class="bold">Ciudad:</span> ${cotizacion.cliente_ciudad || 'N/A'}</p>
          <p><span class="bold">Vendedor:</span> ${cotizacion.vendedor_nombre || 'N/A'}</p>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Categoría</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Precio Unit.</th>
            <th class="text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${cotizacion.detalles?.map(item => `
            <tr>
              <td>${item.tipo}</td>
              <td>${item.categoria || '-'}</td>
              <td class="text-right">${item.cantidad}</td>
              <td class="text-right">${formatCurrency(item.precio_unitario)}</td>
              <td class="text-right">${formatCurrency(item.subtotal)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals">
        <div class="totals-row">
          <span class="totals-label">Subtotal:</span>
          <span class="totals-value">${formatCurrency(cotizacion.subtotal)}</span>
        </div>
        <div class="totals-row">
          <span class="totals-label">Descuento:</span>
          <span class="totals-value">-${formatCurrency(cotizacion.descuento)}</span>
        </div>
        <div class="totals-row totals-total">
          <span class="totals-label">TOTAL:</span>
          <span class="totals-value">${formatCurrency(cotizacion.total)}</span>
        </div>
      </div>
      
      ${cotizacion.notas ? `
        <div class="notes">
          <strong>Notas:</strong><br>
          ${cotizacion.notas}
        </div>
      ` : ''}
      
      <div class="footer">
        <p>Cotización generada el ${new Date().toLocaleString('es-MX')}</p>
        <p>Bodega Americana - Sistema de Gestión</p>
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
};

export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const { addToast } = useToast();
  const confirm = useConfirm();
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    validez_dias: 15,
    notas: '',
    descuento: 0
  });
  
  const [items, setItems] = useState([
    { tipo: '', categoria: '', cantidad: 1, precio_unitario: 0, subtotal: 0 }
  ]);

  useEffect(() => {
    loadCotizaciones();
    loadClientes();
  }, [filtroEstado]);

  const loadCotizaciones = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      const data = await cotizacionesApi.getAll(params);
      setCotizaciones(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
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

  const openCreateModal = () => {
    setFormData({ cliente_id: '', validez_dias: 15, notas: '', descuento: 0 });
    setItems([{ tipo: '', categoria: '', cantidad: 1, precio_unitario: 0, subtotal: 0 }]);
    setModalOpen(true);
  };

  const openViewModal = async (cotizacion) => {
    try {
      const data = await cotizacionesApi.getOne(cotizacion.id);
      setSelectedCotizacion(data);
      setViewModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const addItem = () => {
    setItems([...items, { tipo: '', categoria: '', cantidad: 1, precio_unitario: 0, subtotal: 0 }]);
  };

  const removeItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    if (field === 'cantidad' || field === 'precio_unitario') {
      newItems[index].subtotal = (newItems[index].cantidad || 0) * (newItems[index].precio_unitario || 0);
    }
    setItems(newItems);
  };

  const calcularTotales = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const descuento = parseFloat(formData.descuento) || 0;
    const total = subtotal - descuento;
    return { subtotal, descuento, total };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.cliente_id) {
      addToast('Selecciona un cliente', 'error');
      return;
    }
    
    const validItems = items.filter(i => i.tipo && i.precio_unitario > 0);
    if (validItems.length === 0) {
      addToast('Agrega al menos un item', 'error');
      return;
    }

    try {
      await cotizacionesApi.create({
        cliente_id: formData.cliente_id,
        vendedor_id: 1,
        validez_dias: formData.validez_dias,
        notas: formData.notas,
        descuento: formData.descuento,
        detalles: validItems
      });
      
      addToast('Cotización creada', 'success');
      setModalOpen(false);
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAprobar = async (id) => {
    try {
      await cotizacionesApi.updateEstado(id, 'aprobada');
      addToast('Cotización aprobada', 'success');
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleRechazar = async (id) => {
    try {
      await cotizacionesApi.updateEstado(id, 'rechazada');
      addToast('Cotización rechazada', 'success');
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEliminar = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar cotización?',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cotizacionesApi.delete(id);
      addToast('Cotización eliminada', 'success');
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleConvertirVenta = async (id) => {
    const ok = await confirm({
      title: '¿Convertir a venta?',
      message: 'Se creará una venta con los productos de esta cotización.',
      confirmText: 'Convertir a venta',
      cancelText: 'Cancelar',
      variant: 'info',
    });
    if (!ok) return;
    try {
      const result = await cotizacionesApi.convertirAVenta(id);
      addToast(`Cotización convertida a venta #${result.venta_id}`, 'success');
      setViewModalOpen(false);
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getEstadoBadge = (estado) => {
    const variants = {
      pendiente: 'warning',
      aprobada: 'success',
      rechazada: 'error',
      vencida: 'default'
    };
    return <Badge variant={variants[estado] || 'default'}>{estado}</Badge>;
  };

  const { subtotal, descuento, total } = calcularTotales();

  return (
    <Layout title="Cotizaciones" subtitle="Gestión de cotizaciones y报价">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-border bg-surface"
            >
              <option value="">Todas</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
              <option value="vencida">Vencidas</option>
            </select>
            <span className="text-sm text-muted">
              {cotizaciones.length} cotización(es)
            </span>
          </div>
          <Button onClick={openCreateModal} icon={Plus}>
            Nueva Cotización
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : cotizaciones.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-muted mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay cotizaciones</h3>
              <p className="text-muted mb-4">Crea tu primera cotización</p>
              <Button onClick={openCreateModal} icon={Plus}>Crear Cotización</Button>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {cotizaciones.map((cot) => (
              <Card key={cot.id} hover className="cursor-pointer" onClick={() => openViewModal(cot)}>
                <CardBody>
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-xl">
                        <FileText className="w-6 h-6 text-muted" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-lg text-primary">{cot.numero}</p>
                        <p className="text-sm text-muted flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {cot.cliente_nombre || 'Sin cliente'}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(cot.created_at).toLocaleDateString('es-MX')} • Vence: {new Date(cot.fecha_vencimiento).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-display font-bold text-primary">{formatCurrency(cot.total)}</p>
                        <p className="text-xs text-muted">{cot.num_items} item(s)</p>
                      </div>
                      {getEstadoBadge(cot.estado)}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal Crear Cotización */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Cotización" size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Cliente *</label>
              <select
                value={formData.cliente_id}
                onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                required
              >
                <option value="">Seleccionar cliente...</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Validez (días)</label>
              <input
                type="number"
                value={formData.validez_dias}
                onChange={(e) => setFormData({ ...formData, validez_dias: parseInt(e.target.value) || 15 })}
                className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                min="1"
                max="90"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-primary">Items</label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem} icon={Plus}>
                Agregar Item
              </Button>
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-xl p-3">
              {items.map((item, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-2 bg-primary/5 rounded-lg">
                  <select
                    value={item.tipo}
                    onChange={(e) => updateItem(index, 'tipo', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                    required
                  >
                    <option value="">Tipo...</option>
                    {PACA_TIPOS.map(t => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                  
                  <select
                    value={item.categoria}
                    onChange={(e) => updateItem(index, 'categoria', e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border text-sm"
                  >
                    <option value="">Categoría...</option>
                    {PACA_CATEGORIAS.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                  
                  <input
                    type="number"
                    value={item.cantidad}
                    onChange={(e) => updateItem(index, 'cantidad', parseInt(e.target.value) || 1)}
                    className="w-16 px-2 py-2 rounded-lg border text-sm text-center"
                    min="1"
                  />
                  
                  <input
                    type="number"
                    value={item.precio_unitario}
                    onChange={(e) => updateItem(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
                    className="w-24 px-2 py-2 rounded-lg border text-sm text-right"
                    placeholder="Precio"
                  />
                  
                  <span className="w-24 text-right font-medium text-sm">
                    {formatCurrency(item.subtotal)}
                  </span>
                  
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-muted hover:text-red-500"
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted">Descuento:</span>
                <input
                  type="number"
                  value={formData.descuento}
                  onChange={(e) => setFormData({ ...formData, descuento: parseFloat(e.target.value) || 0 })}
                  className="w-24 px-2 py-1 rounded-lg border text-sm text-right"
                />
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Notas</label>
            <textarea
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 resize-none"
              rows={2}
              placeholder="Notas adicionales..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="secondary">
              Crear Cotización
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Ver Cotización */}
      <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title={`Cotización ${selectedCotizacion?.numero}`} size="xl">
        {selectedCotizacion && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 bg-primary/5 rounded-xl">
              <div>
                <p className="text-xs sm:text-sm text-muted">Cliente</p>
                <p className="font-medium text-sm sm:text-base">{selectedCotizacion.cliente_nombre}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted">Vendedor</p>
                <p className="font-medium text-sm sm:text-base">{selectedCotizacion.vendedor_nombre || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted">Fecha</p>
                <p className="font-medium text-sm sm:text-base">{new Date(selectedCotizacion.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted">Vence</p>
                <p className="font-medium text-sm sm:text-base">{new Date(selectedCotizacion.fecha_vencimiento).toLocaleDateString('es-MX')}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2 text-sm sm:text-base">Items</h4>
              <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-xs sm:text-sm min-w-[400px]">
                  <thead className="bg-primary/5">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left">Tipo</th>
                      <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">Categoría</th>
                      <th className="px-2 sm:px-4 py-2 text-right">Cant.</th>
                      <th className="px-2 sm:px-4 py-2 text-right">Precio</th>
                      <th className="px-2 sm:px-4 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedCotizacion.detalles?.map((item, i) => (
                      <tr key={i}>
                        <td className="px-2 sm:px-4 py-2">{item.tipo}</td>
                        <td className="px-2 sm:px-4 py-2 text-muted hidden sm:table-cell">{item.categoria || '-'}</td>
                        <td className="px-2 sm:px-4 py-2 text-right">{item.cantidad}</td>
                        <td className="px-2 sm:px-4 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="px-2 sm:px-4 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 sm:space-y-2 text-right">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted">Subtotal:</span>
                  <span>{formatCurrency(selectedCotizacion.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted">Descuento:</span>
                  <span>-{formatCurrency(selectedCotizacion.descuento)}</span>
                </div>
                <div className="flex justify-between text-base sm:text-xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary">{formatCurrency(selectedCotizacion.total)}</span>
                </div>
              </div>
            </div>

            {selectedCotizacion.notas && (
              <div className="p-3 sm:p-4 bg-primary/5 rounded-xl">
                <p className="text-xs sm:text-sm text-muted mb-1">Notas:</p>
                <p className="text-xs sm:text-sm">{selectedCotizacion.notas}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                {getEstadoBadge(selectedCotizacion.estado)}
                <Button variant="outline" size="sm" onClick={() => generarPDF(selectedCotizacion)} icon={Download}>
                  PDF
                </Button>
              </div>
              {selectedCotizacion.estado === 'pendiente' && (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button variant="ghost" size="sm" onClick={() => handleEliminar(selectedCotizacion.id)} icon={Trash2} className="text-error">
                    Eliminar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => { handleRechazar(selectedCotizacion.id); setViewModalOpen(false); }} icon={X}>
                    Rechazar
                  </Button>
                  <Button size="sm" onClick={() => handleConvertirVenta(selectedCotizacion.id)} icon={ShoppingCart}>
                    Convertir
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
