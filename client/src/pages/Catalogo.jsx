import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Badge, useToast } from '../components/common';
import { catalogoApi, pedidosApi } from '../services/api';
import { PACA_TIPOS, PACA_CATEGORIAS } from '../types';
import { ShoppingCart, Package, Filter, Check } from 'lucide-react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function Catalogo() {
  const [pacas, setPacas] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [buscar, setBuscar] = useState('');
  const { addToast } = useToast();

  const debouncedBuscar = useDebounce(buscar, 300);

  useEffect(() => {
    loadCatalogo();
  }, [filtroTipo, filtroCategoria, debouncedBuscar]);

  const loadCatalogo = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroTipo) params.tipo = filtroTipo;
      if (filtroCategoria) params.categoria = filtroCategoria;
      if (debouncedBuscar) params.buscar = debouncedBuscar;

      const [data, resumenData] = await Promise.all([
        catalogoApi.getAll(params),
        catalogoApi.getResumen()
      ]);

      setPacas(data.data || []);
      setResumen(resumenData || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSeleccion = (paca) => {
    if (seleccionadas.find(s => s.id === paca.id)) {
      setSeleccionadas(seleccionadas.filter(s => s.id !== paca.id));
    } else {
      setSeleccionadas([...seleccionadas, { id: paca.id, precio_venta: parseFloat(paca.precio_venta) }]);
    }
  };

  const crearPedido = async () => {
    if (seleccionadas.length === 0) {
      addToast('Selecciona al menos una paca', 'warning');
      return;
    }

    try {
      await pedidosApi.create({ pacas: seleccionadas });
      addToast('Pedido creado exitosamente', 'success');
      setSeleccionadas([]);
      loadCatalogo();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  };

  const totalSeleccionadas = seleccionadas.reduce((sum, s) => sum + s.precio_venta, 0);

  return (
    <Layout title="Catálogo" subtitle="Pacas disponibles">
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resumen.map((r, i) => (
            <Card key={i} hover className="cursor-pointer" onClick={() => setFiltroTipo(r.clasificacion)}>
              <CardBody className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-secondary" />
                  <span className="font-medium text-sm">{r.clasificacion}</span>
                </div>
                <p className="text-2xl font-bold text-primary">{r.cantidad}</p>
                <p className="text-xs text-muted">{formatCurrency(r.precio_min)} - {formatCurrency(r.precio_max)}</p>
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar..."
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todos los tipos</option>
              {PACA_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todas las categorías</option>
              {PACA_CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {seleccionadas.length > 0 && (
          <Card className="sticky bottom-4 border-secondary">
            <CardBody className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted">Pacas seleccionadas</p>
                <p className="text-2xl font-bold text-primary">{seleccionadas.length}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Total estimado</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(totalSeleccionadas)}</p>
              </div>
              <Button onClick={crearPedido} variant="secondary">
                <ShoppingCart size={18} /> Crear Pedido
              </Button>
            </CardBody>
          </Card>
        )}

        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary/3 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">UUID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Peso</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Precio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                ) : pacas.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No hay pacas disponibles</td></tr>
                ) : (
                  pacas.map((paca) => {
                    const selected = seleccionadas.find(s => s.id === paca.id);
                    return (
                      <tr key={paca.id} className={`hover:bg-primary/3 transition-colors ${selected ? 'bg-success/10' : ''}`}>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleSeleccion(paca)}
                            className={`p-2 rounded-lg transition-all ${selected ? 'bg-success text-on-primary' : 'bg-primary/5 text-muted hover:bg-success/20'}`}
                          >
                            <Check size={16} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted font-mono">{paca.uuid?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-primary">{paca.clasificacion}</td>
                        <td className="px-4 py-3 text-sm text-muted">{paca.referencia}</td>
                        <td className="px-4 py-3 text-sm text-muted">{paca.peso} kg</td>
                        <td className="px-4 py-3 text-sm font-medium text-primary">{formatCurrency(paca.precio_venta)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}