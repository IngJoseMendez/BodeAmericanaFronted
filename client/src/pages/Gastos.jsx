import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm } from '../components/common';
import { gastosApi, cuentasApi } from '../services/api';
import ExcelJS from 'exceljs';
import { Coins, Plus, Trash2, Download } from 'lucide-react';

const CATEGORIAS_FIJAS = [
  { value: 'arriendo',   label: 'Arriendo' },
  { value: 'servicios',  label: 'Servicios' },
  { value: 'salarios',   label: 'Salarios' },
  { value: 'transporte', label: 'Transporte' },
  { value: 'soporte',    label: 'Soporte' },
  { value: 'caja_menor', label: 'Caja menor' },
];

const hoy = () => new Date().toISOString().split('T')[0];
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-CO');
const labelCategoria = (v) => CATEGORIAS_FIJAS.find(c => c.value === v)?.label || (v || 'Otro');

export default function Gastos() {
  const [gastos, setGastos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ categoria: '', concepto: '', monto: '', fecha: hoy(), metodo_pago: '', cuenta_id: '', es_fijo: false });
  const [filtroMes, setFiltroMes] = useState('');          // 'YYYY-MM'
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const { addToast } = useToast();
  const confirm = useConfirm();

  const load = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroMes) { const [a, m] = filtroMes.split('-'); params.anio = a; params.mes = m; }
      if (filtroCategoria) params.categoria = filtroCategoria;
      const [g, c] = await Promise.all([
        gastosApi.getAll(params),
        cuentasApi.getAll().catch(() => []),
      ]);
      setGastos(g);
      setCuentas(c);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filtroMes, filtroCategoria]);

  const pickFija = (cat) => setForm(f => ({ ...f, categoria: cat.value, concepto: f.concepto || cat.label, es_fijo: true }));

  const agregar = async () => {
    const monto = parseFloat(String(form.monto).replace(/[^0-9.-]/g, ''));
    if (!monto || monto <= 0) { addToast('Escribe un valor', 'error'); return; }
    try {
      await gastosApi.create({
        categoria: form.categoria || 'otro',
        concepto: form.concepto || null,
        monto,
        fecha: form.fecha || hoy(),
        metodo_pago: form.metodo_pago || null,
        cuenta_id: form.cuenta_id ? parseInt(form.cuenta_id) : null,
        es_fijo: !!form.es_fijo,
      });
      addToast('Gasto agregado', 'success');
      setForm(f => ({ ...f, concepto: '', monto: '', categoria: '', es_fijo: false }));
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const eliminar = async (g) => {
    const ok = await confirm({ title: '¿Eliminar gasto?', message: `Se eliminará ${fmt(g.monto)} (${g.concepto || labelCategoria(g.categoria)}).`, confirmText: 'Eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await gastosApi.delete(g.id);
      addToast('Gasto eliminado', 'success');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const total = useMemo(() => gastos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0), [gastos]);
  const totalFijos = useMemo(() => gastos.filter(g => g.es_fijo).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0), [gastos]);
  const totalVariables = total - totalFijos;
  const porCategoria = useMemo(() => {
    const map = {};
    for (const g of gastos) { const k = g.categoria || 'otro'; map[k] = (map[k] || 0) + (parseFloat(g.monto) || 0); }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [gastos]);

  const exportar = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Gastos');
      ws.columns = [
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Categoría', key: 'categoria', width: 16 },
        { header: 'Concepto', key: 'concepto', width: 30 },
        { header: 'Fijo', key: 'es_fijo', width: 8 },
        { header: 'Método', key: 'metodo_pago', width: 14 },
        { header: 'Monto', key: 'monto', width: 16, style: { numFmt: '$#,##0' } },
      ];
      ws.getRow(1).font = { bold: true };
      gastos.forEach(g => ws.addRow({
        fecha: g.fecha ? String(g.fecha).slice(0, 10) : '',
        categoria: labelCategoria(g.categoria),
        concepto: g.concepto || '',
        es_fijo: g.es_fijo ? 'Sí' : 'No',
        metodo_pago: g.metodo_pago || '',
        monto: parseFloat(g.monto) || 0,
      }));
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Gastos_${hoy()}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };

  const selectCls = 'w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-secondary/30';

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-primary flex items-center gap-2">
              <Coins className="w-6 h-6" /> Gastos
            </h1>
            <p className="text-sm text-muted">Seguimiento de gastos de la empresa (fijos y libres)</p>
          </div>
          <Button variant="secondary" onClick={exportar}><Download size={16} /> Exportar</Button>
        </div>

        {/* Captura rápida */}
        <Card>
          <CardBody>
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Agregar gasto</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CATEGORIAS_FIJAS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => pickFija(c)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${form.categoria === c.value ? 'bg-secondary text-on-primary border-secondary' : 'border-border text-muted hover:text-primary hover:border-secondary/40'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input
                label="Concepto"
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                placeholder="Ej: Arriendo junio / Pago Pedro"
              />
              <Input
                label="Valor"
                type="text"
                inputMode="decimal"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                placeholder="0"
              />
              <Input
                label="Fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              />
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Método (opcional)</label>
                <select value={form.metodo_pago} onChange={(e) => setForm({ ...form, metodo_pago: e.target.value })} className={selectCls}>
                  <option value="">—</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Cuenta (opcional)</label>
                <select value={form.cuenta_id} onChange={(e) => setForm({ ...form, cuenta_id: e.target.value })} className={selectCls}>
                  <option value="">—</option>
                  {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm text-muted select-none cursor-pointer">
                  <input type="checkbox" checked={form.es_fijo} onChange={(e) => setForm({ ...form, es_fijo: e.target.checked })} />
                  Gasto fijo
                </label>
                <Button onClick={agregar} className="ml-auto"><Plus size={16} /> Agregar</Button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Totales */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Total</p><p className="text-2xl font-display text-primary">{fmt(total)}</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Fijos</p><p className="text-2xl font-display text-primary">{fmt(totalFijos)}</p></CardBody></Card>
          <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Variables</p><p className="text-2xl font-display text-primary">{fmt(totalVariables)}</p></CardBody></Card>
        </div>

        {porCategoria.length > 0 && (
          <Card>
            <CardBody>
              <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Por categoría</p>
              <div className="flex flex-wrap gap-2">
                {porCategoria.map(([cat, val]) => (
                  <span key={cat} className="px-3 py-1.5 rounded-xl bg-primary/5 text-sm">
                    <span className="text-muted">{labelCategoria(cat)}: </span>
                    <span className="font-semibold text-primary">{fmt(val)}</span>
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Filtros + lista */}
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Mes</label>
                <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={selectCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Categoría</label>
                <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} className={selectCls}>
                  <option value="">Todas</option>
                  {CATEGORIAS_FIJAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  <option value="otro">Otro</option>
                </select>
              </div>
              {(filtroMes || filtroCategoria) && (
                <Button variant="ghost" onClick={() => { setFiltroMes(''); setFiltroCategoria(''); }}>Limpiar</Button>
              )}
            </div>

            {loading ? (
              <p className="text-center text-muted py-8">Cargando...</p>
            ) : gastos.length === 0 ? (
              <p className="text-center text-muted py-8">Sin gastos registrados</p>
            ) : (
              <div className="space-y-2">
                {gastos.map(g => (
                  <div key={g.id} className="flex items-center justify-between p-3 rounded-xl border border-border">
                    <div className="min-w-0">
                      <span className="font-medium text-primary">{g.concepto || labelCategoria(g.categoria)}</span>
                      <span className="ml-2 text-xs uppercase text-muted">{labelCategoria(g.categoria)}</span>
                      {g.es_fijo && <span className="ml-2 text-[10px] font-bold text-secondary uppercase">fijo</span>}
                      <span className="block text-xs text-muted">{g.fecha ? String(g.fecha).slice(0, 10) : ''}{g.metodo_pago ? ` · ${g.metodo_pago}` : ''}{g.cuenta_nombre ? ` · ${g.cuenta_nombre}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-primary tabular-nums">{fmt(g.monto)}</span>
                      <button onClick={() => eliminar(g)} className="p-2 text-muted hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
