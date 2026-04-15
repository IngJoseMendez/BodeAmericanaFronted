import { useEffect, useState, useMemo, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Badge } from '../components/common';
import { analyticsApi } from '../services/api';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend
} from 'recharts';
import {
  TrendingUp, Users, Package, Zap, AlertTriangle, CheckCircle, Clock,
  DollarSign, ShoppingCart, ArrowUp, ArrowDown, Brain, Target, Award,
  BarChart3, RefreshCw, Filter, Star, Info, Calendar, Database, TrendingDown,
  Minus, Sparkles, ChevronDown, ChevronUp, HelpCircle
} from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value || 0);
};

const COLORS = {
  primary: '#1a1a2e',
  secondary: '#d4a373',
  success: '#6a994e',
  accent: '#bc4749',
  warning: '#f4a261',
  info: '#3b82f6'
};

const SCORE_COLORS = {
  VIP: '#6a994e',
  Frecuente: '#3b82f6',
  Ocasional: '#f4a261',
  Riesgoso: '#bc4749'
};

const ROTACION_COLORS = {
  rapida: '#6a994e',
  media: '#f4a261',
  lenta: '#bc4749'
};

const PRIORIDAD_COLORS = {
  alta: 'bg-red-100 text-red-800 border-red-200',
  media: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  baja: 'bg-green-100 text-green-800 border-green-200'
};

const CONFIANZA_COLORS = {
  excelente: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  buena: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  regular: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  baja: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500' }
};

const URGENCIA_STYLES = {
  critica: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: '🚨' },
  alta: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: '⚠️' },
  media: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: '📅' },
  baja: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: '✓' }
};

// Hook para detectar preferencia de movimiento reducido
function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);
    
    const handler = (e) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return reducedMotion;
}

// Componente Skeleton Loader
function Skeleton({ className, variant = 'rect' }) {
  const baseClass = variant === 'circle' ? 'rounded-full' : 'rounded-lg';
  return (
    <div 
      className={`animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] ${baseClass} ${className}`}
      aria-hidden="true"
    />
  );
}

// Skeleton para cards de métricas
function MetricCardSkeleton() {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start justify-between">
          <Skeleton className="w-10 h-10 rounded-xl" variant="circle" />
          <Skeleton className="w-8 h-4 rounded" />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="w-16 h-8 rounded" />
          <Skeleton className="w-24 h-4 rounded" />
          <Skeleton className="w-20 h-3 rounded" />
        </div>
      </CardBody>
    </Card>
  );
}

// Skeleton para lista de clientes
function ClienteCardSkeleton() {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-4 p-4">
          <Skeleton className="w-12 h-12 rounded-xl" variant="circle" />
          <div className="flex-1 space-y-2">
            <Skeleton className="w-32 h-5 rounded" />
            <Skeleton className="w-48 h-4 rounded" />
            <Skeleton className="w-24 h-3 rounded" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton className="w-20 h-6 rounded-full" />
            <Skeleton className="w-16 h-4 rounded" />
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// Barra de progreso circular para score
function CircularProgress({ score, size = 80, strokeWidth = 6, showLabel = true }) {
  const reducedMotion = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  
  const getColor = () => {
    if (score >= 85) return '#10b981'; // emerald-500
    if (score >= 70) return '#3b82f6'; // blue-500
    if (score >= 50) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };
  
  return (
    <div 
      className="relative inline-flex items-center justify-center"
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Score de confiabilidad: ${score} de 100`}
    >
      <svg 
        width={size} 
        height={size} 
        className={`transform -rotate-90 ${reducedMotion ? '' : 'transition-all duration-500 ease-out'}`}
      >
        {/* Fondo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-200"
        />
        {/* Progreso */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`${reducedMotion ? '' : 'transition-all duration-700 ease-out'}`}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{score}</span>
          <span className="text-xs text-slate-500">/100</span>
        </div>
      )}
    </div>
  );
}

// Barra de progreso lineal
function LinearProgress({ value, max = 100, color, label, showValue = true }) {
  const reducedMotion = useReducedMotion();
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          {showValue && (
            <span className="text-sm text-slate-500 tabular-nums">{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <div 
        className="h-2 bg-slate-200 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full rounded-full ${reducedMotion ? '' : 'transition-all duration-500 ease-out'}`}
          style={{ 
            width: `${percentage}%`, 
            backgroundColor: color || (percentage >= 85 ? '#10b981' : percentage >= 70 ? '#3b82f6' : percentage >= 50 ? '#f59e0b' : '#ef4444')
          }}
        />
      </div>
    </div>
  );
}

// Tooltip personalizado con detalles del score
function TooltipScore({ children, score }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);
  
  const detalles = score?.detalles || {};
  const factores = [
    { label: 'Cantidad datos', puntos: detalles.cantidadDatos?.puntos, max: 30 },
    { label: 'R² linealidad', puntos: detalles.rSquared?.puntos, max: 30 },
    { label: 'Consistencia', puntos: detalles.consistencia?.puntos, max: 20 },
    { label: 'Recencia', puntos: detalles.recencia?.puntos, max: 10 },
    { label: 'Estacionalidad', puntos: detalles.estacionalidad?.puntos, max: 10 },
  ];
  
  return (
    <div className="relative inline-block" ref={ref}>
      <div
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      >
        {children}
      </div>
      {isOpen && score && (
        <div 
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-xl text-sm"
          role="tooltip"
        >
          <p className="font-semibold mb-2 text-center">{score.nivel?.toUpperCase()} ({score.score}/100)</p>
          <div className="space-y-1.5">
            {factores.map((factor, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="text-slate-300">{factor.label}</span>
                <span className="tabular-nums font-medium">{factor.puntos}/{factor.max}</span>
              </div>
            ))}
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
        </div>
      )}
    </div>
  );
}

// Badge de confianza mejorado
function ConfianzaBadge({ nivel, score }) {
  const colors = CONFIANZA_COLORS[nivel] || CONFIANZA_COLORS.baja;
  const icons = {
    excelente: <Sparkles className="w-3 h-3" />,
    buena: <CheckCircle className="w-3 h-3" />,
    regular: <Minus className="w-3 h-3" />,
    baja: <AlertTriangle className="w-3 h-3" />
  };
  const labels = {
    excelente: '⭐ Excelente',
    buena: '✓ Buena',
    regular: '~ Regular',
    baja: '⚠ Baja'
  };
  
  return (
    <TooltipScore score={{ nivel, score }}>
      <span 
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} cursor-help`}
        role="status"
        aria-label={`Nivel de confianza: ${nivel}, score ${score}`}
      >
        {icons[nivel]} {labels[nivel]} ({score})
      </span>
    </TooltipScore>
  );
}

// Card de cliente con todas las mejoras
function ClientePrediccionCard({ cliente, index = 0 }) {
  const [expanded, setExpanded] = useState(false);
  const reducedMotion = useReducedMotion();
  const confianza = cliente.prediccion?.confiabilidad;
  const banda = cliente.prediccion?.bandaConfianza;
  const estacionalidad = cliente.prediccion?.estacionalidad;
  const tendencia = cliente.prediccion?.tendencia;
  const urgenciaStyle = URGENCIA_STYLES[cliente.prediccion?.urgencia] || URGENCIA_STYLES.baja;
  
  const urgenciaLabels = {
    critica: '🚨 Crítica',
    alta: '⚠️ Alta',
    media: '📅 Media',
    baja: '✓ Normal'
  };
  
  const tendenciaIcon = {
    acelerando: <TrendingUp className="w-3 h-3" />,
    desacelerando: <TrendingDown className="w-3 h-3" />,
    estable: <Minus className="w-3 h-3" />
  };
  
  return (
    <div
      className={`
        ${urgenciaStyle.bg} border ${urgenciaStyle.border} rounded-2xl overflow-hidden
        ${reducedMotion ? '' : 'transition-all duration-300 ease-out'}
        ${expanded ? 'shadow-lg' : 'hover:shadow-md hover:scale-[1.01]'}
        animate-fade-in-up
      `}
      style={{ 
        animationDelay: reducedMotion ? '0ms' : `${index * 50}ms`,
        animationFillMode: 'both'
      }}
      role="article"
      aria-labelledby={`cliente-${cliente.id}-nombre`}
    >
      <div 
        className="p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-controls={`cliente-${cliente.id}-detalles`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Info principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h4 id={`cliente-${cliente.id}-nombre`} className="font-semibold text-lg text-slate-800 truncate">
                {cliente.nombre}
              </h4>
              <ConfianzaBadge nivel={confianza?.nivel} score={confianza?.score} />
              {tendencia !== 'estable' && (
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                  tendencia === 'acelerando' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {tendenciaIcon[tendencia]} {tendencia === 'acelerando' ? 'Acelerando' : 'Desacelerando'}
                </span>
              )}
            </div>
            
            {/* Banda de confianza */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" aria-hidden="true" />
                <span>
                  Entre{' '}
                  <strong className="text-slate-800">
                    {cliente.prediccion?.fechaMinima && new Date(cliente.prediccion.fechaMinima).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </strong>
                  {' - '}
                  <strong className="text-slate-800">
                    {cliente.prediccion?.fechaMaxima && new Date(cliente.prediccion.fechaMaxima).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </strong>
                </span>
              </span>
              <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                {banda?.probabilidad || '80%'} probabilidad
              </span>
              {estacionalidad?.tipo !== 'variable' && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  estacionalidad?.tipo === 'quincenal' ? 'bg-purple-100 text-purple-700' : 'bg-indigo-100 text-indigo-700'
                }`}>
                  📅 {estacionalidad?.tipo === 'quincenal' ? 'Pago quincenal' : 'Pago mensual'}
                </span>
              )}
            </div>
          </div>
          
          {/* Score circular */}
          <TooltipScore score={confianza}>
            <div className="flex-shrink-0 cursor-help">
              <CircularProgress score={confianza?.score || 0} size={64} strokeWidth={5} />
            </div>
          </TooltipScore>
          
          {/* Detalles rápidos */}
          <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2 lg:gap-1">
            <span 
              className={`px-3 py-1 rounded-full text-sm font-medium ${urgenciaStyle.bg} ${urgenciaStyle.text} border ${urgenciaStyle.border}`}
              role="status"
            >
              {urgenciaLabels[cliente.prediccion?.urgencia]}
            </span>
            <span className="text-sm text-slate-500">
              hace {Math.max(0, cliente.prediccion?.diasDesdeUltimaCompra || 0)} días
            </span>
            <span className="text-sm font-medium text-slate-700" title="Ticket promedio de compra">
              ~{formatCurrency(cliente.prediccion?.montoEstimado)}
            </span>
          </div>
          
          {/* Expand indicator */}
          <button
            className="p-1 rounded-lg hover:bg-white/50 lg:hidden"
            aria-label={expanded ? 'Contraer detalles' : 'Expandir detalles'}
          >
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>
      
      {/* Detalles expandidos */}
      <div 
        id={`cliente-${cliente.id}-detalles`}
        className={`border-t ${urgenciaStyle.border} ${expanded ? 'block' : 'hidden'}`}
        role="region"
        aria-label="Detalles de predicción"
      >
        <div className="p-4 bg-white/50 space-y-4">
          {/* Breakdown del score */}
          {confianza?.detalles && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Desglose del Score de Confiabilidad
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Datos</p>
                  <p className="font-semibold text-slate-800">{confianza.detalles.cantidadDatos?.puntos || 0}/{confianza.detalles.cantidadDatos?.max}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">R²</p>
                  <p className="font-semibold text-slate-800">{confianza.detalles.rSquared?.puntos || 0}/{confianza.detalles.rSquared?.max}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Consistencia</p>
                  <p className="font-semibold text-slate-800">{confianza.detalles.consistencia?.puntos || 0}/{confianza.detalles.consistencia?.max}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Recencia</p>
                  <p className="font-semibold text-slate-800">{confianza.detalles.recencia?.puntos || 0}/{confianza.detalles.recencia?.max}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-500">Estacionalidad</p>
                  <p className="font-semibold text-slate-800">{confianza.detalles.estacionalidad?.puntos || 0}/{confianza.detalles.estacionalidad?.max}</p>
                </div>
              </div>
              <LinearProgress 
                value={confianza.score || 0} 
                max={100} 
                color={
                  confianza.score >= 85 ? '#10b981' : 
                  confianza.score >= 70 ? '#3b82f6' : 
                  confianza.score >= 50 ? '#f59e0b' : '#ef4444'
                }
              />
            </div>
          )}
          
          {/* Insights */}
          {cliente.prediccion?.insights?.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Insights
              </p>
              <div className="flex flex-wrap gap-2">
                {cliente.prediccion.insights.map((insight, i) => (
                  <span 
                    key={i}
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      insight.nivel === 'success' ? 'bg-emerald-100 text-emerald-700' :
                      insight.nivel === 'info' ? 'bg-blue-100 text-blue-700' :
                      insight.nivel === 'warning' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}
                    role="status"
                  >
                    {insight.mensaje?.substring(0, 60)}{insight.mensaje?.length > 60 ? '...' : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Explicación de confiabilidad */}
          {confianza?.explicacion && (
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
              <p className="text-sm text-blue-800">
                <HelpCircle className="w-4 h-4 inline mr-1" />
                {confianza.explicacion}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Estado vacío mejorado
function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div 
      className="flex flex-col items-center justify-center py-16 px-4 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Icon className="w-10 h-10 text-slate-400" aria-hidden="true" />
      </div>
      <h4 className="text-lg font-semibold text-slate-700 mb-2">{title}</h4>
      <p className="text-sm text-slate-500 max-w-sm mb-4">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant="outline">
          {action.label}
        </Button>
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, subtext, color = 'primary', trend, delay = 0 }) {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-secondary/20 text-secondary',
    success: 'bg-success/10 text-success',
    accent: 'bg-accent/10 text-accent',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-blue-100 text-blue-700'
  };

  return (
    <Card hover className={`animate-fade-in`} style={{ animationDelay: `${delay}ms` }}>
      <CardBody>
        <div className="flex items-start justify-between">
          <div className={`p-2.5 rounded-xl ${colorClasses[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <span className={`flex items-center text-xs font-medium ${trend === 'up' ? 'text-success' : 'text-accent'}`}>
              {trend === 'up' ? <ArrowUp className="w-3 h-3 mr-1" /> : <ArrowDown className="w-3 h-3 mr-1" />}
              {trend}
            </span>
          )}
        </div>
        <div className="mt-3">
          <p className="text-2xl font-display font-bold text-primary truncate" title={String(value)}>
            {value}
          </p>
          <p className="text-sm font-medium text-primary mt-1">{label}</p>
          {subtext && <p className="text-xs text-muted mt-0.5">{subtext}</p>}
        </div>
      </CardBody>
    </Card>
  );
}

function RotacionChart({ data }) {
  const chartData = [
    { name: 'Rápida', value: data?.filter(r => r.clasificacion_rotacion === 'rapida')?.length || 0, color: COLORS.success },
    { name: 'Media', value: data?.filter(r => r.clasificacion_rotacion === 'media')?.length || 0, color: COLORS.warning },
    { name: 'Lenta', value: data?.filter(r => r.clasificacion_rotacion === 'lenta')?.length || 0, color: COLORS.accent }
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return <p className="text-center text-muted py-8">Sin datos de rotación</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [`${value} pacas`, name]}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e0db' }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function VentasChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-center text-muted py-8">Sin datos de ventas</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e0db" />
        <XAxis
          dataKey="periodo"
          tick={{ fontSize: 11 }}
          tickFormatter={(value) => {
            if (value.length > 7) return value.slice(5);
            return value;
          }}
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, name) => [formatCurrency(value), name === 'monto_total' ? 'Monto' : name]}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e0db' }}
        />
        <Line
          type="monotone"
          dataKey="monto_total"
          stroke={COLORS.success}
          strokeWidth={2}
          dot={{ fill: COLORS.success, strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ClientesScoreChart({ data }) {
  const chartData = [
    { name: 'VIP', value: data?.VIP || 0, color: SCORE_COLORS.VIP },
    { name: 'Frecuente', value: data?.Frecuente || 0, color: SCORE_COLORS.Frecuente },
    { name: 'Ocasional', value: data?.Ocasional || 0, color: SCORE_COLORS.Ocasional },
    { name: 'Riesgoso', value: data?.Riesgoso || 0, color: SCORE_COLORS.Riesgoso }
  ].filter(d => d.value > 0);

  if (chartData.length === 0) {
    return <p className="text-center text-muted py-8">Sin datos de clientes</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          outerRadius={80}
          dataKey="value"
          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}

function LotesRentabilidadChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-center text-muted py-8">Sin datos de lotes</p>;
  }

  const chartData = data.slice(0, 8).map(lote => ({
    name: lote.numero.length > 10 ? lote.numero.slice(0, 10) + '...' : lote.numero,
    ganancia: parseFloat(lote.ganancia_lote) || 0,
    margen: parseFloat(lote.margen_porcentaje) || 0
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
        <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, name) => [formatCurrency(value), name === 'ganancia' ? 'Ganancia' : 'Margen %']}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e0db' }}
        />
        <Bar dataKey="ganancia" fill={COLORS.success} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TiposVendidosChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-center text-muted py-8">Sin datos</p>;
  }

  const chartData = data.slice(0, 6).map(item => ({
    name: item.tipo,
    cantidad: parseInt(item.cantidad) || 0,
    ganancia: parseFloat(item.ganancia) || 0
  }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(value, name) => [
            name === 'ganancia' ? formatCurrency(value) : value,
            name === 'ganancia' ? 'Ganancia' : 'Cantidad'
          ]}
          contentStyle={{ borderRadius: '8px', border: '1px solid #e5e0db' }}
        />
        <Legend />
        <Bar yAxisId="left" dataKey="cantidad" name="Cantidad" fill={COLORS.secondary} radius={[4, 4, 0, 0]} />
        <Bar yAxisId="right" dataKey="ganancia" name="Ganancia" fill={COLORS.success} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function InteligenciaDeNegocio() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');
  const [periodo, setPeriodo] = useState('dia');

  const [rotacion, setRotacion] = useState(null);
  const [clientesScore, setClientesScore] = useState(null);
  const [lotes, setLotes] = useState(null);
  const [ventas, setVentas] = useState(null);
  const [predicciones, setPredicciones] = useState(null);
  const [recomendaciones, setRecomendaciones] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [queComprar, setQueComprar] = useState(null);
  const [riesgoCartera, setRiesgoCartera] = useState(null);
  const [flujoCaja, setFlujoCaja] = useState(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [rotacionData, scoreData, lotesData, ventasData, prediccionesData, recomendacionesData, dashboardData, queComprarData, riesgoData, flujoData] = await Promise.all([
        analyticsApi.getRotacion(),
        analyticsApi.getClientesScore(),
        analyticsApi.getLotes(),
        analyticsApi.getVentas({ periodo, dias: 30 }),
        analyticsApi.getPredicciones(),
        analyticsApi.getRecomendaciones(),
        analyticsApi.getDashboard(),
        analyticsApi.getQueComprar(),
        analyticsApi.getRiesgoCartera(),
        analyticsApi.getFlujoCaja({ semanas: 4 })
      ]);

      setRotacion(rotacionData);
      setClientesScore(scoreData);
      setLotes(lotesData);
      setVentas(ventasData);
      setPredicciones(prediccionesData);
      setRecomendaciones(recomendacionesData);
      setDashboard(dashboardData);
      setQueComprar(queComprarData);
      setRiesgoCartera(riesgoData);
      setFlujoCaja(flujoData);
    } catch (err) {
      console.error('Error cargando analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'resumen', label: 'Resumen', icon: Brain },
    { id: 'rotacion', label: 'Rotación', icon: Zap },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'lotes', label: 'Lotes', icon: Package },
    { id: 'ventas', label: 'Ventas', icon: TrendingUp },
    { id: 'predicciones', label: 'Predicciones', icon: Target },
    { id: 'que-comprar', label: 'Qué Comprar', icon: ShoppingCart },
    { id: 'riesgo', label: 'Riesgo Cartera', icon: AlertTriangle },
    { id: 'flujo-caja', label: 'Flujo Caja', icon: DollarSign },
    { id: 'insights', label: 'Insights', icon: Award }
  ];

  if (loading) {
    return (
      <Layout title="Inteligencia de Negocio" subtitle="Analytics y Insights">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Inteligencia de Negocio" subtitle="Analytics y Insights">
      <div className="space-y-6">
        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              ⚠️ Las predicciones son estimaciones basadas en datos históricos
            </p>
            <p className="text-xs text-blue-700 mt-1">
              No garantizan resultados futuros. Úsalas como guía, no como verdad absoluta.
              Se requieren al menos 3-5 compras por cliente para predicciones confiables.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white text-muted hover:bg-gray-50 border border-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          <Button
            variant="ghost"
            onClick={loadAllData}
            icon={RefreshCw}
            className="ml-auto"
          >
            Actualizar
          </Button>
        </div>

        {/* Resumen */}
        {activeTab === 'resumen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard
                icon={Users}
                label="Score Promedio"
                value={dashboard?.scorePromedioClientes || 0}
                subtext="de 100 puntos"
                color="primary"
                delay={0}
              />
              <MetricCard
                icon={Award}
                label="Clientes VIP"
                value={dashboard?.distribucionClientes?.VIP || 0}
                subtext="de clientes analizados"
                color="success"
                delay={100}
              />
              <MetricCard
                icon={Zap}
                label="Rotación Rápida"
                value={dashboard?.rotacionResumen?.rapida || 0}
                subtext="pacas en inventario"
                color="warning"
                delay={200}
              />
              <MetricCard
                icon={Target}
                label="Predicciones"
                value={predicciones?.totalConPrediccion || 0}
                subtext="clientes con patrón"
                color="info"
                delay={300}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Distribución de Clientes</h3>
                  <ClientesScoreChart data={clientesScore?.distribucion} />
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Ventas por Período</h3>
                  <VentasChart data={ventas?.comparativo} />
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Top Recomendaciones</h3>
                <div className="space-y-3">
                  {recomendaciones?.recomendaciones?.slice(0, 5).map((rec, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${PRIORIDAD_COLORS[rec.prioridad]}`}>
                      <div className={`p-1.5 rounded-full ${
                        rec.prioridad === 'alta' ? 'bg-red-100' :
                        rec.prioridad === 'media' ? 'bg-yellow-100' : 'bg-green-100'
                      }`}>
                        {rec.prioridad === 'alta' ? (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{rec.titulo}</p>
                        <p className="text-xs mt-0.5 opacity-80">{rec.mensaje}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Rotación */}
        {activeTab === 'rotacion' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={Zap}
                label="Rotación Rápida"
                value={rotacion?.porClasificacion?.find(r => r.clasificacion_rotacion === 'rapida')?.cantidad || 0}
                subtext="< 7 días"
                color="success"
              />
              <MetricCard
                icon={Clock}
                label="Rotación Media"
                value={rotacion?.porClasificacion?.find(r => r.clasificacion_rotacion === 'media')?.cantidad || 0}
                subtext="7-20 días"
                color="warning"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Rotación Lenta"
                value={rotacion?.porClasificacion?.find(r => r.clasificacion_rotacion === 'lenta')?.cantidad || 0}
                subtext="> 20 días"
                color="accent"
              />
              <MetricCard
                icon={CheckCircle}
                label="Vendidas"
                value={rotacion?.resumen?.find(r => r.estado === 'vendida')?.cantidad || 0}
                subtext="total"
                color="info"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Distribución por Rotación</h3>
                  <RotacionChart data={rotacion?.pacasLentas} />
                  <div className="flex justify-center gap-4 mt-4 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-success"></span> Rápida
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-warning"></span> Media
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-accent"></span> Lenta
                    </span>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Pacas Lentas (sin vender +20 días)</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {rotacion?.pacasLentas?.length > 0 ? (
                      rotacion.pacasLentas.map((paca, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{paca.tipo}</p>
                            <p className="text-xs text-muted">{paca.categoria}</p>
                          </div>
                          <div className="text-right">
                            <Badge variant="error">{paca.dias_inventario} días</Badge>
                            <p className="text-xs text-muted mt-1">{formatCurrency(paca.precio_venta)}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-center text-muted py-4">Sin pacas lentas</p>
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Tipos Más Vendidos por Rotación</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Tipo</th>
                        <th className="px-4 py-2 text-left">Categoría</th>
                        <th className="px-4 py-2 text-right">Cantidad</th>
                        <th className="px-4 py-2 text-right">Prom. Días</th>
                        <th className="px-4 py-2 text-right">Ingreso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rotacion?.topVendidas?.map((item, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium">{item.tipo}</td>
                          <td className="px-4 py-2 text-muted">{item.categoria}</td>
                          <td className="px-4 py-2 text-right">{item.cantidad}</td>
                          <td className="px-4 py-2 text-right">{item.promedio_dias}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.ingreso_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Clientes */}
        {activeTab === 'clientes' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={Star}
                label="VIP"
                value={clientesScore?.distribucion?.VIP || 0}
                subtext="score 80-100"
                color="success"
              />
              <MetricCard
                icon={Users}
                label="Frecuentes"
                value={clientesScore?.distribucion?.Frecuente || 0}
                subtext="score 60-79"
                color="info"
              />
              <MetricCard
                icon={Clock}
                label="Ocasionales"
                value={clientesScore?.distribucion?.Ocasional || 0}
                subtext="score 35-59"
                color="warning"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Riesgosos"
                value={clientesScore?.distribucion?.Riesgoso || 0}
                subtext="score < 35"
                color="accent"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Distribución por Score</h3>
                  <ClientesScoreChart data={clientesScore?.distribucion} />
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Top 5 Clientes VIP</h3>
                  <div className="space-y-3">
                    {clientesScore?.clientes
                      ?.filter(c => c.categoria === 'VIP')
                      .slice(0, 5)
                      .map((cliente, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-success/5 rounded-xl border border-success/20">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                              <span className="font-bold text-success">{cliente.score}</span>
                            </div>
                            <div>
                              <p className="font-medium">{cliente.nombre}</p>
                              <p className="text-xs text-muted">{cliente.ciudad || 'Sin ciudad'}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge variant="success">VIP</Badge>
                            <p className="text-sm font-medium mt-1">{formatCurrency(cliente.monto_total)}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Ranking de Clientes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Cliente</th>
                        <th className="px-4 py-2 text-left">Ciudad</th>
                        <th className="px-4 py-2 text-right">Compras</th>
                        <th className="px-4 py-2 text-right">Monto Total</th>
                        <th className="px-4 py-2 text-center">Score</th>
                        <th className="px-4 py-2 text-center">Categoría</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {clientesScore?.clientes?.slice(0, 20).map((cliente, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{cliente.nombre}</td>
                          <td className="px-4 py-2 text-muted">{cliente.ciudad || '-'}</td>
                          <td className="px-4 py-2 text-right">{cliente.total_compras}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(cliente.monto_total)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                              cliente.score >= 80 ? 'bg-success/20 text-success' :
                              cliente.score >= 60 ? 'bg-blue-100 text-blue-700' :
                              cliente.score >= 35 ? 'bg-warning/20 text-warning' :
                              'bg-accent/20 text-accent'
                            }`}>
                              {cliente.score}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge
                              variant={
                                cliente.categoria === 'VIP' ? 'success' :
                                cliente.categoria === 'Frecuente' ? 'info' :
                                cliente.categoria === 'Ocasional' ? 'warning' : 'error'
                              }
                            >
                              {cliente.categoria}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Lotes */}
        {activeTab === 'lotes' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={Package}
                label="Lotes Activos"
                value={lotes?.totales?.lotesActivos || 0}
                color="primary"
              />
              <MetricCard
                icon={DollarSign}
                label="Costo Total"
                value={formatCurrency(lotes?.totales?.costoTotal || 0)}
                color="secondary"
              />
              <MetricCard
                icon={TrendingUp}
                label="Vendido Total"
                value={formatCurrency(lotes?.totales?.vendidoTotal || 0)}
                color="success"
              />
              <MetricCard
                icon={Award}
                label="Ganancia Total"
                value={formatCurrency(lotes?.totales?.gananciaTotal || 0)}
                color="success"
              />
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Rentabilidad por Lote</h3>
                <LotesRentabilidadChart data={lotes?.lotes} />
              </CardBody>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4 text-success">Top 5 Más Rentables</h3>
                  <div className="space-y-3">
                    {lotes?.topRentables?.map((lote, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-success/5 rounded-xl">
                        <div>
                          <p className="font-medium">{lote.numero}</p>
                          <p className="text-xs text-muted">{lote.proveedor || 'Sin proveedor'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-success">{formatCurrency(lote.ganancia_lote)}</p>
                          <p className="text-xs text-success">+{lote.margen_porcentaje}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4 text-accent">Menos Rentables</h3>
                  <div className="space-y-3">
                    {lotes?.menosRentables?.map((lote, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="font-medium">{lote.numero}</p>
                          <p className="text-xs text-muted">{lote.pacas_vendidas}/{lote.cantidad_pacas} vendidas</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-accent">{lote.margen_porcentaje}%</p>
                          <p className="text-xs text-muted">margen</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}

        {/* Ventas */}
        {activeTab === 'ventas' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <select
                value={periodo}
                onChange={(e) => {
                  setPeriodo(e.target.value);
                  analyticsApi.getVentas({ periodo: e.target.value, dias: 30 }).then(setVentas);
                }}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm"
              >
                <option value="dia">Diario</option>
                <option value="semana">Semanal</option>
                <option value="mes">Mensual</option>
              </select>
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Tendencia de Ventas (Últimos 30 días)</h3>
                <VentasChart data={ventas?.ventas} />
              </CardBody>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Tipos Más Vendidos</h3>
                  <TiposVendidosChart data={ventas?.tiposVendidos} />
                </CardBody>
              </Card>

              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">Métodos de Pago</h3>
                  <div className="space-y-3">
                    {ventas?.metodosPago?.map((metodo, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${
                            metodo.tipo_pago === 'contado' ? 'bg-success/10' : 'bg-warning/10'
                          }`}>
                            <DollarSign className={`w-5 h-5 ${
                              metodo.tipo_pago === 'contado' ? 'text-success' : 'text-warning'
                            }`} />
                          </div>
                          <div>
                            <p className="font-medium capitalize">{metodo.tipo_pago}</p>
                            <p className="text-xs text-muted">{metodo.num_ventas} ventas</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(metodo.monto_total)}</p>
                          <p className="text-xs text-muted">ticket: {formatCurrency(metodo.ticket_promedio)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Top Clientes (Últimos 30 días)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Cliente</th>
                        <th className="px-4 py-2 text-left">Ciudad</th>
                        <th className="px-4 py-2 text-right">Ventas</th>
                        <th className="px-4 py-2 text-right">Monto</th>
                        <th className="px-4 py-2 text-right">Ticket Prom.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {ventas?.topClientes?.map((cliente, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium">{cliente.nombre}</td>
                          <td className="px-4 py-2 text-muted">{cliente.ciudad || '-'}</td>
                          <td className="px-4 py-2 text-right">{cliente.num_ventas}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(cliente.monto_total)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(cliente.ticket_promedio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Predicciones */}
        {activeTab === 'predicciones' && (
          <div className="space-y-6" role="region" aria-label="Predicciones de clientes">
            {/* Métricas principales */}
            <div 
              className="grid grid-cols-2 lg:grid-cols-5 gap-4"
              role="group"
              aria-label="Métricas de predicciones"
            >
              <MetricCard
                icon={Target}
                label="Con Predicción"
                value={predicciones?.totalConPrediccion || 0}
                subtext="clientes"
                color="primary"
              />
              <MetricCard
                icon={Clock}
                label="Próximos 7 días"
                value={predicciones?.proximos7dias?.length || 0}
                subtext="posibles compras"
                color="warning"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Atrasados"
                value={predicciones?.vencidas?.length || 0}
                subtext="requieren atención"
                color="accent"
              />
              <MetricCard
                icon={CheckCircle}
                label="Score Promedio"
                value={predicciones?.promedioScoreConfiabilidad || 0}
                subtext="/ 100 puntos"
                color="success"
              />
              <MetricCard
                icon={Star}
                label="Alta Confianza"
                value={predicciones?.resumenConfiabilidad?.alta || 0}
                subtext="excelente/buena"
                color="info"
              />
            </div>

            {/* Sistema de confiabilidad mejorado */}
            <Card className="bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 overflow-hidden">
              <CardBody>
                <h4 
                  className="font-display text-lg mb-4 flex items-center gap-3"
                  id="confiabilidad-heading"
                >
                  <div className="p-2 bg-blue-100 rounded-xl">
                    <Star className="w-5 h-5 text-blue-600" />
                  </div>
                  Sistema de Confiabilidad Mejorado
                  <span className="ml-auto text-xs text-slate-500 font-normal">
                    5 factores combinados para mayor precisión
                  </span>
                </h4>
                
                {/* Factores del score */}
                <div className="bg-white/60 rounded-xl p-4 mb-4">
                  <p className="text-sm text-muted mb-3">
                    El score de confiabilidad combina <strong>5 factores</strong> para darte una predicción más precisa:
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {[
                      { icon: Database, label: 'Cantidad datos', puntos: '0-30', desc: 'Más historial = más preciso' },
                      { icon: TrendingUp, label: 'R² linealidad', puntos: '0-30', desc: 'Patrón consistente' },
                      { icon: BarChart3, label: 'Consistencia', puntos: '0-20', desc: 'Poca variación' },
                      { icon: Clock, label: 'Recencia', puntos: '0-10', desc: 'Compra reciente' },
                      { icon: Calendar, label: 'Estacionalidad', puntos: '0-10', desc: 'Patrón detectable' },
                    ].map((factor, i) => (
                      <div 
                        key={i} 
                        className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                        title={factor.desc}
                      >
                        <factor.icon className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
                        <div>
                          <p className="text-xs font-medium text-slate-700">{factor.label}</p>
                          <p className="text-xs text-muted">{factor.puntos} pts</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Clasificación de confiabilidad */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { nivel: 'excelente', rango: '85-100', desc: 'Predicción altamente confiable', color: 'emerald' },
                    { nivel: 'buena', rango: '70-84', desc: 'Confiable, patrón estable', color: 'blue' },
                    { nivel: 'regular', rango: '50-69', desc: 'Incertidumbre moderada', color: 'amber' },
                    { nivel: 'baja', rango: '0-49', desc: 'Pocos datos o irregular', color: 'red' },
                  ].map((item) => {
                    const colors = CONFIANZA_COLORS[item.nivel];
                    return (
                      <div 
                        key={item.nivel}
                        className={`p-3 ${colors.bg} border ${colors.border} rounded-xl transition-all hover:scale-[1.02]`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-3 h-3 rounded-full ${colors.dot}`}></span>
                          <span className={`font-medium ${colors.text} capitalize`}>{item.nivel}</span>
                          <span className={`ml-auto text-xs font-mono ${colors.text}`}>{item.rango}</span>
                        </div>
                        <p className={`text-xs ${colors.text} opacity-80`}>{item.desc}</p>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>

            {/* Clientes próximos a comprar */}
            <Card>
              <CardBody>
                <div className="flex items-center gap-3 mb-4">
                  <ShoppingCart className="w-6 h-6 text-success" />
                  <h3 className="font-display text-lg">Próximos a Comprar</h3>
                  <Badge variant="success" className="ml-auto">{predicciones?.proximos7dias?.length || 0}</Badge>
                </div>
                
                {predicciones?.proximos7dias?.length > 0 ? (
                  <div 
                    className="space-y-3"
                    role="list"
                    aria-label="Lista de clientes próximos a comprar"
                  >
                    {predicciones.proximos7dias.slice(0, 10).map((cliente, i) => (
                      <ClientePrediccionCard 
                        key={cliente.id || i} 
                        cliente={cliente} 
                        index={i}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Target}
                    title="No hay predicciones próximas"
                    description="Los clientes necesitan al menos 3-5 compras en su historial para generar predicciones confiables."
                  />
                )}
              </CardBody>
            </Card>

            {/* Clientes atrasados */}
            <Card className="border-accent/30">
              <CardBody>
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-6 h-6 text-accent" />
                  <h3 className="font-display text-lg">Requieren Atención</h3>
                  <Badge variant="error" className="ml-auto">{predicciones?.vencidas?.length || 0}</Badge>
                </div>
                
                {predicciones?.vencidas?.length > 0 ? (
                  <div 
                    className="space-y-3"
                    role="list"
                    aria-label="Lista de clientes que requieren atención"
                  >
                    {predicciones.vencidas.slice(0, 10).map((cliente, i) => (
                      <ClientePrediccionCard 
                        key={cliente.id || i} 
                        cliente={cliente} 
                        index={i}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={CheckCircle}
                    title="¡Sin clientes atrasados!"
                    description="Todos los clientes están dentro del patrón de compra esperado."
                  />
                )}
              </CardBody>
            </Card>

            {/* Resumen de confiabilidad con barras de progreso */}
            <Card>
              <CardBody>
                <h4 className="font-display text-lg mb-4">Distribución de Confiabilidad</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Score promedio */}
                  <div className="md:col-span-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <CircularProgress 
                          score={predicciones?.promedioScoreConfiabilidad || 0} 
                          size={64} 
                          strokeWidth={5}
                        />
                        <div>
                          <p className="font-semibold text-slate-800">Score Promedio</p>
                          <p className="text-sm text-slate-500">De todos los clientes con predicciones</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-800">
                          {predicciones?.promedioScoreConfiabilidad || 0}
                        </p>
                        <p className="text-xs text-slate-500">/ 100</p>
                      </div>
                    </div>
                    <LinearProgress 
                      value={predicciones?.promedioScoreConfiabilidad || 0}
                      max={100}
                      color={
                        (predicciones?.promedioScoreConfiabilidad || 0) >= 85 ? '#10b981' :
                        (predicciones?.promedioScoreConfiabilidad || 0) >= 70 ? '#3b82f6' :
                        (predicciones?.promedioScoreConfiabilidad || 0) >= 50 ? '#f59e0b' : '#ef4444'
                      }
                    />
                  </div>
                  
                  {/* Breakdown por nivel */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <p className="text-3xl font-bold text-emerald-600">
                      {predicciones?.resumenConfiabilidad?.alta || 0}
                    </p>
                    <p className="text-sm text-emerald-700 font-medium">Alta</p>
                    <LinearProgress 
                      value={predicciones?.resumenConfiabilidad?.alta || 0}
                      max={predicciones?.totalConPrediccion || 1}
                      color="#10b981"
                      showValue={false}
                    />
                  </div>
                  
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                    <p className="text-3xl font-bold text-amber-600">
                      {predicciones?.resumenConfiabilidad?.media || 0}
                    </p>
                    <p className="text-sm text-amber-700 font-medium">Regular</p>
                    <LinearProgress 
                      value={predicciones?.resumenConfiabilidad?.media || 0}
                      max={predicciones?.totalConPrediccion || 1}
                      color="#f59e0b"
                      showValue={false}
                    />
                  </div>
                  
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
                    <p className="text-3xl font-bold text-red-600">
                      {predicciones?.resumenConfiabilidad?.baja || 0}
                    </p>
                    <p className="text-sm text-red-700 font-medium">Baja</p>
                    <LinearProgress 
                      value={predicciones?.resumenConfiabilidad?.baja || 0}
                      max={predicciones?.totalConPrediccion || 1}
                      color="#ef4444"
                      showValue={false}
                    />
                  </div>

                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <p className="text-3xl font-bold text-slate-600">
                      {predicciones?.totalConPrediccion || 0}
                    </p>
                    <p className="text-sm text-slate-600 font-medium">Total</p>
                    <p className="text-xs text-slate-500">clientes</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Insights */}
        {activeTab === 'insights' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                icon={AlertTriangle}
                label="Alta Prioridad"
                value={recomendaciones?.resumen?.alta || 0}
                color="accent"
              />
              <MetricCard
                icon={Clock}
                label="Media Prioridad"
                value={recomendaciones?.resumen?.media || 0}
                color="warning"
              />
              <MetricCard
                icon={CheckCircle}
                label="Baja Prioridad"
                value={recomendaciones?.resumen?.baja || 0}
                color="success"
              />
            </div>

            <div className="space-y-4">
              {recomendaciones?.recomendaciones?.map((rec, i) => (
                <Card key={i}>
                  <CardBody>
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-xl ${
                        rec.prioridad === 'alta' ? 'bg-accent/10' :
                        rec.prioridad === 'media' ? 'bg-warning/10' : 'bg-success/10'
                      }`}>
                        {rec.tipo === 'inventario' && <Package className={`w-6 h-6 ${
                          rec.prioridad === 'alta' ? 'text-accent' :
                          rec.prioridad === 'media' ? 'text-warning' : 'text-success'
                        }`} />}
                        {rec.tipo === 'rotacion' && <Zap className={`w-6 h-6 ${
                          rec.prioridad === 'alta' ? 'text-accent' :
                          rec.prioridad === 'media' ? 'text-warning' : 'text-success'
                        }`} />}
                        {rec.tipo === 'cartera' && <DollarSign className={`w-6 h-6 ${
                          rec.prioridad === 'alta' ? 'text-accent' :
                          rec.prioridad === 'media' ? 'text-warning' : 'text-success'
                        }`} />}
                        {rec.tipo === 'oportunidad' && <TrendingUp className={`w-6 h-6 ${
                          rec.prioridad === 'alta' ? 'text-accent' :
                          rec.prioridad === 'media' ? 'text-warning' : 'text-success'
                        }`} />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-display text-lg">{rec.titulo}</h4>
                          <Badge
                            variant={
                              rec.prioridad === 'alta' ? 'error' :
                              rec.prioridad === 'media' ? 'warning' : 'success'
                            }
                          >
                            {rec.prioridad}
                          </Badge>
                        </div>
                        <p className="text-muted">{rec.mensaje}</p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Qué Comprar */}
        {activeTab === 'que-comprar' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard
                icon={ShoppingCart}
                label="Tipos Analizados"
                value={queComprar?.analisis?.length || 0}
                color="primary"
              />
              <MetricCard
                icon={CheckCircle}
                label="Recomendados"
                value={queComprar?.comprar?.length || 0}
                subtext="para comprar"
                color="success"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Evitar"
                value={queComprar?.evitar?.length || 0}
                subtext="no comprar"
                color="accent"
              />
            </div>

            {/* Recomendaciones principales */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-2 border-success/30 bg-success/5">
                <CardBody>
                  <h3 className="font-display text-lg mb-4 flex items-center gap-2">
                    <CheckCircle className="w-6 h-6 text-success" />
                    <span className="text-success">💰 Comprar Más</span>
                  </h3>
                  <div className="space-y-3">
                    {queComprar?.recomendaciones?.filter(r => r.tipo === 'compra')?.map((rec, i) => (
                      <div key={i} className="p-4 bg-white rounded-xl border border-success/20">
                        <p className="font-medium">{rec.mensaje}</p>
                        {rec.detalles?.slice(0, 3).map((d, j) => (
                          <div key={j} className="mt-2 flex justify-between text-sm">
                            <span className="text-muted">{d.tipo}</span>
                            <span className="font-medium">Score: {d.score_total}%</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {(!queComprar?.recomendaciones?.filter(r => r.tipo === 'compra')?.length) && (
                      <p className="text-muted text-center py-4">No hay recomendaciones de compra aún</p>
                    )}
                  </div>
                </CardBody>
              </Card>

              <Card className="border-2 border-accent/30 bg-accent/5">
                <CardBody>
                  <h3 className="font-display text-lg mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-accent" />
                    <span className="text-accent">⚠️ Evitar Comprar</span>
                  </h3>
                  <div className="space-y-3">
                    {queComprar?.recomendaciones?.filter(r => r.tipo === 'evitar')?.map((rec, i) => (
                      <div key={i} className="p-4 bg-white rounded-xl border border-accent/20">
                        <p className="font-medium">{rec.mensaje}</p>
                        {rec.detalles?.slice(0, 3).map((d, j) => (
                          <div key={j} className="mt-2 flex justify-between text-sm">
                            <span className="text-muted">{d.tipo}</span>
                            <span className="font-medium">Score: {d.score_total}%</span>
                          </div>
                        ))}
                      </div>
                    ))}
                    {(!queComprar?.recomendaciones?.filter(r => r.tipo === 'evitar')?.length) && (
                      <p className="text-muted text-center py-4">No hay advertencias de compra</p>
                    )}
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Análisis detallado */}
            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Análisis Detallado por Tipo</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Tipo</th>
                        <th className="px-4 py-2 text-center">Disponibles</th>
                        <th className="px-4 py-2 text-center">Vendidas</th>
                        <th className="px-4 py-2 text-center">Días Inv.</th>
                        <th className="px-4 py-2 text-center">Margen %</th>
                        <th className="px-4 py-2 text-center">Score</th>
                        <th className="px-4 py-2 text-center">Recomendación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {queComprar?.analisis?.map((item, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{item.tipo}</td>
                          <td className="px-4 py-2 text-center">{item.disponibles}</td>
                          <td className="px-4 py-2 text-center">{item.unidades_vendidas || 0}</td>
                          <td className="px-4 py-2 text-center">{Math.round(item.dias_promedio)}</td>
                          <td className="px-4 py-2 text-center">{Math.round(item.margen_porcentaje)}%</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                              item.score_total >= 70 ? 'bg-success/20 text-success' :
                              item.score_total >= 40 ? 'bg-warning/20 text-warning' :
                              'bg-accent/20 text-accent'
                            }`}>
                              {item.score_total}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge
                              variant={
                                item.recomendacion === 'comprar' ? 'success' :
                                item.recomendacion === 'evitar' ? 'error' : 'default'
                              }
                            >
                              {item.recomendacion === 'comprar' ? 'Comprar' :
                               item.recomendacion === 'evitar' ? 'Evitar' : 'Mantener'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Riesgo Cartera */}
        {activeTab === 'riesgo' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={AlertTriangle}
                label="Alto Riesgo"
                value={riesgoCartera?.distribucion?.alto || 0}
                subtext="clientes"
                color="accent"
              />
              <MetricCard
                icon={Clock}
                label="Medio"
                value={riesgoCartera?.distribucion?.medio || 0}
                subtext="clientes"
                color="warning"
              />
              <MetricCard
                icon={CheckCircle}
                label="Bajo"
                value={riesgoCartera?.distribucion?.bajo || 0}
                subtext="clientes"
                color="success"
              />
              <MetricCard
                icon={DollarSign}
                label="Deuda Alto Riesgo"
                value={formatCurrency(riesgoCartera?.resumen?.deuda_alto_riesgo || 0)}
                color="accent"
              />
            </div>

            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Riesgo de Cartera - Clientes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">Cliente</th>
                        <th className="px-4 py-2 text-left">Ciudad</th>
                        <th className="px-4 py-2 text-right">Deuda</th>
                        <th className="px-4 py-2 text-center">Días Atraso</th>
                        <th className="px-4 py-2 text-center">Ratio Pago</th>
                        <th className="px-4 py-2 text-center">Score</th>
                        <th className="px-4 py-2 text-center">Nivel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {riesgoCartera?.clientes?.map((cliente, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{cliente.nombre}</td>
                          <td className="px-4 py-2 text-muted">{cliente.ciudad || '-'}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(cliente.deuda_pendiente)}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={cliente.dias_promedio_atraso > 15 ? 'text-accent font-medium' : ''}>
                              {cliente.dias_promedio_atraso}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">{cliente.ratio_pago}%</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${
                              cliente.nivel_riesgo === 'bajo' ? 'bg-success/20 text-success' :
                              cliente.nivel_riesgo === 'medio' ? 'bg-warning/20 text-warning' :
                              'bg-accent/20 text-accent'
                            }`}>
                              {cliente.score_riesgo}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Badge
                              variant={
                                cliente.nivel_riesgo === 'bajo' ? 'success' :
                                cliente.nivel_riesgo === 'medio' ? 'warning' : 'error'
                              }
                            >
                              {cliente.nivel_riesgo === 'bajo' ? 'Bajo' :
                               cliente.nivel_riesgo === 'medio' ? 'Medio' : 'Alto'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            {/* Mensajes de riesgo */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border-2 border-accent/30">
                <CardBody>
                  <h3 className="font-display text-lg mb-3 text-accent">⚠️ Clientes Alto Riesgo</h3>
                  <p className="text-sm text-muted mb-4">
                    Deuda en riesgo: {formatCurrency(riesgoCartera?.resumen?.deuda_alto_riesgo || 0)} ({riesgoCartera?.resumen?.porcentaje_riesgo}%)
                  </p>
                  <div className="space-y-2">
                    {riesgoCartera?.clientes?.filter(c => c.nivel_riesgo === 'alto')?.slice(0, 5).map((c, i) => (
                      <div key={i} className="p-3 bg-accent/5 rounded-xl">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-medium shrink-0">{c.nombre}</span>
                          <span className="font-medium text-accent text-right break-all">{formatCurrency(c.deuda_pendiente)}</span>
                        </div>
                        <p className="text-xs text-muted">{c.mensaje}</p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>

              <Card className="border-2 border-success/30">
                <CardBody>
                  <h3 className="font-display text-lg mb-3 text-success">✅ Clientes Confiables</h3>
                  <p className="text-sm text-muted mb-4">
                    Clientes con bajo riesgo de incumplimiento
                  </p>
                  <div className="space-y-2">
                    {riesgoCartera?.clientes?.filter(c => c.nivel_riesgo === 'bajo')?.slice(0, 5).map((c, i) => (
                      <div key={i} className="p-3 bg-success/5 rounded-xl">
                        <div className="flex justify-between">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="font-medium text-success">{formatCurrency(c.deuda_pendiente)}</span>
                        </div>
                        <p className="text-xs text-muted">{c.mensaje}</p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        )}

        {/* Flujo de Caja */}
        {activeTab === 'flujo-caja' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={DollarSign}
                label="Deuda Total"
                value={formatCurrency(flujoCaja?.resumen?.deuda_total_pendiente || 0)}
                color="primary"
              />
              <MetricCard
                icon={TrendingUp}
                label="Entrada Estimada"
                value={formatCurrency(flujoCaja?.resumen?.entrada_total_estimada || 0)}
                color="success"
              />
              <MetricCard
                icon={BarChart3}
                label="Promedio Semanal"
                value={formatCurrency(flujoCaja?.resumen?.promedio_semanal_historico || 0)}
                color="info"
              />
              <MetricCard
                icon={Target}
                label="vs Promedio"
                value={`${flujoCaja?.comparativo?.vs_promedio || 0}%`}
                subtext={flujoCaja?.comparativo?.vs_promedio >= 0 ? 'arriba' : 'abajo'}
                color={flujoCaja?.comparativo?.vs_promedio >= 0 ? 'success' : 'accent'}
              />
            </div>

            {/* Proyección semanal */}
            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">📅 Proyección de Entradas por Semana</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {flujoCaja?.flujos_por_semana?.map((semana, i) => (
                    <div key={i} className={`p-4 rounded-xl border ${
                      semana.entrada_estimada > 0 ? 'bg-success/5 border-success/30' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium">Semana {semana.semana}</span>
                        <span className="text-xs text-muted">
                          {new Date(semana.fecha_inicio).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className={`text-2xl font-display font-bold break-all ${
                        semana.entrada_estimada > 0 ? 'text-success' : 'text-muted'
                      }`}>
                        {formatCurrency(semana.entrada_estimada)}
                      </p>
                      <p className="text-xs text-muted mt-1">
                        {semana.clientes?.length || 0} cliente(s)
                      </p>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>

            {/* Alertas */}
            {flujoCaja?.alertas?.length > 0 && (
              <Card>
                <CardBody>
                  <h3 className="font-display text-lg mb-4">🔔 Alertas y Observaciones</h3>
                  <div className="space-y-3">
                    {flujoCaja.alertas.map((alerta, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-xl ${
                        alerta.tipo === 'advertencia' ? 'bg-warning/10 border border-warning/30' : 'bg-info/10 border border-info/30'
                      }`}>
                        {alerta.tipo === 'advertencia' ? (
                          <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                        ) : (
                          <TrendingUp className="w-5 h-5 text-info flex-shrink-0" />
                        )}
                        <p className="text-sm">{alerta.mensaje}</p>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Detalle de clientes por semana */}
            <Card>
              <CardBody>
                <h3 className="font-display text-lg mb-4">Detalle de Pagos Esperados</h3>
                <div className="space-y-4">
                  {flujoCaja?.flujos_por_semana?.map((semana, i) => (
                    <div key={i}>
                      <h4 className="font-medium text-sm text-muted mb-2">
                        Semana {semana.semana} ({semana.fecha_inicio} - {semana.fecha_fin})
                      </h4>
                      {semana.clientes?.length > 0 ? (
                        <div className="space-y-2 ml-4">
                          {semana.clientes.map((cliente, j) => (
                            <div key={j} className="flex justify-between p-2 bg-gray-50 rounded-lg text-sm">
                              <span>{cliente.nombre}</span>
                              <span className="font-medium">{formatCurrency(cliente.monto)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted ml-4">Sin pagos estimados</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
