import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal } from '../components/common';
import { carteraApi, clientesApi, pagosApi } from '../services/api';
import { METODOS_PAGO } from '../types';
import * as XLSX from 'xlsx';
import { Plus, Search, Wallet, TrendingDown, TrendingUp, Download } from 'lucide-react';

export default function Cartera() {
  const [cartera, setCartera] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detalleCliente, setDetalleCliente] = useState(null);
  const [formData, setFormData] = useState({
    cliente_id: '', monto: '', fecha: new Date().toISOString().split('T')[0], metodo_pago: 'efectivo', referencia: ''
  });
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCartera();
  }, []);

  const loadCartera = async () => {
    try {
      const data = await carteraApi.getAll();
      setCartera(data);
    } catch (err) {
      setError(err.message);
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
      setModalOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.cliente_id || !formData.monto) {
      setError('Completa todos los campos requeridos');
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

      setModalOpen(false);
      loadCartera();
    } catch (err) {
      setError(err.message);
    }
  };

  const exportarExcel = async (clienteId, clienteNombre) => {
    try {
      const data = await carteraApi.exportOne(clienteId);
      
      const ws = XLSX.utils.book_new();
      
      const datos = data.movimientos.map((m, idx) => ({
        '#': idx + 1,
        'Fecha': new Date(m.fecha).toLocaleDateString('es-MX'),
        'Tipo': m.tipo,
        'Descripción': m.descripcion,
        'Monto': m.tipo === 'VENTA' ? m.monto : m.monto,
        'Método de Pago': m.metodo_pago || '-',
        'Referencia': m.referencia || '-',
        'Saldo Final': m.saldo
      }));

      const hojaDatos = XLSX.utils.json_to_sheet(datos);
      XLSX.utils.book_append_sheet(ws, hojaDatos, 'Movimientos');

      const resumen = [
        { 'Campo': 'Cliente', 'Valor': data.cliente.nombre },
        { 'Campo': 'Teléfono', 'Valor': data.cliente.telefono || '-' },
        { 'Campo': 'Dirección', 'Valor': data.cliente.direccion || '-' },
        { 'Campo': 'Ciudad', 'Valor': data.cliente.ciudad || '-' },
        { 'Campo': 'Tipo Cliente', 'Valor': data.cliente.tipo_cliente },
        { 'Campo': '', 'Valor': '' },
        { 'Campo': 'Total Vendido', 'Valor': formatCurrency(data.total_vendido) },
        { 'Campo': 'Total Abonado', 'Valor': formatCurrency(data.total_abonado) },
        { 'Campo': 'SALDO PENDIENTE', 'Valor': formatCurrency(data.saldo_pendiente) },
      ];
      
      const hojaResumen = XLSX.utils.json_to_sheet(resumen);
      XLSX.utils.book_append_sheet(ws, hojaResumen, 'Resumen');

      const nombreArchivo = `cartera_${data.cliente.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(ws, nombreArchivo);
    } catch (err) {
      setError('Error al exportar: ' + err.message);
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
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-left">Método</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {detalleCliente.movimientos.map(m => (
                    <tr key={m.id}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between pt-2">
              <Button 
                variant="secondary" 
                onClick={() => exportarExcel(detalleCliente.cliente.id, detalleCliente.cliente.nombre)}
                icon={Download}
              >
                Exportar Excel
              </Button>
              <Button variant="ghost" onClick={() => setDetalleCliente(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Abono">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}

          <Select
            label="Cliente"
            value={formData.cliente_id}
            onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
            options={[{ value: '', label: 'Seleccionar...' }, ...clientes.map(c => ({ value: c.id, label: c.nombre }))]}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Monto"
              type="number"
              step="0.01"
              value={formData.monto}
              onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
              required
            />
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