import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, Badge, useToast } from '../components/common';
import { cotizacionesApi, clientesApi } from '../services/api';
import { PACA_TIPOS, PACA_CATEGORIAS } from '../types';
import { FileText, Plus, Eye, Trash2, Download, Check, X, Clock, User, X as XIcon, Search, ShoppingCart } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value || 0);
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
    if (!confirm('¿Eliminar esta cotización?')) return;
    try {
      await cotizacionesApi.delete(id);
      addToast('Cotización eliminada', 'success');
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleConvertirVenta = async (id) => {
    if (!confirm('¿Convertir esta cotización en venta?')) return;
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
              className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white"
            >
              <option value="">Todas</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
              <option value="vencida">Vencidas</option>
            </select>
            <span className="text-sm text-gray-500">
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
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay cotizaciones</h3>
              <p className="text-gray-500 mb-4">Crea tu primera cotización</p>
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
                      <div className="p-3 bg-gray-100 rounded-xl">
                        <FileText className="w-6 h-6 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-lg text-primary">{cot.numero}</p>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {cot.cliente_nombre || 'Sin cliente'}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(cot.created_at).toLocaleDateString('es-MX')} • Vence: {new Date(cot.fecha_vencimiento).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-display font-bold text-primary">{formatCurrency(cot.total)}</p>
                        <p className="text-xs text-gray-500">{cot.num_items} item(s)</p>
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
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
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
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30"
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
                <div key={index} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center p-2 bg-gray-50 rounded-lg">
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
                    className="p-2 text-gray-400 hover:text-red-500"
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
                <span className="text-gray-500">Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Descuento:</span>
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
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-secondary/30 resize-none"
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
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm text-gray-500">Cliente</p>
                <p className="font-medium">{selectedCotizacion.cliente_nombre}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vendedor</p>
                <p className="font-medium">{selectedCotizacion.vendedor_nombre || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Fecha</p>
                <p className="font-medium">{new Date(selectedCotizacion.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vence</p>
                <p className="font-medium">{new Date(selectedCotizacion.fecha_vencimiento).toLocaleDateString('es-MX')}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Items</h4>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Tipo</th>
                      <th className="px-4 py-2 text-left">Categoría</th>
                      <th className="px-4 py-2 text-right">Cantidad</th>
                      <th className="px-4 py-2 text-right">Precio</th>
                      <th className="px-4 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedCotizacion.detalles?.map((item, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{item.tipo}</td>
                        <td className="px-4 py-2 text-gray-500">{item.categoria || '-'}</td>
                        <td className="px-4 py-2 text-right">{item.cantidad}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-right">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal:</span>
                  <span>{formatCurrency(selectedCotizacion.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Descuento:</span>
                  <span>-{formatCurrency(selectedCotizacion.descuento)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary">{formatCurrency(selectedCotizacion.total)}</span>
                </div>
              </div>
            </div>

            {selectedCotizacion.notas && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">Notas:</p>
                <p className="text-sm">{selectedCotizacion.notas}</p>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t">
              <div>
                {getEstadoBadge(selectedCotizacion.estado)}
              </div>
              <div className="flex gap-2">
                {selectedCotizacion.estado === 'pendiente' && (
                  <>
                    <Button variant="ghost" onClick={() => handleEliminar(selectedCotizacion.id)} icon={Trash2} className="text-error">
                      Eliminar
                    </Button>
                    <Button variant="secondary" onClick={() => { handleRechazar(selectedCotizacion.id); setViewModalOpen(false); }} icon={X}>
                      Rechazar
                    </Button>
                    <Button onClick={() => handleConvertirVenta(selectedCotizacion.id)} icon={ShoppingCart}>
                      Convertir a Venta
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
