import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Badge, Button, Modal, useToast } from '../components/common';
import { pedidosApi } from '../services/api';
import { Package, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

export default function GestionarPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [detallePedido, setDetallePedido] = useState(null);
  const [modalDetalle, setModalDetalle] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadPedidos();
  }, [filtroEstado]);

  const loadPedidos = async () => {
    try {
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      const data = await pedidosApi.getAll(params);
      setPedidos(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const verDetalles = async (pedido) => {
    try {
      const detalles = await pedidosApi.getOne(pedido.id);
      setDetallePedido(detalles);
      setModalDetalle(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const aprobarPedido = async (id) => {
    try {
      await pedidosApi.actualizar(id, { estado: 'aprobado' });
      addToast('Pedido aprobado y convertido en venta', 'success');
      setModalDetalle(false);
      loadPedidos();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const rechazarPedido = async (id) => {
    try {
      await pedidosApi.actualizar(id, { estado: 'rechazado' });
      addToast('Pedido rechazado', 'success');
      setModalDetalle(false);
      loadPedidos();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  };

  const getEstadoBadge = (estado) => {
    const variants = {
      pendiente: 'warning',
      aprobado: 'success',
      rechazado: 'error',
      convertido: 'success'
    };
    const labels = {
      pendiente: 'Pendiente',
      aprobado: 'Aprobado',
      rechazado: 'Rechazado',
      convertido: 'Completado'
    };
    return <Badge variant={variants[estado] || 'default'}>{labels[estado] || estado}</Badge>;
  };

  return (
    <Layout title="Gestionar Pedidos" subtitle="Aprobar o rechazar pedidos de clientes">
      <div className="space-y-4">
        <div className="flex gap-2">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-4 py-3 rounded-xl border border-border bg-white"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
            <option value="convertido">Convertidos</option>
          </select>
        </div>

        {loading ? (
          <Card><CardBody className="text-center text-muted">Cargando...</CardBody></Card>
        ) : pedidos.length === 0 ? (
          <Card><CardBody className="text-center text-muted">No hay pedidos</CardBody></Card>
        ) : (
          pedidos.map((pedido) => (
            <Card key={pedido.id} hover className="cursor-pointer" onClick={() => verDetalles(pedido)}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Package className="w-5 h-5 text-muted" />
                    <div>
                      <p className="font-medium text-primary">Pedido #{pedido.id}</p>
                      <p className="text-sm text-muted">
                        {pedido.cliente_nombre} • {new Date(pedido.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{formatCurrency(pedido.total_estimado)}</p>
                      {getEstadoBadge(pedido.estado)}
                    </div>
                    <ChevronDown className="w-5 h-5 text-muted" />
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={modalDetalle} onClose={() => setModalDetalle(false)} title={`Pedido #${detallePedido?.id}`} size="lg">
        {detallePedido && (
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-primary/5 rounded-xl">
              <div>
                <p className="text-sm text-muted">Cliente</p>
                <p className="font-medium text-primary">{detallePedido.cliente_nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Fecha</p>
                <p className="font-medium text-primary">{new Date(detallePedido.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Total</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(detallePedido.total_estimado)}</p>
              </div>
            </div>

            <div>
              <p className="font-medium text-primary mb-2">Detalles del Pedido</p>
              <div className="space-y-2">
                {(detallePedido.detalles || []).map((item, i) => (
                  <div key={i} className="flex justify-between p-3 bg-primary/3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted" />
                      <span className="text-sm text-primary">{item.tipo} ({item.categoria})</span>
                    </div>
                    <span className="font-medium text-primary">{formatCurrency(item.precio)}</span>
                  </div>
                ))}
              </div>
            </div>

            {detallePedido.estado === 'pendiente' && (
              <div className="flex gap-2 justify-end pt-4 border-t border-border">
                <Button variant="ghost" onClick={() => rechazarPedido(detallePedido.id)} className="text-error hover:bg-error/10">
                  <XCircle size={18} /> Rechazar
                </Button>
                <Button variant="secondary" onClick={() => aprobarPedido(detallePedido.id)} className="bg-success hover:bg-success/90">
                  <CheckCircle size={18} /> Aprobar y Crear Venta
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
}