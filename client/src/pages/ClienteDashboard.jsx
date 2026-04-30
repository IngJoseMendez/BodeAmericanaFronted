import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast } from '../components/common';
import { clienteApi, catalogoApi, pedidosApi } from '../services/api';
import { ShoppingBag, Wallet, Clock, TrendingUp, RefreshCw, CreditCard, BarChart3, Zap } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function ClienteDashboard() {
  const [stats, setStats] = useState({ 
    pedidosPendientes: 0, 
    misPedidos: [], 
    disponibles: 0,
    cartera: null,
    historial: []
  });
  const [loading, setLoading] = useState(true);
  const [quickRebuyLoading, setQuickRebuyLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [pedidosData, catalogoData, carteraData, historialData] = await Promise.all([
        pedidosApi.getAll(),
        catalogoApi.getAll({ limite: 1 }),
        clienteApi.getCartera().catch(() => null),
        clienteApi.getHistorial().catch(() => [])
      ]);
      
      const pendientes = pedidosData.filter(p => p.estado === 'pendiente').length;
      
      setStats({
        pedidosPendientes: pendientes,
        misPedidos: pedidosData.slice(0, 5),
        disponibles: catalogoData.total || 0,
        cartera: carteraData,
        historial: historialData.slice(0, 12)
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickRebuy = async () => {
    try {
      setQuickRebuyLoading(true);
      const catalogoData = await catalogoApi.getAll({ limite: 10 });
      const favoritos = catalogoData.pacas?.slice(0, 3) || [];
      
      if (favoritos.length === 0) {
        addToast('No hay productos disponibles', 'warning');
        return;
      }

      const items = favoritos.map(p => ({
        paca_id: p.id,
        cantidad: 1,
        precio_unitario: p.precio_venta
      }));

      await pedidosApi.create({
        items,
        notas: 'Pedido rápido desde portal'
      });
      
      addToast('Pedido creado exitosamente', 'success');
      loadStats();
    } catch (err) {
      addToast(err.message || 'Error al crear pedido', 'error');
    } finally {
      setQuickRebuyLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value || 0);
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

  const chartData = stats.historial.map((v, i) => ({
    name: new Date(v.fecha).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }),
    monto: v.total || v.monto_total || 0,
    cantidad: v.num_pacas || v.cantidad_pacas || 1
  })).reverse();

  const creditoDisponible = stats.cartera?.limite_credito 
    ? stats.cartera.limite_credito - (stats.cartera.saldo_adeudo || 0)
    : null;

  return (
    <Layout title="Mi Cuenta" subtitle="Resumen de tu actividad">
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Link to="/catalogo">
            <Card hover className="cursor-pointer">
              <CardBody className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-secondary/15">
                  <ShoppingBag className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <p className="text-xs text-muted">Catálogo</p>
                  <p className="text-xl font-bold text-primary">{stats.disponibles}</p>
                </div>
              </CardBody>
            </Card>
          </Link>

          <Link to="/mis-pedidos">
            <Card hover className="cursor-pointer">
              <CardBody className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-warning/15">
                  <Clock className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted">Pendientes</p>
                  <p className="text-xl font-bold text-primary">{stats.pedidosPendientes}</p>
                </div>
              </CardBody>
            </Card>
          </Link>

          <Link to="/mi-cartera">
            <Card hover className="cursor-pointer">
              <CardBody className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-success/15">
                  <Wallet className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted">Mi Deuda</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(stats.cartera?.saldo_adeudo || 0)}</p>
                </div>
              </CardBody>
            </Card>
          </Link>

          {creditoDisponible !== null && (
            <Card>
              <CardBody className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/15">
                  <CreditCard className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted">Crédito Disp.</p>
                  <p className="text-xl font-bold text-primary">{formatCurrency(creditoDisponible)}</p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardBody>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-primary flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Historial de Compras
                </h3>
                <Button variant="ghost" size="sm" onClick={loadStats} icon={RefreshCw}>
                  Actualizar
                </Button>
              </div>
              
              {chartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="name" fontSize={12} tick={{ fill: '#6b7280' }} />
                      <YAxis fontSize={12} tick={{ fill: '#6b7280' }} tickFormatter={(v) => `$${v/1000}k`} />
                      <Tooltip 
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #eee' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="monto" 
                        stroke="#d4a373" 
                        fill="#d4a373" 
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Sin historial de compras</p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex flex-col h-full">
              <h3 className="font-medium text-primary flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-secondary" />
                Compra Rápida
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Crea un pedido con los productos más populares en un click
              </p>
              <div className="mt-auto">
                <Button 
                  onClick={handleQuickRebuy} 
                  className="w-full" 
                  icon={ShoppingBag}
                  loading={quickRebuyLoading}
                >
                  {quickRebuyLoading ? 'Creando...' : 'Comprar Ahora'}
                </Button>
                <Link to="/catalogo" className="block mt-2">
                  <Button variant="outline" className="w-full" size="sm">
                    Ver Catálogo
                  </Button>
                </Link>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {stats.misPedidos.length > 0 && (
            <Card>
              <CardBody>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium text-primary">Pedidos Recientes</h3>
                  <Link to="/mis-pedidos" className="text-sm text-secondary hover:underline">
                    Ver todos
                  </Link>
                </div>
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
              </CardBody>
            </Card>
          )}

          {stats.cartera && (
            <Card>
              <CardBody>
                <h3 className="font-medium text-primary mb-4 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  Estado de Cuenta
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-500">Total Comprado</span>
                    <span className="font-bold">{formatCurrency(stats.cartera.total_comprado || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-500">Total Pagado</span>
                    <span className="font-bold text-success">{formatCurrency(stats.cartera.total_pagado || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm text-gray-500">Saldo Pendiente</span>
                    <span className="font-bold text-warning">{formatCurrency(stats.cartera.saldo_adeudo || 0)}</span>
                  </div>
                  {stats.cartera.limite_credito && (
                    <div className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                      <span className="text-sm text-gray-500">Límite Crédito</span>
                      <span className="font-bold">{formatCurrency(stats.cartera.limite_credito)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center p-3 bg-primary/5 rounded-xl border border-primary/10">
                    <span className="text-sm font-medium">Pagos Vencidos</span>
                    <span className="font-bold text-error">{stats.cartera.pagos_vencidos || 0}</span>
                  </div>
                </div>
                <Link to="/mi-cartera" className="block mt-4">
                  <Button variant="outline" className="w-full" size="sm">
                    Ver Detalle Completo
                  </Button>
                </Link>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}