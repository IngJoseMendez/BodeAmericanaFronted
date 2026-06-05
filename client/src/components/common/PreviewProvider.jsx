import { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Modal } from './Modal';
import { cotizacionesApi, contenedoresApi, carteraApi, despachosApi, cuentasApi } from '../../services/api';

const PreviewContext = createContext(null);
export function usePreview() { return useContext(PreviewContext); }

// Mapea la ruta destino al tipo de entidad para saber qué API consultar.
const TYPE_BY_ROUTE = {
  '/cotizaciones': 'cotizacion',
  '/contenedores': 'contenedor',
  '/cartera':      'cartera',
  '/despachos':    'despacho',
  '/cuentas':      'cuenta',
};

const TITLES = {
  cotizacion: 'Cotización', contenedor: 'Contenedor',
  cartera: 'Cartera del cliente', despacho: 'Despacho', cuenta: 'Cuenta',
};

const fmt = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const fdate = (d) => d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted shrink-0">{label}</span>
      <span className="text-sm font-medium text-primary text-right break-words">{value}</span>
    </div>
  );
}

function EstadoChip({ children }) {
  return <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary capitalize">{children}</span>;
}

function PreviewBody({ type, id }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true); setErr(false); setData(null);
    const fetcher = {
      cotizacion: () => cotizacionesApi.getOne(id),
      contenedor: () => contenedoresApi.getOne(id),
      cartera:    () => carteraApi.getOne(id),
      despacho:   () => despachosApi.getOne(id),
      cuenta:     () => cuentasApi.getAll({ todas: 'true' }).then(list => (list || []).find(c => String(c.id) === String(id))),
    }[type];
    if (!fetcher) { setLoading(false); setErr(true); return; }
    fetcher()
      .then(d => { if (!cancel) { if (d) setData(d); else setErr(true); setLoading(false); } })
      .catch(() => { if (!cancel) { setErr(true); setLoading(false); } });
    return () => { cancel = true; };
  }, [type, id]);

  if (loading) return <p className="text-center text-muted py-6 text-sm">Cargando vista previa…</p>;
  if (err || !data) return <p className="text-center text-muted py-6 text-sm">No se pudo cargar la vista previa.</p>;

  if (type === 'cotizacion') return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg font-display font-bold text-primary">{data.numero}</span>
        <EstadoChip>{data.estado}</EstadoChip>
      </div>
      <Row label="Cliente" value={data.cliente_nombre || '—'} />
      <Row label="Total" value={fmt(data.total)} />
      <Row label="Ítems" value={data.detalles?.length ?? 0} />
      {data.descuento > 0 && <Row label="Descuento" value={fmt(data.descuento)} />}
      {data.despachos?.length > 0 && <Row label="Despacho(s)" value={data.despachos.map(d => d.numero).join(', ')} />}
      <Row label="Creada" value={fdate(data.created_at)} />
    </div>
  );

  if (type === 'contenedor') {
    const provs = (data.proveedores_mercancia || []).map(p => p.proveedor_nombre).filter(Boolean);
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg font-display font-bold text-primary">{data.numero}</span>
          <EstadoChip>{data.estado}</EstadoChip>
        </div>
        <Row label="Unidades" value={data.total_pacas} />
        <Row label="Costo total" value={fmt(data.costo_total)} />
        <Row label="Salida → Llegada" value={`${fdate(data.fecha_salida)} → ${fdate(data.fecha_llegada)}`} />
        {provs.length > 0 && <Row label="Proveedores" value={provs.slice(0, 3).join(', ')} />}
      </div>
    );
  }

  if (type === 'cartera') {
    const c = data.cliente || {};
    return (
      <div>
        <div className="mb-2"><span className="text-lg font-display font-bold text-primary">{c.nombre}</span></div>
        <Row label="Saldo pendiente" value={<span className="text-accent font-bold">{fmt(data.saldo_pendiente)}</span>} />
        <Row label="Total vendido" value={fmt(data.total_vendido)} />
        <Row label="Total abonado" value={fmt(data.total_abonado)} />
        <Row label="Ciudad" value={c.ciudad || '—'} />
      </div>
    );
  }

  if (type === 'despacho') return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg font-display font-bold text-primary">{data.numero}</span>
        <EstadoChip>{data.estado}</EstadoChip>
      </div>
      <Row label="Cliente" value={data.cliente_nombre || '—'} />
      {data.cotizacion_numero && <Row label="Cotización" value={data.cotizacion_numero} />}
      {data.tipo_transporte && <Row label="Transporte" value={data.tipo_transporte} />}
      <Row label="Fecha salida" value={fdate(data.fecha_salida)} />
      <Row label="Ítems" value={data.items?.length ?? 0} />
    </div>
  );

  if (type === 'cuenta') return (
    <div>
      <div className="mb-2"><span className="text-lg font-display font-bold text-primary">{data.nombre}</span></div>
      <Row label="Tipo" value={<span className="capitalize">{data.tipo}</span>} />
      <Row label="Estado" value={data.activo ? 'Activa' : 'Inactiva'} />
    </div>
  );

  return null;
}

export function PreviewProvider({ children }) {
  const [state, setState] = useState(null); // { to, id, param, type }
  const navigate = useNavigate();

  const openPreview = ({ to, id, param = 'focus' }) => {
    const type = TYPE_BY_ROUTE[to];
    if (!type) { navigate(`${to}?${param}=${id}`); return; } // sin tipo conocido → navega directo
    setState({ to, id, param, type });
  };
  const close = () => setState(null);
  const ir = () => {
    if (!state) return;
    const { to, param, id } = state;
    setState(null);
    navigate(`${to}?${param}=${id}`);
  };

  return (
    <PreviewContext.Provider value={{ openPreview }}>
      {children}
      <Modal isOpen={!!state} onClose={close} title={state ? `Vista previa · ${TITLES[state.type] || ''}` : ''} size="sm">
        {state && (
          <div className="space-y-4">
            <PreviewBody type={state.type} id={state.id} />
            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <button onClick={close}
                className="px-4 py-2 rounded-xl border border-border text-muted hover:text-primary hover:bg-primary/5 text-sm font-medium transition-colors">
                Cerrar
              </button>
              <button onClick={ir}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-secondary/85 transition-colors">
                Ir <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PreviewContext.Provider>
  );
}
