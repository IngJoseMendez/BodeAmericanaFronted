import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, CardTitle, CardDescription } from '../components/common';
import { dashboardApi, analyticsApi } from '../services/api';
import {
  Package, Users, ShoppingCart, Wallet,
  TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight,
  Receipt, FileSignature, Brain, TrendingDown
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const CHART_COLORS = {
  primary: '#d4a373',
  success: '#6a994e',
  warning: '#f4a261',
  accent: '#bc4749',
  info: '#457b9d',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-sm mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm text-muted" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' 
              ? entry.value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
              : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function InventoryPieChart({ disponibles, separadas, vendidas }) {
  const data = [
    { name: 'Disponibles', value: disponibles || 0, color: CHART_COLORS.success },
    { name: 'Separadas', value: separadas || 0, color: CHART_COLORS.warning },
    { name: 'Vendidas', value: vendidas || 0, color: CHART_COLORS.accent },
  ];

  if (data.every(d => d.value === 0)) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted">
        No hay datos de inventario
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function VentasBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted">
        No hay datos de ventas
      </div>
    );
  }

  const formatData = data.map(d => ({
    fecha: d.periodo || d.mes || d.fecha,
    ventas: parseFloat(d.monto_total || d.monto || d.total || 0),
    cantidad: parseInt(d.num_ventas || d.cantidad || 0),
    ganancia: parseFloat(d.ganancia || 0)
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={formatData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis 
          dataKey="fecha" 
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => {
            if (value && value.length > 5) {
              return new Date(value).toLocaleDateString('es-MX', { month: 'short' });
            }
            return value;
          }}
        />
        <YAxis 
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="ventas" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Ventas" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TendenciaAreaChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-muted">
        No hay datos de tendencia
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="colorVentas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorCartera" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS.accent} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={CHART_COLORS.accent} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
        <YAxis 
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area 
          type="monotone" 
          dataKey="ventas" 
          stroke={CHART_COLORS.primary} 
          fillOpacity={1} 
          fill="url(#colorVentas)"
          name="Ventas"
        />
        <Area 
          type="monotone" 
          dataKey="ganancia" 
          stroke={CHART_COLORS.success} 
          fillOpacity={1} 
          fill="url(#colorCartera)"
          name="Ganancia"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ProgressBar({ value, max, color = 'bg-success', label }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="font-semibold text-primary tabular-nums">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-primary/8 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, subtext, color, trend }) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/15 text-primary',
    success: 'bg-success/15 text-success',
    accent: 'bg-accent/15 text-accent',
  };

  return (
    <Card hover className="animate-fade-in-up">
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className={`p-3 rounded-2xl flex-shrink-0 ${colorClasses[color] || colorClasses.primary}`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-display text-primary mt-0.5 tabular-nums truncate">{value}</p>
            {subtext && (
              <div className="flex items-center gap-1 mt-1">
                {trend === 'up' && <ArrowUpRight className="w-3 h-3 text-success flex-shrink-0" />}
                {trend === 'down' && <ArrowDownRight className="w-3 h-3 text-accent flex-shrink-0" />}
                <p className="text-xs text-muted truncate">{subtext}</p>
              </div>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function QuickAction({ to, icon: Icon, label, color }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-primary/5 transition-all duration-200 group"
    >
      <div className={`p-3 rounded-xl ${color} group-hover:scale-110 transition-transform duration-200`}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <span className="text-xs font-medium text-muted group-hover:text-primary transition-colors">{label}</span>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <Layout title="Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardBody className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl skeleton" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-16 skeleton rounded" />
                  <div className="h-7 w-24 skeleton rounded" />
                  <div className="h-3 w-20 skeleton rounded" />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}

export default function Dashboard() {
  const [metricas, setMetricas] = useState(null);
  const [ventasData, setVentasData] = useState([]);
  const [ventasMensuales, setVentasMensuales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [metricasRes, ventasDiariasRes, ventasMensRes] = await Promise.all([
        dashboardApi.getMetricas(),
        dashboardApi.getVentasDiarias(30).catch(() => ({ data: [] })),
        dashboardApi.getVentasMensuales().catch(() => ({ data: [] }))
      ]);

      setMetricas(metricasRes);
      setVentasData(ventasDiariasRes.data || ventasDiariasRes || []);
      setVentasMensuales(ventasMensRes.data || ventasMensRes || []);
    } catch (err) {
      console.error('Error cargando datos del dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
    }).format(value || 0);

  if (loading) return <DashboardSkeleton />;

  const totalPacas = metricas?.pacas?.total || 0;
  const disponibles = metricas?.pacas?.disponibles || 0;
  const separadas = metricas?.pacas?.separadas || 0;
  const vendidas = metricas?.pacas?.vendidas || 0;
  const costoTotal = metricas?.pacas?.costo_total || 0;
  const valorInventario = metricas?.pacas?.valor_inventario || 0;
  const ganancia = valorInventario - costoTotal;

  const totalVentas = ventasData.reduce((sum, v) => sum + parseFloat(v.monto || 0), 0);
  const totalGanancias = ventasMensuales.reduce((sum, v) => {
    const monto = parseFloat(v.monto || 0);
    const costo = parseFloat(v.costo || 0) || monto * 0.6;
    return sum + (monto - costo);
  }, 0);

  return (
    <Layout title="Dashboard" subtitle="Resumen de tu negocio">
      <div className="space-y-6">
        <section aria-label="Métricas principales">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Package}
              label="Total Pacas"
              value={totalPacas.toLocaleString('es-MX')}
              subtext={`${disponibles} disponibles`}
              color="secondary"
            />
            <MetricCard
              icon={Users}
              label="Clientes"
              value={(metricas?.clientes?.total || 0).toLocaleString('es-MX')}
              subtext={`${metricas?.clientes?.activos || 0} activos`}
              color="primary"
            />
            <MetricCard
              icon={ShoppingCart}
              label="Ventas (30d)"
              value={formatCurrency(totalVentas)}
              subtext={`${ventasData.length} transacciones`}
              color="success"
              trend={totalVentas > 0 ? 'up' : undefined}
            />
            <MetricCard
              icon={Wallet}
              label="Cartera"
              value={formatCurrency(metricas?.cartera?.saldo_pendiente)}
              subtext="Saldo pendiente"
              color="accent"
            />
          </div>
        </section>

        <section aria-label="Acciones rápidas">
          <Card className="animate-fade-in-up">
            <CardBody>
              <CardTitle className="mb-3">Acciones Rápidas</CardTitle>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
                <QuickAction to="/pacas" icon={Package} label="Inventario" color="bg-secondary/15 text-secondary" />
                <QuickAction to="/ventas" icon={ShoppingCart} label="Nueva Venta" color="bg-success/15 text-success" />
                <QuickAction to="/clientes" icon={Users} label="Clientes" color="bg-primary/10 text-primary" />
                <QuickAction to="/gestionar-pedidos" icon={Receipt} label="Pedidos" color="bg-warning/15 text-warning" />
                <QuickAction to="/cotizaciones" icon={FileSignature} label="Cotizar" color="bg-accent/15 text-accent" />
                <QuickAction to="/inteligencia-negocio" icon={Brain} label="Analytics" color="bg-purple-500/15 text-purple-500" />
              </div>
            </CardBody>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="animate-fade-in-up">
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-success/15">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div>
                  <CardTitle>Estado del Inventario</CardTitle>
                  <CardDescription>Distribución por estado</CardDescription>
                </div>
              </div>
              <InventoryPieChart disponibles={disponibles} separadas={separadas} vendidas={vendidas} />
            </CardBody>
          </Card>

          <Card className="lg:col-span-2 animate-fade-in-up">
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/15">
                  <DollarSign className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Ventas Diarias</CardTitle>
                  <CardDescription>Últimos 30 días</CardDescription>
                </div>
              </div>
              <VentasBarChart data={ventasData} />
            </CardBody>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-fade-in-up">
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-secondary/15">
                  <TrendingUp className="w-5 h-5 text-secondary" />
                </div>
                <div>
                  <CardTitle>Ventas Mensuales</CardTitle>
                  <CardDescription>Comparativo por mes</CardDescription>
                </div>
              </div>
              <VentasBarChart data={ventasMensuales} />
            </CardBody>
          </Card>

          <Card className="animate-fade-in-up">
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-primary/15">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Valor del Inventario</CardTitle>
                  <CardDescription>Análisis financiero del stock</CardDescription>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Costo Total', value: formatCurrency(costoTotal), icon: DollarSign, bg: 'bg-primary/5' },
                  { label: 'Valor en Venta', value: formatCurrency(valorInventario), icon: TrendingUp, bg: 'bg-success/10' },
                  { label: 'Potencial Ganancia', value: formatCurrency(ganancia), icon: ArrowUpRight, bg: 'bg-secondary/10' },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between p-4 rounded-2xl ${row.bg}`}>
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wide">{row.label}</p>
                      <p className="text-lg font-display text-primary mt-0.5 tabular-nums">{row.value}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-background/80 flex items-center justify-center">
                      <row.icon className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-border/50 flex gap-3">
                <Link to="/pacas" className="text-xs text-secondary hover:underline font-medium">Ver inventario →</Link>
                <Link to="/ventas" className="text-xs text-secondary hover:underline font-medium">Nueva venta →</Link>
              </div>
            </CardBody>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
