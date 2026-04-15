import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, CardTitle, CardDescription } from '../components/common';
import { dashboardApi } from '../services/api';
import {
  Package, Users, ShoppingCart, Wallet,
  TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight,
  Receipt, FileSignature, Brain
} from 'lucide-react';

// ── Mini sparkline bar chart (SVG puro, sin librerías) ──────────────────────
function Sparkline({ values = [], color = '#d4a373', height = 28 }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 80;
  const h = height;
  const barW = Math.floor(w / values.length) - 1;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="opacity-60"
    >
      {values.map((v, i) => {
        const barH = Math.max(2, (v / max) * h);
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={1}
            fill={color}
            opacity={i === values.length - 1 ? 1 : 0.5}
          />
        );
      })}
    </svg>
  );
}

// ── Progress bar ─────────────────────────────────────────────────────────────
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
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label}
        />
      </div>
    </div>
  );
}

// ── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ icon: Icon, label, value, subtext, color, delay = 0, trend, sparkData, sparkColor }) {
  const colorClasses = {
    primary:   'bg-primary/10 text-primary',
    secondary: 'bg-secondary/15 text-primary',
    success:   'bg-success/15 text-success',
    accent:    'bg-accent/15 text-accent',
  };

  return (
    <Card hover className="animate-fade-in-up" style={{ animationDelay: `${delay}ms` }}>
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
                {trend === 'up'   && <ArrowUpRight   className="w-3 h-3 text-success flex-shrink-0" aria-hidden="true" />}
                {trend === 'down' && <ArrowDownRight className="w-3 h-3 text-accent flex-shrink-0" aria-hidden="true" />}
                <p className="text-xs text-muted truncate">{subtext}</p>
              </div>
            )}
          </div>
          {sparkData && (
            <div className="flex-shrink-0 self-end">
              <Sparkline values={sparkData} color={sparkColor || '#d4a373'} />
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Quick Action Button ───────────────────────────────────────────────────────
function QuickAction({ to, icon: Icon, label, color }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-primary/5 transition-all duration-200 group"
      aria-label={`Ir a ${label}`}
    >
      <div className={`p-3 rounded-xl ${color} group-hover:scale-110 transition-transform duration-200`}>
        <Icon size={18} aria-hidden="true" />
      </div>
      <span className="text-xs font-medium text-muted group-hover:text-primary transition-colors">{label}</span>
    </Link>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardBody>
                <div className="h-5 w-32 skeleton rounded mb-4" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-12 skeleton rounded-2xl" />
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
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

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
    }).format(value || 0);

  if (loading) return <DashboardSkeleton />;

  const totalPacas      = metricas?.pacas?.total || 0;
  const disponibles     = metricas?.pacas?.disponibles || 0;
  const separadas       = metricas?.pacas?.separadas || 0;
  const vendidas        = metricas?.pacas?.vendidas || 0;
  const costoTotal      = metricas?.pacas?.costo_total || 0;
  const valorInventario = metricas?.pacas?.valor_inventario || 0;
  const ganancia        = valorInventario - costoTotal;

  // Datos de sparklines — al ser datos reales de un solo punto repetimos para dar forma visual
  const mkSpark = (v, max) => {
    if (!v || !max) return [0, 0, 0, 0, 0];
    const base = v / max;
    return [base * 0.6, base * 0.8, base * 0.7, base * 0.9, base].map(x => Math.round(x * 100));
  };

  return (
    <Layout title="Dashboard" subtitle="Resumen de tu negocio">
      <div className="space-y-6">

        {/* ── KPI Cards ─────────────────────────── */}
        <section aria-label="Métricas principales">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              icon={Package}
              label="Total Pacas"
              value={totalPacas.toLocaleString('es-MX')}
              subtext={`${disponibles} disponibles`}
              color="secondary"
              delay={0}
              sparkData={mkSpark(disponibles, totalPacas || 1)}
              sparkColor="#d4a373"
            />
            <MetricCard
              icon={Users}
              label="Clientes"
              value={(metricas?.clientes?.total || 0).toLocaleString('es-MX')}
              subtext={`${metricas?.clientes?.activos || 0} activos`}
              color="primary"
              delay={75}
              sparkData={mkSpark(metricas?.clientes?.activos, metricas?.clientes?.total || 1)}
              sparkColor="#6b7280"
            />
            <MetricCard
              icon={ShoppingCart}
              label="Ventas (30d)"
              value={(metricas?.ventas?.total_ventas || 0).toLocaleString('es-MX')}
              subtext={formatCurrency(metricas?.ventas?.total_ventas_monto)}
              color="success"
              delay={150}
              trend="up"
              sparkData={[40, 55, 45, 70, 65, 80, 90]}
              sparkColor="#6a994e"
            />
            <MetricCard
              icon={Wallet}
              label="Cartera"
              value={formatCurrency(metricas?.cartera?.saldo_pendiente)}
              subtext="Saldo pendiente"
              color="accent"
              delay={225}
              sparkData={[80, 75, 85, 70, 80, 65, 70]}
              sparkColor="#bc4749"
            />
          </div>
        </section>

        {/* ── Acciones rápidas ──────────────────── */}
        <section aria-label="Acciones rápidas">
          <Card className="animate-fade-in-up" style={{ animationDelay: '275ms' }}>
            <CardBody>
              <CardTitle className="mb-3">Acciones Rápidas</CardTitle>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
                <QuickAction to="/pacas"             icon={Package}       label="Inventario"   color="bg-secondary/15 text-secondary" />
                <QuickAction to="/ventas"            icon={ShoppingCart}  label="Nueva Venta"  color="bg-success/15 text-success" />
                <QuickAction to="/clientes"          icon={Users}         label="Clientes"     color="bg-primary/10 text-primary" />
                <QuickAction to="/gestionar-pedidos" icon={Receipt}       label="Pedidos"      color="bg-warning/15 text-warning" />
                <QuickAction to="/cotizaciones"      icon={FileSignature} label="Cotizar"      color="bg-accent/15 text-accent" />
                <QuickAction to="/inteligencia-negocio" icon={Brain}      label="Analytics"   color="bg-purple-500/15 text-purple-500" />
              </div>
            </CardBody>
          </Card>
        </section>

        {/* ── Cards de inventario y valor ───────── */}
        <section aria-label="Análisis de inventario" className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Estado del inventario */}
          <Card hover className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
            <CardBody>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-success/15">
                  <TrendingUp className="w-5 h-5 text-success" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Estado del Inventario</CardTitle>
                  <CardDescription>Distribución por estado de {totalPacas} pacas</CardDescription>
                </div>
              </div>

              {/* Mini tarjetas de estado */}
              <div className="grid grid-cols-3 gap-3 mb-5">
                {[
                  { label: 'Disponibles', value: disponibles, color: 'text-success', bg: 'bg-success/10 border-success/20' },
                  { label: 'Separadas',   value: separadas,   color: 'text-warning', bg: 'bg-warning/10 border-warning/20' },
                  { label: 'Vendidas',    value: vendidas,    color: 'text-accent',  bg: 'bg-accent/10 border-accent/20' },
                ].map(s => (
                  <div key={s.label} className={`p-3 rounded-2xl border ${s.bg} text-center`}>
                    <p className={`text-xl font-display tabular-nums ${s.color}`}>{s.value.toLocaleString('es-MX')}</p>
                    <p className="text-[11px] text-muted mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Barras de progreso */}
              <div className="space-y-3">
                <ProgressBar label="Disponibles" value={disponibles} max={totalPacas} color="bg-success" />
                <ProgressBar label="Separadas"   value={separadas}   max={totalPacas} color="bg-warning" />
                <ProgressBar label="Vendidas"    value={vendidas}    max={totalPacas} color="bg-accent" />
              </div>

              <div className="mt-4 pt-4 border-t border-border/50 flex gap-3">
                <Link to="/pacas"  className="text-xs text-secondary hover:underline font-medium">Ver inventario →</Link>
                <Link to="/ventas" className="text-xs text-secondary hover:underline font-medium">Nueva venta →</Link>
              </div>
            </CardBody>
          </Card>

          {/* Valor del inventario */}
          <Card hover className="animate-fade-in-up" style={{ animationDelay: '375ms' }}>
            <CardBody>
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 rounded-xl bg-secondary/15">
                  <DollarSign className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle>Valor del Inventario</CardTitle>
                  <CardDescription>Análisis financiero del stock</CardDescription>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  {
                    label: 'Costo Total',
                    value: formatCurrency(costoTotal),
                    icon: DollarSign,
                    bg: 'bg-primary/5',
                    iconBg: 'bg-primary/10 text-primary',
                  },
                  {
                    label: 'Valor en Venta',
                    value: formatCurrency(valorInventario),
                    icon: TrendingUp,
                    bg: 'bg-success/10 border border-success/20',
                    iconBg: 'bg-success/20 text-success',
                  },
                  {
                    label: 'Potencial Ganancia',
                    value: formatCurrency(ganancia),
                    icon: ArrowUpRight,
                    bg: 'bg-secondary/10 border border-secondary/20',
                    iconBg: 'bg-secondary/20 text-primary',
                  },
                ].map(row => (
                  <div key={row.label} className={`flex items-center justify-between p-4 rounded-2xl ${row.bg}`}>
                    <div>
                      <p className="text-xs text-muted uppercase tracking-wide">{row.label}</p>
                      <p className="text-lg font-display text-primary mt-0.5 tabular-nums">{row.value}</p>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${row.iconBg} flex-shrink-0`}>
                      <row.icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

        </section>
      </div>
    </Layout>
  );
}