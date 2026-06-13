import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm } from '../components/common';
import { clientesApi, carteraApi } from '../services/api';
import { ListChecks, Search, Save } from 'lucide-react';

const hoy = () => new Date().toISOString().split('T')[0];
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-CO');
const CHUNK = 100; // el server limita el body a 10kb; enviamos por lotes

export default function DeudaMasiva() {
  const [clientes, setClientes] = useState([]);
  const [saldos, setSaldos] = useState({});   // cliente_id -> saldo_pendiente
  const [montos, setMontos] = useState({});   // cliente_id -> string
  const [fechaCorte, setFechaCorte] = useState(hoy());
  const [buscar, setBuscar] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const load = async () => {
    try {
      setLoading(true);
      const [cls, cartera] = await Promise.all([
        clientesApi.getAll({ estado: 'activo' }),
        carteraApi.getAll().catch(() => []),
      ]);
      setClientes(cls);
      const map = {};
      for (const row of cartera) map[row.id] = parseFloat(row.saldo_pendiente) || 0;
      setSaldos(map);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c => c.nombre?.toLowerCase().includes(q));
  }, [clientes, buscar]);

  const setMonto = (id, val) => setMontos(prev => ({ ...prev, [id]: val }));

  const registros = useMemo(() => {
    const out = [];
    for (const c of clientes) {
      const v = parseFloat(String(montos[c.id] ?? '').replace(/[^0-9.-]/g, ''));
      if (v && v > 0) out.push({ cliente_id: c.id, tipo: 'venta', fecha: fechaCorte, monto: v, referencia: 'CARGA_MASIVA' });
    }
    return out;
  }, [clientes, montos, fechaCorte]);

  const guardar = async () => {
    if (!registros.length) { addToast('Escribe al menos una deuda', 'error'); return; }
    const ok = await confirm({
      title: '¿Registrar deuda masiva?',
      message: `Se registrará la deuda de ${registros.length} cliente(s) con fecha de corte ${fechaCorte}.`,
      confirmText: 'Registrar',
    });
    if (!ok) return;
    try {
      setSaving(true);
      let insertados = 0; let errores = 0;
      for (let i = 0; i < registros.length; i += CHUNK) {
        const lote = registros.slice(i, i + CHUNK);
        const r = await carteraApi.importarLegacy(lote);
        insertados += (r?.insertados ?? lote.length);
        errores += (r?.errores?.length ?? 0);
      }
      addToast(`${insertados} deuda(s) registrada(s)${errores ? `, ${errores} con error` : ''}`, errores ? 'warning' : 'success');
      setMontos({});
      load();
    } catch (err) {
      addToast('Error al guardar: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-primary flex items-center gap-2">
              <ListChecks className="w-6 h-6" /> Deuda masiva
            </h1>
            <p className="text-sm text-muted">Registra de una vez lo que cada cliente debe a una fecha de corte</p>
          </div>
          <Button onClick={guardar} disabled={saving || registros.length === 0}>
            <Save size={16} /> {saving ? 'Guardando…' : `Guardar todo${registros.length ? ` (${registros.length})` : ''}`}
          </Button>
        </div>

        <Card>
          <CardBody>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Fecha de corte</label>
                <Input type="date" value={fechaCorte} onChange={(e) => setFechaCorte(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-primary mb-1">Buscar cliente</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Nombre…"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <p className="text-center text-muted py-8">Cargando…</p>
            ) : filtrados.length === 0 ? (
              <p className="text-center text-muted py-8">Sin clientes</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="py-2 pr-3 font-medium">Cliente</th>
                      <th className="py-2 px-3 font-medium text-right">Saldo actual</th>
                      <th className="py-2 pl-3 font-medium text-right w-48">Deuda a registrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map(c => (
                      <tr key={c.id} className="border-b border-border/60">
                        <td className="py-2 pr-3 text-primary">{c.nombre}</td>
                        <td className="py-2 px-3 text-right text-muted tabular-nums">{fmt(saldos[c.id] || 0)}</td>
                        <td className="py-2 pl-3 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={montos[c.id] ?? ''}
                            onChange={(e) => setMonto(c.id, e.target.value)}
                            placeholder="0"
                            className="w-40 px-3 py-1.5 rounded-lg border border-border bg-surface text-primary text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
