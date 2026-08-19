import { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm } from '../components/common';
import { clientesApi, carteraApi } from '../services/api';
import { ListChecks, Search, Save } from 'lucide-react';
import { parseMonto, formatCOP } from '../lib/money';
import { hoy } from '../lib/fecha';
const fmt = formatCOP;
const CHUNK = 100; // el server limita el body a 10kb; enviamos por lotes

// Fila aislada y memoizada. La tabla no tiene paginación (puede traer cientos de
// clientes) y todos los importes viven en un mismo objeto de estado: sin memo,
// cada tecla en una fila obligaba a React a repintar TODAS las demás. Recibe
// solo valores sueltos (no el objeto `montos`) para que memo pueda comparar.
const FilaCliente = memo(function FilaCliente({ cliente, saldo, valor, onChange }) {
  return (
    <tr className="border-b border-border/60">
      <td className="py-2 pr-3 text-primary">{cliente.nombre}</td>
      <td className="py-2 px-3 text-right text-muted tabular-nums">{fmt(saldo)}</td>
      <td className="py-2 pl-3 text-right">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onChange(cliente.id, e.target.value)}
          placeholder="0"
          className="w-40 px-3 py-1.5 rounded-lg border border-border bg-surface text-primary text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
        />
      </td>
    </tr>
  );
});

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

  // Estable entre renders: es lo que permite que FilaCliente no se repinte.
  const setMonto = useCallback((id, val) => {
    setMontos(prev => ({ ...prev, [id]: val }));
  }, []);

  // Se recorren los montos escritos (unos pocos) y no la lista completa de
  // clientes: con cientos de filas, teclear un dígito revisaba a todos.
  const idsValidos = useMemo(() => new Set(clientes.map(c => String(c.id))), [clientes]);

  const registros = useMemo(() => {
    const out = [];
    for (const [id, val] of Object.entries(montos)) {
      if (!idsValidos.has(id)) continue;
      const v = parseMonto(val);
      if (v && v > 0) out.push({ cliente_id: Number(id), tipo: 'venta', fecha: fechaCorte, monto: v, referencia: 'CARGA_MASIVA' });
    }
    return out;
  }, [idsValidos, montos, fechaCorte]);

  const guardar = async () => {
    if (!registros.length) { addToast('Escribe al menos una deuda', 'error'); return; }
    const ok = await confirm({
      title: '¿Registrar deuda masiva?',
      message: `Se registrará la deuda de ${registros.length} cliente(s) por un total de ${fmt(registros.reduce((s, r) => s + r.monto, 0))}, con fecha de corte ${fechaCorte}.`,
      confirmText: 'Registrar',
    });
    if (!ok) return;
    setSaving(true);
    let insertados = 0; let errores = 0; let fallo = null;
    // Cada lote es una transacción del servidor: el que falla se revierte
    // entero, pero los anteriores YA quedaron guardados. Se apunta cuáles
    // entraron para no volver a mandarlos y duplicar la deuda al reintentar.
    const guardados = new Set();
    for (let i = 0; i < registros.length; i += CHUNK) {
      const lote = registros.slice(i, i + CHUNK);
      try {
        const r = await carteraApi.importarLegacy(lote);
        insertados += (r?.insertados ?? lote.length);
        errores += (r?.errores?.length ?? 0);
        lote.forEach(x => guardados.add(String(x.cliente_id)));
      } catch (err) {
        fallo = err;
        break;
      }
    }

    // Se limpian del formulario SOLO los que sí entraron; los pendientes se
    // quedan escritos para poder reintentar únicamente esos.
    if (guardados.size) {
      setMontos(prev => {
        const next = { ...prev };
        guardados.forEach(id => { delete next[id]; });
        return next;
      });
    }

    if (fallo) {
      const pendientes = registros.length - guardados.size;
      addToast(
        `Se guardaron ${insertados} de ${registros.length}. Quedan ${pendientes} sin registrar, ` +
        `y siguen escritos en la tabla para reintentarlos (${fallo.message})`,
        'error'
      );
    } else {
      addToast(`${insertados} deuda(s) registrada(s)${errores ? `, ${errores} con error` : ''}`, errores ? 'warning' : 'success');
    }
    load();
    setSaving(false);
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
                      <FilaCliente
                        key={c.id}
                        cliente={c}
                        saldo={saldos[c.id] || 0}
                        valor={montos[c.id] ?? ''}
                        onChange={setMonto}
                      />
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
