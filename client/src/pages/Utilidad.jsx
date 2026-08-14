import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, TableSkeleton, EmptyState } from '../components/common';
import { dashboardApi, gastosApi } from '../services/api';
import ExcelJS from 'exceljs';
import { TrendingUp, TrendingDown, Download, Coins, Package, Receipt } from 'lucide-react';
import { formatCOP } from '../lib/money';
import { Inversionistas } from '../components/Inversionistas';

// La utilidad BRUTA es venta − costo de la mercancía. La NETA descuenta además
// los gastos de operación del período, que es la plata que realmente queda.
// Los gastos no se pueden repartir por venta, así que se restan del total.

const hoy = () => new Date();
const iso = (d) => d.toISOString().split('T')[0];
const primerDiaMes = (d = hoy()) => new Date(d.getFullYear(), d.getMonth(), 1);
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pct = (parte, total) => (total > 0 ? (parte / total) * 100 : 0);

function Kpi({ label, value, sub, tone = 'neutral', icon: Icon }) {
  const tonos = {
    neutral: 'text-primary',
    good: 'text-emerald-600',
    bad: 'text-error',
    accent: 'text-secondary',
  };
  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="w-9 h-9 rounded-xl bg-primary/5 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-muted" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{label}</p>
            <p className={`text-xl font-display font-bold tabular-nums ${tonos[tone]}`}>{value}</p>
            {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

export default function Utilidad() {
  const anioActual = hoy().getFullYear();
  const [desde, setDesde] = useState(iso(primerDiaMes()));
  const [hasta, setHasta] = useState(iso(hoy()));
  const [loading, setLoading] = useState(true);
  const [ganancias, setGanancias] = useState(null);
  const [gastos, setGastos] = useState(null);
  const { addToast } = useToast();

  const cargar = async () => {
    setLoading(true);
    // El reporte de gastos filtra por año/mes, no por rango libre: se pide el
    // año del rango y se filtra el detalle en el cliente.
    const anio = new Date(desde).getFullYear() || anioActual;
    const [g, gs] = await Promise.allSettled([
      dashboardApi.getGanancias({ fecha_inicio: desde, fecha_fin: hasta }),
      gastosApi.getAll({ desde, hasta }),
    ]);
    if (g.status === 'fulfilled') setGanancias(g.value);
    else addToast('No se pudieron cargar las ventas del período', 'error');
    if (gs.status === 'fulfilled') setGastos(Array.isArray(gs.value) ? gs.value : []);
    else setGastos([]);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, [desde, hasta]);

  const resumen = useMemo(() => {
    const ventas = parseFloat(ganancias?.total_ventas) || 0;
    const costo = parseFloat(ganancias?.total_costos) || 0;
    const bruta = parseFloat(ganancias?.total_ganancia) || 0;

    // Solo los gastos que caen dentro del rango elegido.
    const d = new Date(desde), h = new Date(hasta);
    const enRango = (gastos || []).filter(g => {
      const f = new Date(String(g.fecha).slice(0, 10) + 'T12:00:00');
      return f >= d && f <= h;
    });
    const totalGastos = enRango.reduce(
      (s, g) => s + (parseFloat(g.monto_cop) || (parseFloat(g.monto) || 0) * (parseFloat(g.tasa_cambio) || 1)), 0
    );

    const porCategoria = {};
    for (const g of enRango) {
      const k = g.categoria || 'otro';
      const v = parseFloat(g.monto_cop) || (parseFloat(g.monto) || 0) * (parseFloat(g.tasa_cambio) || 1);
      porCategoria[k] = (porCategoria[k] || 0) + v;
    }

    return {
      ventas, costo, bruta,
      gastos: totalGastos,
      neta: bruta - totalGastos,
      unidades: (ganancias?.ventas || []).length,
      margenBruto: pct(bruta, ventas),
      margenNeto: pct(bruta - totalGastos, ventas),
      categorias: Object.entries(porCategoria).sort((a, b) => b[1] - a[1]),
      detalleGastos: enRango,
    };
  }, [ganancias, gastos, desde, hasta]);

  const filasVentas = useMemo(() => {
    return (ganancias?.ventas || []).map(v => {
      const total = parseFloat(v.total_venta) || 0;
      const costo = parseFloat(v.costo_total) || 0;
      const util = parseFloat(v.ganancia) || 0;
      return { id: v.id, fecha: v.fecha, total, costo, util, margen: pct(util, total) };
    });
  }, [ganancias]);

  const rangoRapido = (tipo) => {
    const n = hoy();
    if (tipo === 'mes') { setDesde(iso(primerDiaMes(n))); setHasta(iso(n)); }
    if (tipo === 'mesAnterior') {
      const ini = new Date(n.getFullYear(), n.getMonth() - 1, 1);
      setDesde(iso(ini));
      setHasta(iso(new Date(n.getFullYear(), n.getMonth(), 0)));
    }
    if (tipo === 'anio') { setDesde(`${n.getFullYear()}-01-01`); setHasta(iso(n)); }
  };

  const exportar = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();
      const PRIMARY = '0f172a', WHITE = 'ffffff', LIGHT = 'f1f5f9';

      const ws = wb.addWorksheet('Utilidad');
      ws.columns = [{ width: 34 }, { width: 20 }, { width: 14 }];

      ws.mergeCells('A1:C1');
      const t = ws.getCell('A1');
      t.value = `UTILIDAD — ${desde} a ${hasta}`;
      t.font = { size: 14, bold: true, color: { argb: WHITE } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
      t.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 28;

      const filas = [
        ['Ventas del período', resumen.ventas, ''],
        ['Costo de la mercancía vendida', -resumen.costo, ''],
        ['UTILIDAD BRUTA', resumen.bruta, `${resumen.margenBruto.toFixed(1)}%`],
        ['Gastos de operación', -resumen.gastos, ''],
        ['UTILIDAD NETA', resumen.neta, `${resumen.margenNeto.toFixed(1)}%`],
      ];
      let r = 3;
      filas.forEach(([label, valor, margen]) => {
        const destacada = label.startsWith('UTILIDAD');
        ws.getCell(`A${r}`).value = label;
        ws.getCell(`A${r}`).font = { bold: destacada, size: destacada ? 12 : 11 };
        ws.getCell(`B${r}`).value = valor;
        ws.getCell(`B${r}`).numFmt = '$#,##0';
        ws.getCell(`B${r}`).font = { bold: destacada, size: destacada ? 12 : 11, color: { argb: valor < 0 ? 'dc2626' : destacada ? '16a34a' : PRIMARY } };
        ws.getCell(`B${r}`).alignment = { horizontal: 'right' };
        ws.getCell(`C${r}`).value = margen;
        ws.getCell(`C${r}`).alignment = { horizontal: 'right' };
        if (destacada) {
          ['A', 'B', 'C'].forEach(c => {
            ws.getCell(`${c}${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
          });
        }
        ws.getRow(r).height = destacada ? 24 : 20;
        r++;
      });

      // Detalle por venta
      const wv = wb.addWorksheet('Por venta');
      wv.columns = [
        { header: 'Fecha', key: 'fecha', width: 14 },
        { header: 'Venta', key: 'id', width: 10 },
        { header: 'Total', key: 'total', width: 16 },
        { header: 'Costo', key: 'costo', width: 16 },
        { header: 'Utilidad', key: 'util', width: 16 },
        { header: 'Margen %', key: 'margen', width: 12 },
      ];
      wv.getRow(1).eachCell(c => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
        c.alignment = { horizontal: 'center' };
      });
      filasVentas.forEach(f => {
        wv.addRow({
          fecha: new Date(f.fecha),
          id: f.id,
          total: f.total,
          costo: f.costo,
          util: f.util,
          margen: Number(f.margen.toFixed(1)),
        });
      });
      wv.getColumn('fecha').numFmt = 'dd/mm/yyyy';
      ['total', 'costo', 'util'].forEach(k => { wv.getColumn(k).numFmt = '$#,##0'; });

      // Gastos por categoría
      const wg = wb.addWorksheet('Gastos');
      wg.columns = [{ header: 'Categoría', key: 'cat', width: 30 }, { header: 'Total', key: 'total', width: 18 }];
      wg.getRow(1).eachCell(c => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY } };
      });
      resumen.categorias.forEach(([cat, total]) => wg.addRow({ cat, total }));
      wg.getColumn('total').numFmt = '$#,##0';

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Utilidad_${desde}_a_${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      addToast('Excel de utilidad descargado', 'success');
    } catch (err) {
      addToast('No se pudo generar el Excel: ' + err.message, 'error');
    }
  };

  const inp = 'px-3 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30';

  return (
    <Layout title="Utilidad" subtitle="Cuánto queda de verdad después de costos y gastos">
      <div className="space-y-6">
        {/* Rango */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inp} />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => rangoRapido('mes')} className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted hover:text-primary hover:bg-primary/5">Este mes</button>
            <button onClick={() => rangoRapido('mesAnterior')} className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted hover:text-primary hover:bg-primary/5">Mes anterior</button>
            <button onClick={() => rangoRapido('anio')} className="px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted hover:text-primary hover:bg-primary/5">Año</button>
          </div>
          <Button onClick={exportar} variant="outline" className="ml-auto">
            <Download size={16} className="mr-1" /> Excel
          </Button>
        </div>

        {/* La cascada: de la venta a lo que queda */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="Ventas" value={formatCOP(resumen.ventas)} icon={Receipt}
               sub={`${resumen.unidades} venta${resumen.unidades !== 1 ? 's' : ''}`} />
          <Kpi label="Costo mercancía" value={formatCOP(resumen.costo)} icon={Package} tone="bad" />
          <Kpi label="Utilidad bruta" value={formatCOP(resumen.bruta)} tone="accent" icon={TrendingUp}
               sub={`Margen ${resumen.margenBruto.toFixed(1)}%`} />
          <Kpi label="Gastos operación" value={formatCOP(resumen.gastos)} tone="bad" icon={Coins} />
          <Kpi label="Utilidad neta"
               value={formatCOP(resumen.neta)}
               tone={resumen.neta >= 0 ? 'good' : 'bad'}
               icon={resumen.neta >= 0 ? TrendingUp : TrendingDown}
               sub={`Margen ${resumen.margenNeto.toFixed(1)}%`} />
        </div>

        {/* Cómo se llega a la utilidad neta */}
        <Card>
          <CardBody>
            <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Cómo se llega a la utilidad</p>
            <div className="space-y-2 max-w-2xl">
              {[
                { l: 'Ventas del período', v: resumen.ventas, signo: '' },
                { l: 'Costo de la mercancía vendida', v: -resumen.costo, signo: '−' },
                { l: 'Utilidad bruta', v: resumen.bruta, destacada: true },
                { l: 'Gastos de operación', v: -resumen.gastos, signo: '−' },
                { l: 'Utilidad neta', v: resumen.neta, destacada: true, final: true },
              ].map((f, i) => (
                <div key={i}
                  className={`flex items-center justify-between gap-4 px-3 py-2 rounded-lg ${
                    f.final ? 'bg-emerald-50 border border-emerald-200'
                      : f.destacada ? 'bg-primary/5' : ''
                  }`}>
                  <span className={`text-sm ${f.destacada ? 'font-bold text-primary' : 'text-muted'}`}>{f.l}</span>
                  <span className={`font-mono tabular-nums ${
                    f.destacada ? 'text-base font-bold' : 'text-sm'
                  } ${f.v < 0 ? 'text-error' : f.final ? 'text-emerald-700' : 'text-primary'}`}>
                    {formatCOP(f.v)}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-3 max-w-2xl">
              El costo de la mercancía es el <b>costo base</b> que quedó en cada paca al finalizar su contenedor.
              Los gastos no se pueden repartir venta por venta, así que se restan del total del período.
            </p>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Gastos por categoría */}
          <Card>
            <CardBody>
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Gastos por categoría</p>
              {resumen.categorias.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Sin gastos registrados en este período</p>
              ) : (
                <div className="space-y-2">
                  {resumen.categorias.map(([cat, total]) => (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="capitalize text-primary">{cat}</span>
                        <span className="font-mono tabular-nums text-muted">{formatCOP(total)}</span>
                      </div>
                      <div className="h-1.5 bg-primary/5 rounded-full overflow-hidden">
                        <div className="h-full bg-warning rounded-full"
                             style={{ width: `${pct(total, resumen.gastos)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Ventas con menor margen: dónde se está perdiendo plata */}
          <Card>
            <CardBody>
              <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Ventas con menor margen</p>
              {filasVentas.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">Sin ventas en este período</p>
              ) : (
                <div className="space-y-1.5">
                  {[...filasVentas].sort((a, b) => a.margen - b.margen).slice(0, 6).map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted truncate">
                        {new Date(String(f.fecha).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO')} · #{f.id}
                      </span>
                      <span className="flex items-center gap-3 flex-shrink-0">
                        <span className="font-mono tabular-nums text-muted">{formatCOP(f.total)}</span>
                        <span className={`font-mono tabular-nums font-semibold w-16 text-right ${
                          f.margen < 0 ? 'text-error' : f.margen < 15 ? 'text-warning' : 'text-emerald-600'
                        }`}>{f.margen.toFixed(1)}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Reparto de la utilidad del contenedor entre quienes lo financiaron */}
        <Inversionistas />

        {/* Detalle venta por venta */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary/3 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Venta</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Costo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Utilidad</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  <TableSkeleton cols={6} rows={5} />
                ) : filasVentas.length === 0 ? (
                  <tr><td colSpan={6}><EmptyState title="Sin ventas en el período" description="Ajusta el rango de fechas" /></td></tr>
                ) : filasVentas.map(f => (
                  <tr key={f.id} className="hover:bg-primary/3">
                    <td className="px-4 py-2.5 text-muted">
                      {new Date(String(f.fecha).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted">#{f.id}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCOP(f.total)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted">{formatCOP(f.costo)}</td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold ${f.util < 0 ? 'text-error' : 'text-emerald-600'}`}>
                      {formatCOP(f.util)}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                      f.margen < 0 ? 'text-error' : f.margen < 15 ? 'text-warning' : 'text-emerald-600'
                    }`}>{f.margen.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
