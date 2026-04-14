import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody } from '../components/common';
import { pedidosApi, catalogoApi } from '../services/api';
import { ShoppingBag, Package, Wallet, Clock, TrendingUp } from 'lucide-react';

export default function ClienteDashboard() {
  const [stats, setStats] = useState({ pedidosPendientes: 0, misPedidos: [], disponibles: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [pedidosData, catalogoData] = await Promise.all([
        pedidosApi.getAll(),
        catalogoApi.getAll({ limite: 1 })
      ]);
      
      const pendientes = pedidosData.filter(p => p.estado === 'pendiente').length;
      
      setStats({
        pedidosPendientes: pendientes,
        misPedidos: pedidosData.slice(0, 5),
        disponibles: catalogoData.total || 0
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  };

  const getBadge = (estado) => {
    const colors = {
      pendiente: 'bg-warning/20 text-warning',
      aprobado: 'bg-success/20 text-success',
      rechazado: 'bg-error/20 text-error',
      convertido: 'bg-success/20 text-success'
    };
    return colors[estado] || 'bg-gray/20 text-gray';
  };

  return (
    <Layout title="Mi Cuenta" subtitle="Resumen de tu actividad">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/catalogo">
            <Card hover className="cursor-pointer">
              <CardBody className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-secondary/15">
                  <ShoppingBag className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted">Catálogo</p>
                  <p className="text-2xl font-bold text-primary">{stats.disponibles}</p>
                  <p className="text-xs text-muted">pacas disponibles</p>
                </div>
              </CardBody>
            </Card>
          </Link>

          <Link to="/mis-pedidos">
            <Card hover className="cursor-pointer">
              <CardBody className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-warning/15">
                  <Clock className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted">Pedidos</p>
                  <p className="text-2xl font-bold text-primary">{stats.pedidosPendientes}</p>
                  <p className="text-xs text-muted">pendientes</p>
                </div>
              </CardBody>
            </Card>
          </Link>

          <Link to="/mi-cartera">
            <Card hover className="cursor-pointer">
              <CardBody className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-success/15">
                  <Wallet className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted">Mi Cartera</p>
                  <p className="text-xs text-muted">Ver estado de cuenta</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        </div>

        {stats.misPedidos.length > 0 && (
          <Card>
            <CardBody>
              <h3 className="font-medium text-primary mb-4">Mis Pedidos Recientes</h3>
              <div className="space-y-3">
                {stats.misPedidos.map((pedido) => (
                  <div key={pedido.id} className="flex items-center justify-between p-3 bg-primary/3 rounded-xl">
                    <div>
                      <p className="font-medium text-primary">Pedido #{pedido.id}</p>
                      <p className="text-xs text-muted">
                        {new Date(pedido.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatCurrency(pedido.total_estimado)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${getBadge(pedido.estado)}`}>
                        {pedido.estado}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/mis-pedidos" className="text-sm text-secondary hover:underline mt-3 block text-center">
                Ver todos mis pedidos
              </Link>
            </CardBody>
          </Card>
        )}
      </div>
    </Layout>
  );
}