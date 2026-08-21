import { useEffect, useState, useMemo, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, useConfirm } from '../components/common';
import { historicoApi } from '../services/api';
import ExcelJS from 'exceljs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { History, Upload, Download, FileSpreadsheet, Trash2, CheckCircle2 } from 'lucide-react';
import { parseMonto, formatCOP } from '../lib/money';
import { hoy } from '../lib/fecha';
import { descargarExcel } from '../lib/descargar';
const fmt = formatCOP;
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
// Los montos del Excel vienen escritos en formato es-CO ("1.500.000"): parsearlos
// con parseFloat directo los convertía en 1.5.
const num = (v) => (v === null || v === undefined || v === '' ? 0 : parseMonto(v));
const cellVal = (v) => {
  if (v == null) return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') return v.result ?? v.text ?? v.hyperlink ?? '';
  return v;
};

// Antes cada línea del CSV se partía con split(/[,;]/): una razón social entre comillas
// ("Comercializadora Pérez, S.A.S.") generaba una columna de más y desplazaba todo lo
// que venía después, monto incluido. Y en un CSV exportado desde Excel en configuración
// colombiana (separador ";", decimal ",") partía los montos por la mitad.
// Ahora se decide el separador mirando sólo lo que está FUERA de comillas.
function detectarSeparador(linea) {
  let comas = 0, puntoYComa = 0, dentro = false;
  for (const c of linea) {
    if (c === '"') { dentro = !dentro; continue; }
    if (dentro) continue;
    if (c === ',') comas++;
    else if (c === ';') puntoYComa++;
  }
  return puntoYComa > comas ? ';' : ',';
}

// Parte una línea respetando las comillas dobles ("" es una comilla literal dentro del campo)
function partirCSV(linea, sep) {
  const celdas = [];
  let actual = '', dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (dentro) {
      if (c !== '"') { actual += c; }
      else if (linea[i + 1] === '"') { actual += '"'; i++; }
      else { dentro = false; }
    } else if (c === '"') {
      dentro = true;
    } else if (c === sep) {
      celdas.push(actual.trim());
      actual = '';
    } else {
      actual += c;
    }
  }
  celdas.push(actual.trim());
  return celdas;
}

// Detecta los índices de columna por nombre de encabezado (tolerante a acentos/orden)
function detectarColumnas(headers) {
  const idx = { fecha: -1, contenedor: -1, proveedor: -1, cliente: -1, precio_total: -1, costo_total: -1, precio_unitario: -1, costo_unitario: -1, cantidad: -1 };
  headers.forEach((h, i) => {
    const t = norm(h);
    if (!t) return;
    if (idx.fecha < 0 && /fecha/.test(t)) idx.fecha = i;
    else if (idx.contenedor < 0 && /contenedor/.test(t)) idx.contenedor = i;
    else if (idx.proveedor < 0 && /proveedor/.test(t)) idx.proveedor = i;
    else if (idx.cliente < 0 && /cliente/.test(t)) idx.cliente = i;
    else if (idx.precio_total < 0 && /(precio.*total|total.*precio|venta.*total)/.test(t)) idx.precio_total = i;
    else if (idx.costo_total < 0 && /(costo.*total|total.*costo)/.test(t)) idx.costo_total = i;
    else if (idx.cantidad < 0 && /(cantidad|cant|unidad)/.test(t)) idx.cantidad = i;
    else if (idx.precio_unitario < 0 && /precio/.test(t)) idx.precio_unitario = i;
    else if (idx.costo_unitario < 0 && /costo/.test(t)) idx.costo_unitario = i;
  });
  return idx;
}

export default function Historico() {
  const [tab, setTab] = useState('subir'); // 'subir' | 'reporte'
  const { addToast } = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);

  // ── Importación ──
  const [preview, setPreview] = useState([]);
  const [crearClientes, setCrearClientes] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  // ── Reporte ──
  const [anios, setAnios] = useState([]);
  const [anio, setAnio] = useState('');
  const [reporte, setReporte] = useState(null);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [errorReporte, setErrorReporte] = useState('');
  const [reintento, setReintento] = useState(0);

  const cargarAnios = async () => {
    try {
      const a = await historicoApi.getAnios();
      setAnios(a);
      if (a.length && !anio) setAnio(String(a[0]));
    } catch (err) { /* silencioso */ }
  };
  useEffect(() => { cargarAnios(); }, []);

  // Al cambiar rápido de año quedaban dos peticiones en vuelo y ganaba la que
  // respondiera última, no la del año elegido: podían verse las cifras de 2024
  // bajo el rótulo 2025. `vigente` descarta la respuesta que ya no corresponde.
  // Además se limpia el reporte anterior para no mostrar cifras viejas como si
  // fueran las del año nuevo mientras llega la respuesta.
  useEffect(() => {
    if (tab !== 'reporte' || !anio) return;
    let vigente = true;
    setCargandoReporte(true);
    setErrorReporte('');
    setReporte(null);
    historicoApi.getReporte({ anio })
      .then(r => {
        if (!vigente) return;
        // Una respuesta vacía (204 o cuerpo en blanco) llega aquí como null. Sin
        // esta rama `reporte` se quedaba en null con la carga ya terminada y la
        // pantalla mostraba "Cargando el reporte de…" para siempre, sin error ni
        // botón de reintentar.
        if (r) setReporte(r);
        else setErrorReporte('El servidor no devolvió datos del reporte.');
      })
      .catch(err => {
        if (!vigente) return;
        const msg = err.message || 'No se pudo cargar el reporte.';
        setErrorReporte(msg);
        addToast(msg, 'error');
      })
      .finally(() => { if (vigente) setCargandoReporte(false); });
    return () => { vigente = false; };
  }, [tab, anio, reintento]);

  const buildRow = (cells, idx) => {
    const g = (i) => (i >= 0 ? cellVal(cells[i]) : undefined);
    const f = g(idx.fecha);
    const pu = num(g(idx.precio_unitario));
    const cu = num(g(idx.costo_unitario));
    const cant = num(g(idx.cantidad));
    const pt = num(g(idx.precio_total)) || (pu * cant);
    const ct = num(g(idx.costo_total)) || (cu * cant);
    const fecha = f instanceof Date ? f.toISOString() : (f != null ? String(f) : '');
    const row = {
      fecha,
      contenedor_numero: g(idx.contenedor) != null ? String(g(idx.contenedor)) : '',
      proveedor: g(idx.proveedor) != null ? String(g(idx.proveedor)) : '',
      cliente_nombre: g(idx.cliente) != null ? String(g(idx.cliente)) : '',
      precio_unitario: pu,
      costo_unitario: cu,
      cantidad: cant,
      precio_total: pt,
      costo_total: ct,
    };
    row._warn = (!fecha || (pt === 0 && ct === 0));
    return row;
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      let headers = [];
      const rawRows = [];
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) { addToast('El archivo no tiene hojas', 'error'); return; }
        ws.eachRow((row, rn) => {
          const cells = (row.values || []).slice(1);
          if (rn === 1) { headers = cells.map(c => (cellVal(c) != null ? String(cellVal(c)) : '')); return; }
          rawRows.push(cells);
        });
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) { addToast('Archivo vacío', 'error'); return; }
        // El separador se decide con la primera línea que tenga alguno: si el
        // archivo trae una fila de título suelta ("Ventas 2024") el encabezado
        // no lleva separadores y asumir la coma partía mal todo un archivo ";".
        const guia = lines.find(l => /[;,]/.test(l)) || lines[0];
        const sep = detectarSeparador(guia);
        headers = partirCSV(lines[0], sep);
        lines.slice(1).forEach(line => rawRows.push(partirCSV(line, sep)));
      }

      const idx = detectarColumnas(headers);
      const rows = rawRows
        .filter(cells => cells.some(c => cellVal(c) != null && String(cellVal(c)).trim() !== ''))
        .map(cells => buildRow(cells, idx));

      if (!rows.length) { addToast('No se encontraron filas con datos', 'error'); return; }
      setPreview(rows);
      setResult(null);
      addToast(`${rows.length} fila(s) leída(s) del archivo`, 'success');
    } catch (err) {
      addToast('Error al leer el archivo: ' + err.message, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resumen = useMemo(() => {
    const warn = preview.filter(r => r._warn).length;
    const nombres = new Set(preview.map(r => norm(r.cliente_nombre)).filter(Boolean));
    return { total: preview.length, warn, clientes: nombres.size };
  }, [preview]);

  const confirmarImport = async () => {
    if (!preview.length) return;
    try {
      setImporting(true);
      const registros = preview.map(({ _warn, ...r }) => r);
      const res = await historicoApi.importar({ registros, crear_clientes: crearClientes });
      setResult(res);
      setPreview([]);
      addToast(`${res.insertados} registro(s) importado(s)`, 'success');
      cargarAnios();
    } catch (err) {
      addToast('Error al importar: ' + err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const deshacer = async () => {
    if (!result?.lote) return;
    const ok = await confirm({ title: '¿Deshacer importación?', message: `Se eliminarán los ${result.insertados} registro(s) de esta carga.`, confirmText: 'Deshacer', variant: 'danger' });
    if (!ok) return;
    try {
      const r = await historicoApi.deleteLote(result.lote);
      addToast(`${r.eliminados} registro(s) eliminado(s)`, 'success');
      setResult(null);
      cargarAnios();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const descargarPlantilla = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Histórico');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Contenedor #', key: 'contenedor', width: 16 },
      { header: 'Proveedor', key: 'proveedor', width: 20 },
      { header: 'Cliente', key: 'cliente', width: 20 },
      { header: 'Precio', key: 'precio', width: 12 },
      { header: 'Costo', key: 'costo', width: 12 },
      { header: 'Cantidad', key: 'cantidad', width: 12 },
      { header: 'Precio total', key: 'precio_total', width: 14 },
      { header: 'Costo total', key: 'costo_total', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({ fecha: '15/03/2024', contenedor: 'C-12', proveedor: 'Proveedor A', cliente: 'Tienda La 80', precio: 10000, costo: 6000, cantidad: 100, precio_total: 1000000, costo_total: 600000 });
    const buf = await wb.xlsx.writeBuffer();
    descargarExcel(buf, 'Plantilla_Historico.xlsx');
  };

  const exportarClientes = async () => {
    try {
      const data = await historicoApi.getAll({ anio });
      const vistos = new Set(); const filas = [];
      for (const r of data) {
        const key = norm(r.cliente_nombre);
        if (!key || vistos.has(key)) continue;
        vistos.add(key);
        filas.push({ cliente: r.cliente_nombre, enlazado: r.cliente_id ? 'Sí' : 'No' });
      }
      if (!filas.length) { addToast('No hay clientes en el histórico', 'info'); return; }
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Clientes');
      ws.columns = [{ header: 'Cliente', key: 'cliente', width: 30 }, { header: 'Enlazado en sistema', key: 'enlazado', width: 18 }];
      ws.getRow(1).font = { bold: true };
      filas.forEach(f => ws.addRow(f));
      const buf = await wb.xlsx.writeBuffer();
      descargarExcel(buf, `Clientes_historico_${anio || 'todos'}.xlsx`);
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };

  const exportarReporte = async () => {
    if (!reporte) return;
    const wb = new ExcelJS.Workbook();
    const addSheet = (name, cols, rows) => {
      const ws = wb.addWorksheet(name);
      ws.columns = cols;
      ws.getRow(1).font = { bold: true };
      rows.forEach(r => ws.addRow(r));
    };
    const moneyCols = (key) => [{ header: key, key, width: 22 }, { header: 'Ventas', key: 'ventas', width: 16, style: { numFmt: '$#,##0' } }, { header: 'Costo', key: 'costo', width: 16, style: { numFmt: '$#,##0' } }, { header: 'Utilidad', key: 'utilidad', width: 16, style: { numFmt: '$#,##0' } }];
    addSheet('Por mes', [{ header: 'Mes', key: 'mes', width: 10 }, ...moneyCols('mes').slice(1)],
      (reporte.por_mes || []).map(m => ({ mes: MESES[(+m.mes) - 1] || m.mes, ventas: +m.ventas, costo: +m.costo, utilidad: +m.utilidad })));
    addSheet('Por proveedor', moneyCols('proveedor'),
      (reporte.por_proveedor || []).map(p => ({ proveedor: p.proveedor, ventas: +p.ventas, costo: +p.costo, utilidad: +p.utilidad })));
    addSheet('Por contenedor', moneyCols('contenedor'),
      (reporte.por_contenedor || []).map(c => ({ contenedor: c.contenedor, ventas: +c.ventas, costo: +c.costo, utilidad: +c.utilidad })));
    const buf = await wb.xlsx.writeBuffer();
    descargarExcel(buf, `Reporte_historico_${anio || 'todos'}.xlsx`);
  };

  const chartData = useMemo(() => (reporte?.por_mes || []).map(m => ({
    mes: MESES[(+m.mes) - 1] || m.mes, Ventas: +m.ventas, Costo: +m.costo,
  })), [reporte]);

  // Patrón ARIA de tablist: las flechas mueven la selección y el foco la acompaña
  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const siguiente = tab === 'subir' ? 'reporte' : 'subir';
    setTab(siguiente);
    requestAnimationFrame(() => document.getElementById(`tab-${siguiente}`)?.focus());
  };

  const t = reporte?.totales || {};
  const selectCls = 'px-4 py-2.5 rounded-xl border border-border bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-secondary/30';

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-primary flex items-center gap-2">
              <History className="w-6 h-6" /> Histórico
            </h1>
            <p className="text-sm text-muted">Carga datos de años anteriores para tus reportes (2024, 2025…)</p>
          </div>
        </div>

        {/* Tabs: la pestaña activa solo se distinguía por color, así que un lector de
            pantalla no anunciaba cuál estaba seleccionada. Con role=tab/aria-selected
            sí lo dice, y las flechas ← → cambian de pestaña como es de esperar. */}
        <div role="tablist" aria-label="Secciones de Histórico" className="flex gap-1 border-b border-border">
          <button role="tab" id="tab-subir" aria-selected={tab === 'subir'} aria-controls="panel-historico" tabIndex={tab === 'subir' ? 0 : -1}
            onClick={() => setTab('subir')} onKeyDown={onTabKeyDown}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'subir' ? 'border-secondary text-secondary' : 'border-transparent text-muted hover:text-primary'}`}>Subir Excel</button>
          <button role="tab" id="tab-reporte" aria-selected={tab === 'reporte'} aria-controls="panel-historico" tabIndex={tab === 'reporte' ? 0 : -1}
            onClick={() => setTab('reporte')} onKeyDown={onTabKeyDown}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === 'reporte' ? 'border-secondary text-secondary' : 'border-transparent text-muted hover:text-primary'}`}>Reportes</button>
        </div>

        {tab === 'subir' ? (
          <div id="panel-historico" role="tabpanel" aria-labelledby="tab-subir" className="space-y-6">
            <Card>
              <CardBody>
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFile(e.target.files?.[0])}
                    className="block text-sm text-muted file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-secondary file:text-on-primary file:font-medium hover:file:bg-secondary/90" />
                  <Button variant="ghost" onClick={descargarPlantilla}><FileSpreadsheet size={16} /> Descargar plantilla</Button>
                </div>
                <p className="text-xs text-muted mt-3">Columnas: Fecha, Contenedor #, Proveedor, Cliente (opcional), Precio, Costo, Cantidad, Precio total, Costo total. El orden no importa; se detectan por el encabezado.</p>
              </CardBody>
            </Card>

            {preview.length > 0 && (
              <Card>
                <CardBody>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <p className="text-sm text-muted">
                      <span className="font-semibold text-primary">{resumen.total}</span> fila(s)
                      {resumen.warn > 0 && <span className="text-amber-600"> · {resumen.warn} con avisos</span>}
                      {resumen.clientes > 0 && <span> · {resumen.clientes} cliente(s)</span>}
                    </p>
                    <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
                      <input type="checkbox" checked={crearClientes} onChange={(e) => setCrearClientes(e.target.checked)} />
                      Crear clientes nuevos automáticamente
                    </label>
                  </div>

                  <div className="overflow-x-auto max-h-[360px] overflow-y-auto border border-border rounded-xl">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface">
                        <tr className="text-left text-muted border-b border-border">
                          <th className="py-2 px-2 font-medium">Fecha</th>
                          <th className="py-2 px-2 font-medium">Contenedor</th>
                          <th className="py-2 px-2 font-medium">Proveedor</th>
                          <th className="py-2 px-2 font-medium">Cliente</th>
                          <th className="py-2 px-2 font-medium text-right">Cant.</th>
                          <th className="py-2 px-2 font-medium text-right">Precio total</th>
                          <th className="py-2 px-2 font-medium text-right">Costo total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 100).map((r, i) => (
                          <tr key={i} className={`border-b border-border/50 ${r._warn ? 'bg-amber-500/10' : ''}`}>
                            <td className="py-1.5 px-2">{r.fecha ? String(r.fecha).slice(0, 10) : <span className="text-amber-600">sin fecha</span>}</td>
                            <td className="py-1.5 px-2">{r.contenedor_numero}</td>
                            <td className="py-1.5 px-2">{r.proveedor}</td>
                            <td className="py-1.5 px-2">{r.cliente_nombre}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{r.cantidad}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.precio_total)}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.costo_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.length > 100 && <p className="text-xs text-muted mt-2">… y {preview.length - 100} fila(s) más</p>}

                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="ghost" onClick={() => setPreview([])}>Cancelar</Button>
                    <Button onClick={confirmarImport} disabled={importing}>
                      <Upload size={16} /> {importing ? 'Importando…' : 'Confirmar importación'}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {result && (
              <Card>
                <CardBody>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 text-success flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-semibold text-primary">Importación completada</p>
                      <p className="text-sm text-muted">
                        {result.insertados} registro(s) · {result.clientes_creados} cliente(s) creado(s) · {result.clientes_encontrados} enlazado(s)
                        {result.errores?.length ? ` · ${result.errores.length} con error` : ''}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button variant="secondary" onClick={exportarClientes}><Download size={16} /> Exportar clientes</Button>
                        <Button variant="ghost" onClick={deshacer}><Trash2 size={16} /> Deshacer importación</Button>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        ) : (
          <div id="panel-historico" role="tabpanel" aria-labelledby="tab-reporte" className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Año</label>
                <select value={anio} onChange={(e) => setAnio(e.target.value)} className={selectCls}>
                  {anios.length === 0 && <option value="">—</option>}
                  {anios.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {reporte && <Button variant="secondary" onClick={exportarReporte}><Download size={16} /> Exportar reporte</Button>}
            </div>

            {anios.length === 0 ? (
              <Card><CardBody><p className="text-center text-muted py-8">Aún no hay datos históricos. Sube un Excel en la pestaña "Subir Excel".</p></CardBody></Card>
            ) : errorReporte ? (
              <Card><CardBody className="text-center py-8 space-y-3">
                <p className="text-muted">No se pudo cargar el reporte de {anio}.</p>
                <Button variant="ghost" onClick={() => setReintento(n => n + 1)}>Reintentar</Button>
              </CardBody></Card>
            ) : (cargandoReporte || !reporte) ? (
              /* Antes no había señal de carga: se seguían viendo las cifras del año
                 anterior, y sin reporte `fmt(undefined)` pintaba "$0" como dato real */
              <Card><CardBody><p className="text-center text-muted py-8">Cargando el reporte de {anio}…</p></CardBody></Card>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Ventas</p><p className="text-xl font-display text-primary">{fmt(t.ventas)}</p></CardBody></Card>
                  <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Costo</p><p className="text-xl font-display text-primary">{fmt(t.costo)}</p></CardBody></Card>
                  <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Utilidad</p><p className="text-xl font-display text-primary">{fmt(t.utilidad)}</p></CardBody></Card>
                  <Card><CardBody><p className="text-xs text-muted uppercase tracking-wider">Unidades</p><p className="text-xl font-display text-primary">{(parseFloat(t.unidades) || 0).toLocaleString('es-CO')}</p></CardBody></Card>
                </div>

                {chartData.length > 0 && (
                  <Card>
                    <CardBody>
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Ventas vs Costo por mes</p>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#88888833" />
                          <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => '$' + (v / 1000) + 'k'} />
                          <Tooltip formatter={(v) => fmt(v)} />
                          <Legend />
                          <Bar dataKey="Ventas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Costo" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardBody>
                  </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardBody>
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Por proveedor</p>
                      <TablaResumen rows={reporte?.por_proveedor} keyName="proveedor" />
                    </CardBody>
                  </Card>
                  <Card>
                    <CardBody>
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Por contenedor</p>
                      <TablaResumen rows={reporte?.por_contenedor} keyName="contenedor" />
                    </CardBody>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function TablaResumen({ rows, keyName }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-muted py-4 text-center">Sin datos</p>;
  return (
    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-muted border-b border-border">
            <th className="py-2 pr-3 font-medium capitalize">{keyName}</th>
            <th className="py-2 px-3 font-medium text-right">Ventas</th>
            <th className="py-2 px-3 font-medium text-right">Costo</th>
            <th className="py-2 pl-3 font-medium text-right">Utilidad</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-1.5 pr-3 text-primary">{r[keyName]}</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{'$' + (parseFloat(r.ventas) || 0).toLocaleString('es-CO')}</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{'$' + (parseFloat(r.costo) || 0).toLocaleString('es-CO')}</td>
              <td className="py-1.5 pl-3 text-right tabular-nums">{'$' + (parseFloat(r.utilidad) || 0).toLocaleString('es-CO')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
