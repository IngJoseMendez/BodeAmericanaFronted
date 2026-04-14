import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast } from '../components/common';
import { ventasApi, pacasApi, clientesApi } from '../services/api';
import { PAGO_TIPOS } from '../types';
import { Plus, Search, Trash2, ShoppingCart, Package, User, Calendar, CreditCard } from 'lucide-react';

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
  const { addToast } = useToast();
  
  const debouncedBuscarPacas = useDebounce(buscarPacas, 300);

  useEffect(() => {
    loadVentas();
  }, []);

  const loadVentas = async () => {
    try {
      const response = await ventasApi.getAll();
      const data = response.data || response;
      setVentas(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
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
      setModalOpen(true);
    } catch (err) {
      setError(err.message);
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
      await ventasApi.create({
        cliente_id: parseInt(formData.cliente_id),
        tipo_pago: formData.tipo_pago,
        fecha: formData.fecha,
        pacas: pacasSeleccionadas.map(p => ({ id: p.id, precio_venta: p.precio_venta }))
      });
      
      setModalOpen(false);
      loadVentas();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta venta?')) return;
    try {
      await ventasApi.delete(id);
      loadVentas();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalVenta = pacasSeleccionadas.reduce((sum, p) => sum + parseFloat(p.precio_venta), 0);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('es-MX');
  };

  const filteredPacas = buscarPacas 
    ? pacasDisponibles.filter(p => 
        p.tipo.includes(buscarPacas) || p.uuid.includes(buscarPacas)
      )
    : pacasDisponibles;

  return (
    <Layout title="Ventas" subtitle={`${ventas.length} ventas registradas`}>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={openModal} variant="secondary">
            <Plus size={18} className="mr-1" /> Nueva Venta
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
        )}

        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo Pago</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
                  ) : ventas.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No hay ventas</td></tr>
                  ) : (
                    ventas.map((venta) => (
                      <tr key={venta.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">#{venta.id}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(venta.fecha)}</td>
                        <td className="px-4 py-3 text-sm text-primary font-medium">{venta.cliente_nombre}</td>
                        <td className="px-4 py-3"><Badge variant={venta.tipo_pago}>{venta.tipo_pago}</Badge></td>
                        <td className="px-4 py-3 text-sm text-primary font-medium">{formatCurrency(venta.total)}</td>
                        <td className="px-4 py-3"><Badge variant="disponible">{venta.estado}</Badge></td>
                        <td className="px-4 py-3 text-right">
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
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Venta" size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}
          
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Cliente"
              value={formData.cliente_id}
              onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
              options={[{ value: '', label: 'Seleccionar...' }, ...clientes.map(c => ({ value: c.id, label: c.nombre }))]}
              required
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

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-primary mb-2">Seleccionar Pacas</label>
            <input
              type="text"
              placeholder="Buscar pacas..."
              value={buscarPacas}
              onChange={(e) => setBuscarPacas(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-lg border border-gray-200"
            />
            
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
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
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-2">{paca.tipo}</td>
                        <td className="px-3 py-2">{paca.categoria}</td>
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

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <span className="text-sm text-gray-500">Total ({pacasSeleccionadas.length} pacas)</span>
            <span className="text-xl font-display text-primary">{formatCurrency(totalVenta)}</span>
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">Confirmar Venta</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}