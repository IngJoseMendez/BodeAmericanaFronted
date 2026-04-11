import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, CardTitle, CardDescription } from '../components/common';
import { dashboardApi } from '../services/api';
import { Package, Users, ShoppingCart, Wallet, TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight } from 'lucide-react';

function MetricCard({ icon: Icon, label, value, subtext, color, delay = 0, trend }) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/15 text-primary',
    success: 'bg-success/15 text-success',
    accent: 'bg-accent/15 text-accent',
  };
  
  return (
    <Card hover className="animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
      <CardBody className="flex items-start gap-4">
        <div className={`p-3.5 rounded-2xl ${colorClasses[color] || colorClasses.primary}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-display text-primary mt-1">{value}</p>
          {subtext && (
            <div className="flex items-center gap-1 mt-1">
              {trend === 'up' ? (
                <ArrowUpRight className="w-3 h-3 text-success" />
              ) : trend === 'down' ? (
                <ArrowDownRight className="w-3 h-3 text-accent" />
              ) : null}
              <p className="text-xs text-muted">{subtext}</p>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function Dashboard() {
  const [metricas, setMetricas] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetricas();
  }, []);

  const loadMetricas = async () => {
    try {
      const data = await dashboardApi.getMetricas();
      setMetricas(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <Layout title="Dashboard">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardBody className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gray-100" />
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                  <div className="h-6 w-20 bg-gray-100 rounded" />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard" subtitle="Resumen de tu negocio">
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Package}
            label="Total Pacas"
            value={metricas?.pacas?.total || 0}
            subtext={`${metricas?.pacas?.disponibles || 0} disponibles`}
            color="secondary"
            delay={0}
          />
          <MetricCard
            icon={Users}
            label="Clientes"
            value={metricas?.clientes?.total || 0}
            subtext={`${metricas?.clientes?.activos || 0} activos`}
            color="primary"
            delay={75}
          />
          <MetricCard
            icon={ShoppingCart}
            label="Ventas (30d)"
            value={metricas?.ventas?.total_ventas || 0}
            subtext={formatCurrency(metricas?.ventas?.total_ventas_monto || 0)}
            color="success"
            delay={150}
          />
          <MetricCard
            icon={Wallet}
            label="Cartera"
            value={formatCurrency(metricas?.cartera?.saldo_pendiente || 0)}
            subtext="Saldo pendiente"
            color="accent"
            delay={225}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card hover className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <CardBody>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-success/15">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div>
                  <CardTitle>Estado del Inventario</CardTitle>
                  <CardDescription>Distribución por estado</CardDescription>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-success/10 border border-success/20 hover:scale-[1.02] transition-transform">
                  <Package className="w-5 h-5 text-success mb-2" />
                  <p className="text-2xl font-display text-success">{metricas?.pacas?.disponibles || 0}</p>
                  <p className="text-xs text-muted mt-1">Disponibles</p>
                </div>
                <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20 hover:scale-[1.02] transition-transform">
                  <Package className="w-5 h-5 text-warning mb-2" />
                  <p className="text-2xl font-display text-warning">{metricas?.pacas?.separadas || 0}</p>
                  <p className="text-xs text-muted mt-1">Separadas</p>
                </div>
                <div className="p-4 rounded-2xl bg-accent/10 border border-accent/20 hover:scale-[1.02] transition-transform">
                  <Package className="w-5 h-5 text-accent mb-2" />
                  <p className="text-2xl font-display text-accent">{metricas?.pacas?.vendidas || 0}</p>
                  <p className="text-xs text-muted mt-1">Vendidas</p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-border/50">
                <div className="flex gap-2">
                  <Link to="/pacas" className="text-sm text-secondary hover:underline">Ver inventario</Link>
                  <span className="text-muted">•</span>
                  <Link to="/ventas" className="text-sm text-secondary hover:underline">Nueva venta</Link>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in-up" style={{ animationDelay: '375ms' }}>
            <CardBody>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-secondary/15">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Valor del Inventario</CardTitle>
                  <CardDescription>Análisis financiero</CardDescription>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide">Costo Total</p>
                    <p className="text-xl font-display text-primary mt-0.5">{formatCurrency(metricas?.pacas?.costo_total || 0)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-success/10 rounded-2xl border border-success/20">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide">Valor en Venta</p>
                    <p className="text-xl font-display text-success mt-0.5">{formatCurrency(metricas?.pacas?.valor_inventario || 0)}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-success" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-secondary/10 rounded-2xl border border-secondary/20">
                  <div>
                    <p className="text-xs text-muted uppercase tracking-wide">Potencial Ganancia</p>
                    <p className="text-xl font-display text-primary mt-0.5">
                      {formatCurrency((metricas?.pacas?.valor_inventario || 0) - (metricas?.pacas?.costo_total || 0))}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5 text-primary" />
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Layout>
  );
}