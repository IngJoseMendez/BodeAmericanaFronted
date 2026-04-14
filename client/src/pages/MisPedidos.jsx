import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Badge, useToast } from '../components/common';
import { pedidosApi } from '../services/api';
import { Package, Clock, CheckCircle, XCircle, ShoppingCart } from 'lucide-react';

export default function MisPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    loadPedidos();
  }, []);

  const loadPedidos = async () => {
    try {
      const data = await pedidosApi.getAll();
      setPedidos(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
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

  const getEstadoIcon = (estado) => {
    switch (estado) {
      case 'pendiente': return <Clock className="w-5 h-5 text-warning" />;
      case 'aprobado': return <CheckCircle className="w-5 h-5 text-success" />;
      case 'rechazado': return <XCircle className="w-5 h-5 text-error" />;
      case 'convertido': return <ShoppingCart className="w-5 h-5 text-success" />;
      default: return <Clock className="w-5 h-5 text-muted" />;
    }
  };

  return (
    <Layout title="Mis Pedidos" subtitle="Historial de pedidos">
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardBody className="text-center text-muted">Cargando...</CardBody>
          </Card>
        ) : pedidos.length === 0 ? (
          <Card>
            <CardBody className="text-center text-muted">No tienes pedidos</CardBody>
          </Card>
        ) : (
          pedidos.map((pedido) => (
            <Card key={pedido.id} hover>
              <CardBody className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getEstadoIcon(pedido.estado)}
                  <div>
                    <p className="font-medium text-primary">Pedido #{pedido.id}</p>
                    <p className="text-sm text-muted">
                      {new Date(pedido.created_at).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{formatCurrency(pedido.total_estimado)}</p>
                  {getEstadoBadge(pedido.estado)}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </Layout>
  );
}