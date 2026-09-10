import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, CardTitle, CardDescription, Button, EmptyState } from '../components/common';
import { dashboardApi, analyticsApi, matrizApi } from '../services/api';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, CartesianGrid, XAxis, YAxis, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Package, Users, ShoppingCart, Wallet,
  TrendingUp, DollarSign, ArrowUpRight, ArrowDownRight,
  Receipt, FileSignature, Brain, TrendingDown,
  AlertTriangle, RefreshCw, Inbox, PackageOpen
} from 'lucide-react';
import { formatCOP, formatNumero } from '../lib/money';

const CHART_COLORS = {
  primary: '#6366f1',
  success: '#16a34a',
  warning: '#d97706',
  accent: '#06b6d4',
  info: '#3b82f6',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-lg">
        <p className="font-medium text-sm mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm text-muted" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === 'number' 
              ? entry.value.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })
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

function MetricCard({ icon: Icon, label, value, subtext, color, trend, delay = 0 }) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/15 text-secondary',
    success: 'bg-success/15 text-success',
    accent: 'bg-accent/15 text-accent',
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

// Un fallo de la API se quedaba en un console.error y el tablero se pintaba
// entero con ceros: no había forma de distinguir "no vendiste nada" de "no se
// pudo consultar". Para un negocio eso es peor que ver un error.
function ErrorState({ mensaje, onReintentar }) {
  return (
    <Card className="border-2 border-error/30">
      <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="p-3 rounded-2xl bg-error/10">
          <AlertTriangle className="w-7 h-7 text-error" aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-lg text-primary">No se pudieron cargar los datos</p>
          <p className="text-sm text-muted mt-1">{mensaje}</p>
          <p className="text-xs text-muted mt-2">
            No se muestran cifras para que no se confundan con ventas reales.
          </p>
        </div>
        <Button variant="secondary" icon={RefreshCw} onClick={onReintentar}>Reintentar</Button>
      </CardBody>
    </Card>
  );
}

// ── PACAS FALTANDO ───────────────────────────────────────────────────────────
//
// Reduce la respuesta de GET /matriz/faltantes a las dos cifras que caben en un
// tablero: cuántas pacas quedaron faltando y a cuántos clientes. Devuelve null
// —y entonces el recuadro NO se pinta— si la respuesta no tiene la forma que
// promete el contrato.
//
// Se recuentan las dos cifras aquí en vez de leer los `total_unidades` y
// `total_clientes` que ya trae la respuesta, y es deliberado: esta pantalla pide
// los faltantes con estado 'abierto', así que lo único que puede garantizar que
// la cifra del tablero cuadra con la de la tarjeta de Clientes y con la del
// detalle de Cartera es que las tres se saquen de la MISMA lista con el MISMO
// criterio. Un tablero que dice 19 y una tarjeta que dice 17 no se debate: se
// deja de creer entero, y con él todo el módulo.
function resumirFaltantes(respuesta) {
  const lista = respuesta && Array.isArray(respuesta.faltantes) ? respuesta.faltantes : null;
  if (!lista) return null;
  let unidades = 0;
  const clientes = new Set();
  for (const f of lista) {
    // Sólo cuenta lo que sigue abierto. Un faltante completado o anulado tiene
    // cantidad_abierta 0 y ya no le falta a nadie: sumarlo sería cobrar dos
    // veces una promesa que ya se cumplió.
    const n = Number(f?.cantidad_abierta) || 0;
    if (n <= 0) continue;
    unidades += n;
    const id = Number(f?.cliente_id);
    if (Number.isFinite(id) && id > 0) clientes.add(id);
  }
  return { unidades, clientes: clientes.size };
}

// Versión compacta para una sola gráfica: el resto del tablero sigue siendo válido.
function ChartError({ mensaje, onReintentar, height = 'h-[250px]' }) {
  return (
    <div className={`${height} flex flex-col items-center justify-center gap-2 text-center px-4`}>
      <AlertTriangle className="w-6 h-6 text-error" aria-hidden="true" />
      <p className="text-sm text-primary font-medium">No se pudo cargar esta gráfica</p>
      <p className="text-xs text-muted">{mensaje}</p>
      <button onClick={onReintentar} className="text-xs text-secondary hover:underline font-medium">
        Reintentar
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [metricas, setMetricas] = useState(null);
  const [ventasData, setVentasData] = useState([]);
  const [ventasMensuales, setVentasMensuales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Un error por serie: si sólo falla la mensual, la diaria SÍ llegó y sería
  // mentira taparla con "No se pudo consultar" (y al revés).
  const [errorDiarias, setErrorDiarias] = useState(null);
  const [errorMensuales, setErrorMensuales] = useState(null);
  // { unidades, clientes } o null. El null no es «cero pacas faltando»: es «no
  // lo pude consultar», y por eso apaga el recuadro en vez de pintarlo con un 0.
  const [faltantes, setFaltantes] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setErrorDiarias(null);
    setErrorMensuales(null);
    setFaltantes(null);
    try {
      // allSettled y no all: las gráficas son secundarias, si fallan ellas el
      // resto del tablero sigue siendo información buena. Lo que no se puede
      // hacer es tapar el fallo con arrays vacíos, que se pintan como "0".
      //
      // Los faltantes entran aquí como una promesa más y no como una llamada
      // aparte por la misma razón: son un dato de adorno para esta pantalla y no
      // pueden retrasar ni tumbar el tablero. Se pide con estado 'abierto'
      // explícito y no confiando en el valor por omisión del servidor, porque si
      // ese valor fuera «todos» el recuadro estaría contando también lo que ya
      // se entregó y lo que se anuló, y diría una cifra mucho más grande que la
      // real justo en el sitio donde ella mira para hacerse una idea rápida.
      const [metricasRes, ventasDiariasRes, ventasMensRes, faltantesRes] = await Promise.allSettled([
        dashboardApi.getMetricas(),
        dashboardApi.getVentasDiarias(30),
        dashboardApi.getVentasMensuales(),
        matrizApi.getFaltantes({ estado: 'abierto' })
      ]);

      if (metricasRes.status === 'rejected') throw metricasRes.reason;
      setMetricas(metricasRes.value);

      if (ventasDiariasRes.status === 'fulfilled') {
        const d = ventasDiariasRes.value;
        setVentasData(d?.data || (Array.isArray(d) ? d : []));
      } else {
        setVentasData([]);
        setErrorDiarias(ventasDiariasRes.reason?.message || 'No se pudieron consultar las ventas de los últimos 30 días.');
      }

      if (ventasMensRes.status === 'fulfilled') {
        const m = ventasMensRes.value;
        setVentasMensuales(m?.data || (Array.isArray(m) ? m : []));
      } else {
        setVentasMensuales([]);
        setErrorMensuales(ventasMensRes.reason?.message || 'No se pudieron consultar las ventas por mes.');
      }

      // Aquí no hay estado de error que enseñar, y es una decisión y no un
      // olvido: si esto falla el recuadro desaparece y el tablero queda tal como
      // estaba antes de que existiera el módulo. Un «—» donde debería ir la
      // cifra obligaría a explicar en el tablero principal por qué un módulo
      // secundario no contesta, y —lo que de verdad importa— este endpoint puede
      // no estar desplegado todavía: el día que se suba el frontend antes que el
      // backend, el tablero tiene que seguir siendo el mismo tablero.
      setFaltantes(faltantesRes.status === 'fulfilled' ? resumirFaltantes(faltantesRes.value) : null);
    } catch (err) {
      setError(err?.message || 'No hay conexión con el servidor.');
      setMetricas(null);
      setVentasData([]);
      setVentasMensuales([]);
      setFaltantes(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = formatCOP;

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <Layout title="Dashboard" subtitle="Resumen de tu negocio">
        <ErrorState mensaje={error} onReintentar={loadData} />
      </Layout>
    );
  }

  // Cargó bien pero el negocio todavía no tiene nada registrado: es un mensaje
  // distinto a "falló la consulta" y hay que decirlo con esas palabras.
  if (!metricas) {
    return (
      <Layout title="Dashboard" subtitle="Resumen de tu negocio">
        <Card>
          <CardBody>
            <EmptyState
              icon={Inbox}
              title="Todavía no hay datos que mostrar"
              description="Cuando registres pacas, clientes o ventas, el resumen del negocio aparecerá aquí."
              action={{ label: 'Actualizar', onClick: loadData }}
            />
          </CardBody>
        </Card>
      </Layout>
    );
  }

  const totalPacas = metricas?.pacas?.total || 0;
  const disponibles = metricas?.pacas?.disponibles || 0;
  const separadas = metricas?.pacas?.separadas || 0;
  const vendidas = metricas?.pacas?.vendidas || 0;
  const costoTotal = metricas?.pacas?.costo_total || 0;
  const valorInventario = metricas?.pacas?.valor_inventario || 0;
  const ganancia = valorInventario - costoTotal;

  // La gráfica de esta misma pantalla lee el importe de la fila como
  // `monto_total || monto || total`, pero esta suma miraba sólo `monto`: si el
  // endpoint nombra la columna monto_total, la tarjeta decía $0 con la gráfica
  // llena de barras, que es justo el "cero que miente" que se quería evitar.
  const totalVentas = ventasData.reduce((sum, v) => {
    const n = parseFloat(v?.monto ?? v?.monto_total ?? v?.total ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
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
              value={totalPacas.toLocaleString('es-CO')}
              subtext={`${disponibles} disponibles`}
              color="secondary"
              delay={0}
            />
            <MetricCard
              icon={Users}
              label="Clientes"
              value={(metricas?.clientes?.total || 0).toLocaleString('es-CO')}
              subtext={`${metricas?.clientes?.activos || 0} activos`}
              color="primary"
              delay={75}
            />
            <MetricCard
              icon={ShoppingCart}
              label="Ventas (30d)"
              value={errorDiarias ? '—' : formatCurrency(totalVentas)}
              subtext={errorDiarias ? 'No se pudo consultar' : `${ventasData.length} transacciones`}
              color="success"
              trend={!errorDiarias && totalVentas > 0 ? 'up' : undefined}
              delay={150}
            />
            <MetricCard
              icon={Wallet}
              label="Cartera"
              value={formatCurrency(metricas?.cartera?.saldo_pendiente)}
              subtext="Saldo pendiente"
              color="accent"
              delay={225}
            />

            {/* PACAS FALTANDO — el quinto recuadro, y el único que puede no estar.
                Este es el sitio donde ella mira el estado global del negocio, así
                que es donde tiene que enterarse de que hay mercancía prometida
                sin entregar. Sustituye al contador que se pensó para el menú
                lateral: aquel obligaba a tocar las métricas del servidor, el
                fichero de contadores y el vaciado de sesión para un número que
                no cambia en todo el día, y un badge que casi nunca cambia se
                vuelve invisible en una semana y miente cuando se queda rancio.

                NO se pinta si la consulta falló (faltantes es null) NI si no le
                falta nada a nadie (unidades en 0). Lo segundo es tan deliberado
                como lo primero: cuando el negocio va bien este módulo tiene que
                poder no existir, y un recuadro clavado en «0 pacas faltando»
                todos los días acaba siendo un adorno que nadie lee, justo el
                mismo defecto por el que se descartó el contador del menú.

                Va a lo ancho de la fila en lugar de estrechar los cuatro de
                arriba a cinco columnas: con cinco, «$12.345.678» de Cartera se
                corta con puntos suspensivos en un portátil normal, y un tablero
                que trunca la cifra de la cartera para hacerle sitio a un dato
                secundario ha invertido las prioridades. Y el borde se marca con
                `ring` y no con `border`, porque la clase base de Card ya trae un
                `border-border/50` y en este repo no hay tailwind-merge: quién
                gana lo decide el orden de la hoja generada, no el orden en que
                se escriban las clases. */}
            {faltantes && faltantes.unidades > 0 && (
              <Card
                hover
                className="md:col-span-2 lg:col-span-4 animate-fade-in-up ring-1 ring-warning/30"
                style={{ animationDelay: '300ms' }}
              >
                <CardBody className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="p-3 rounded-2xl bg-warning/15 text-warning flex-shrink-0">
                    <PackageOpen className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted uppercase tracking-wide">Pacas faltando</p>
                    <p className="text-2xl font-display text-warning mt-0.5 tabular-nums">
                      {formatNumero(faltantes.unidades)}
                    </p>
                  </div>
                  {/* La frase que separa las dos gramáticas. Justo encima, en la
                      misma rejilla, hay una tarjeta de cartera con una cifra en
                      pesos; si esta no dijera en voz alta que son PACAS y no
                      plata, el tablero estaría poniendo dos unidades distintas
                      una al lado de la otra sin avisar de que no se suman. */}
                  <p className="text-sm text-muted flex-1 min-w-[220px]">
                    {faltantes.clientes === 1
                      ? 'A 1 cliente, de repartos anteriores.'
                      : `A ${formatNumero(faltantes.clientes)} clientes, de repartos anteriores.`}{' '}
                    Son pacas de mercancía, no dinero: esto no entra en la cartera.
                  </p>
                  <Link
                    to="/faltantes"
                    className="text-xs font-semibold text-secondary hover:underline flex-shrink-0"
                  >
                    Ver los faltantes →
                  </Link>
                </CardBody>
              </Card>
            )}
          </div>
        </section>

        <section aria-label="Acciones rápidas">
          <Card className="animate-fade-in-up" style={{ animationDelay: '300ms' }}>
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
          <Card className="animate-fade-in-up" style={{ animationDelay: '375ms' }}>
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

          <Card className="lg:col-span-2 animate-fade-in-up" style={{ animationDelay: '450ms' }}>
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
              {errorDiarias
                ? <ChartError mensaje={errorDiarias} onReintentar={loadData} />
                : <VentasBarChart data={ventasData} />}
            </CardBody>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-fade-in-up" style={{ animationDelay: '525ms' }}>
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
              {errorMensuales
                ? <ChartError mensaje={errorMensuales} onReintentar={loadData} />
                : <VentasBarChart data={ventasMensuales} />}
            </CardBody>
          </Card>

          <Card className="animate-fade-in-up" style={{ animationDelay: '600ms' }}>
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
