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

// Monedas frecuentes para una bodega que importa (China/USA/Europa). COP es la base.
const MONEDAS = [
  { value: 'COP', label: 'COP — Peso colombiano' },
  { value: 'USD', label: 'USD — Dólar (EE.UU.)' },
  { value: 'CNY', label: 'CNY — Yuan (China)' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'PEN', label: 'PEN — Sol (Perú)' },
  { value: 'OTRA', label: 'Otra…' },
];

const hoy = () => new Date().toISOString().split('T')[0];
const fmt = (n) => '$' + (parseFloat(n) || 0).toLocaleString('es-CO');
const labelCategoria = (v) => CATEGORIAS_FIJAS.find(c => c.value === v)?.label || (v || 'Otro');
const esMonedaCOP = (m) => !m || String(m).toUpperCase() === 'COP';
// Convierte texto del usuario a número respetando el formato es-CO (punto = miles, coma = decimal).
// Ej: "4.000" -> 4000, "1.234,50" -> 1234.5, "4000" -> 4000.
const numLimpio = (v) => {
  let s = String(v ?? '').trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Ambos separadores: el último es el decimal real.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');                              // coma decimal
  } else if (lastDot > -1) {
    // Solo puntos: si parecen separador de miles (1.234 / 4.000 / 1.234.567) se quitan.
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }
  return parseFloat(s) || 0;
};
// Valor del gasto expresado en COP. Usa monto_cop del backend; si falta, convierte con la tasa.
const montoCOP = (g) => {
  const c = parseFloat(g.monto_cop);
  if (!isNaN(c) && c) return c;
  return (parseFloat(g.monto) || 0) * (parseFloat(g.tasa_cambio) || 1);
};
const fmtMoneda = (n, mon) => (mon && mon !== 'COP' ? mon + ' ' : '$') + (parseFloat(n) || 0).toLocaleString('es-CO');

export default function Gastos() {
  const [gastos, setGastos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ categoria: '', concepto: '', monto: '', fecha: hoy(), metodo_pago: '', cuenta_id: '', es_fijo: false, moneda: 'COP', monedaOtra: '', tasa_cambio: '' });
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
    const monto = numLimpio(form.monto);
    if (!monto || monto <= 0) { addToast('Escribe un valor', 'error'); return; }
    // Moneda: si eligió "Otra…" toma el código escrito. Vacío en "Otra…" es un error explícito
    // (no se asume COP en silencio); en cualquier otro caso vacío sí cae a COP.
    let moneda = form.moneda === 'OTRA' ? (form.monedaOtra || '').trim().toUpperCase() : form.moneda;
    if (form.moneda === 'OTRA' && !moneda) {
      addToast('Escribe el código de la moneda (ej: BRL, GBP) o elige COP', 'error');
      return;
    }
    if (!moneda) moneda = 'COP';
    const esCOP = esMonedaCOP(moneda);
    const tasa = esCOP ? 1 : numLimpio(form.tasa_cambio);
    if (!esCOP && (!tasa || tasa <= 0)) {
      addToast(`Escribe la tasa: a cuántos pesos (COP) equivale 1 ${moneda}`, 'error');
      return;
    }
    try {
      await gastosApi.create({
        categoria: form.categoria || 'otro',
        concepto: form.concepto || null,
        monto,
        moneda,
        tasa_cambio: tasa,
        fecha: form.fecha || hoy(),
        metodo_pago: form.metodo_pago || null,
        cuenta_id: form.cuenta_id ? parseInt(form.cuenta_id) : null,
        es_fijo: !!form.es_fijo,
      });
      addToast('Gasto agregado', 'success');
      // Vuelve a la base COP en cada captura para no heredar la moneda extranjera anterior.
      setForm(f => ({ ...f, concepto: '', monto: '', categoria: '', es_fijo: false, moneda: 'COP', monedaOtra: '', tasa_cambio: '' }));
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const eliminar = async (g) => {
    const ok = await confirm({ title: '¿Eliminar gasto?', message: `Se eliminará ${fmt(montoCOP(g))} (${g.concepto || labelCategoria(g.categoria)}).`, confirmText: 'Eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await gastosApi.delete(g.id);
      addToast('Gasto eliminado', 'success');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Todos los totales se calculan en COP (monto convertido) para poder comparar entre monedas.
  const total = useMemo(() => gastos.reduce((s, g) => s + montoCOP(g), 0), [gastos]);
  const totalFijos = useMemo(() => gastos.filter(g => g.es_fijo).reduce((s, g) => s + montoCOP(g), 0), [gastos]);
  const totalVariables = total - totalFijos;
  const porCategoria = useMemo(() => {
    const map = {};
    for (const g of gastos) { const k = g.categoria || 'otro'; map[k] = (map[k] || 0) + montoCOP(g); }
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
        { header: 'Moneda', key: 'moneda', width: 10 },
        { header: 'Monto (original)', key: 'monto', width: 16, style: { numFmt: '#,##0.00' } },
        { header: 'Tasa a COP', key: 'tasa_cambio', width: 14, style: { numFmt: '#,##0.0000' } },
        { header: 'Monto COP', key: 'monto_cop', width: 18, style: { numFmt: '$#,##0' } },
      ];
      ws.getRow(1).font = { bold: true };
      gastos.forEach(g => ws.addRow({
        fecha: g.fecha ? String(g.fecha).slice(0, 10) : '',
        categoria: labelCategoria(g.categoria),
        concepto: g.concepto || '',
        es_fijo: g.es_fijo ? 'Sí' : 'No',
        metodo_pago: g.metodo_pago || '',
        moneda: g.moneda || 'COP',
        monto: parseFloat(g.monto) || 0,
        tasa_cambio: parseFloat(g.tasa_cambio) || 1,
        monto_cop: montoCOP(g),
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

  // Moneda seleccionada (resuelve "Otra…") y conversión en vivo para previsualizar el COP.
  const monedaActual = form.moneda === 'OTRA' ? (form.monedaOtra || '').trim().toUpperCase() : form.moneda;
  const formEsCOP = esMonedaCOP(monedaActual);
  const previewCOP = formEsCOP ? numLimpio(form.monto) : numLimpio(form.monto) * numLimpio(form.tasa_cambio);

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
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Moneda</label>
                <select
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value, tasa_cambio: e.target.value === 'COP' ? '' : form.tasa_cambio })}
                  className={selectCls}
                >
                  {MONEDAS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {form.moneda === 'OTRA' && (
                  <input
                    type="text"
                    value={form.monedaOtra}
                    onChange={(e) => setForm({ ...form, monedaOtra: e.target.value.toUpperCase() })}
                    placeholder="Código (ej: BRL, GBP)"
                    maxLength={8}
                    className={selectCls + ' mt-2 uppercase'}
                  />
                )}
              </div>
              {!formEsCOP && (
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">
                    Tasa a COP <span className="text-muted font-normal">(1 {monedaActual || '?'} = ? COP)</span>
                  </label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={form.tasa_cambio}
                    onChange={(e) => setForm({ ...form, tasa_cambio: e.target.value })}
                    placeholder="Ej: 4000"
                  />
                  <p className="text-xs text-muted mt-1">
                    {previewCOP > 0
                      ? <>≈ <span className="font-semibold text-primary">{fmt(previewCOP)}</span> COP</>
                      : 'Escribe la tasa para ver el equivalente en COP'}
                  </p>
                </div>
              )}
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
          <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Total (COP)</p><p className="text-2xl font-display text-primary">{fmt(total)}</p></CardBody></Card>
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
                      <div className="text-right">
                        <span className="font-semibold text-primary tabular-nums">{fmt(montoCOP(g))}</span>
                        {g.moneda && g.moneda !== 'COP' && (
                          <span className="block text-[11px] text-muted tabular-nums">
                            {fmtMoneda(g.monto, g.moneda)} · tasa {Number(g.tasa_cambio || 1).toLocaleString('es-CO')}
                          </span>
                        )}
                      </div>
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
