import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, Badge, TableSkeleton, RefLink } from '../components/common';
import { reportesApi, dashboardApi, carteraApi } from '../services/api';
import ExcelJS from 'exceljs';
import { FileText, Calendar, TrendingUp, Users, Package, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { hoy } from '../lib/fecha';
import { formatCOP } from '../lib/money';

const formatCurrency = formatCOP;

// Lista siempre un arreglo: si la API devuelve otra cosa, los .reduce y .map de
// abajo reventaban la pantalla entera.
const comoLista = (v) => (Array.isArray(v) ? v : []);

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [reporteMensual, setReporteMensual] = useState(null);
  const [mesActual, setMesActual] = useState(null);
  const [pacasVendidas, setPacasVendidas] = useState([]);
  const [ganancias, setGanancias] = useState([]);
  const [deudores, setDeudores] = useState([]);
  const [error, setError] = useState(null);
  // Qué listados secundarios no llegaron. Se guardan aparte del error general
  // porque no deben borrar de la pantalla el reporte del mes, que sí llegó.
  const [fallosListas, setFallosListas] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    loadReportes();
  }, []);

  const loadReportes = async () => {
    setLoading(true);
    setError(null);
    setFallosListas(null);
    try {
      // Las cinco consultas son independientes: ninguna usa el resultado de otra.
      // Antes iban en dos Promise.all encadenados y la espera era t1+t2 en vez de
      // max(t1,t2), con el spinner cubriendo la suma de las dos.
      //
      // allSettled y no all: con Promise.all bastaba que se cayera un listado
      // secundario (por ejemplo /cartera/deudores) para tapar con una pantalla de
      // error el reporte del mes completo y dejar el botón de Excel inservible.
      const [reporteRes, mesRes, pacasRes, gananciaRes, deudoresRes] = await Promise.allSettled([
        reportesApi.getMensual(),
        reportesApi.getMesActual(),
        dashboardApi.getPacasVendidas({}),
        dashboardApi.getGanancia({}),
        carteraApi.getDeudores()
      ]);

      // El reporte del mes sí es imprescindible: sin él no hay nada que pintar.
      // Antes esto era solo un console.error y la pantalla mostraba $0 en Total
      // Vendido y Ganancia Neta, indistinguible de "no vendiste nada".
      if (reporteRes.status === 'rejected' || mesRes.status === 'rejected') {
        const motivo = reporteRes.reason || mesRes.reason;
        setError(motivo?.message || 'No hay conexión con el servidor.');
        setReporteMensual(null);
        setMesActual(null);
        setPacasVendidas([]);
        setGanancias([]);
        setDeudores([]);
        return;
      }

      setReporteMensual(reporteRes.value);
      setMesActual(mesRes.value);

      // Los tres listados son secundarios: si fallan se dice cuáles fallaron y
      // sus tarjetas muestran "—", nunca 0 ni $0.
      const caidas = [];
      const fallos = { pacas: false, ganancia: false, deudores: false, motivo: '' };

      if (pacasRes.status === 'fulfilled') setPacasVendidas(comoLista(pacasRes.value));
      else { setPacasVendidas([]); fallos.pacas = true; caidas.push('Pacas vendidas'); }

      if (gananciaRes.status === 'fulfilled') setGanancias(comoLista(gananciaRes.value));
      else { setGanancias([]); fallos.ganancia = true; caidas.push('Ganancia'); }

      if (deudoresRes.status === 'fulfilled') setDeudores(comoLista(deudoresRes.value));
      else { setDeudores([]); fallos.deudores = true; caidas.push('Clientes con deuda'); }

      if (caidas.length) {
        fallos.secciones = caidas;
        fallos.motivo = (pacasRes.reason || gananciaRes.reason || deudoresRes.reason)?.message || '';
        setFallosListas(fallos);
      }
    } catch (err) {
      setError(err?.message || 'No hay conexión con el servidor.');
      setReporteMensual(null);
      setMesActual(null);
      setPacasVendidas([]);
      setGanancias([]);
      setDeudores([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    if (!reporteMensual) return;
    setLoadingGeneral(true);
    
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();
      
      // Colors
      const primaryColor = '0f172a';
      const secondaryColor = '6366f1';
      const accentColor = 'ef4444';
      const successColor = '16a34a';
      const lightBg = 'f8fafc';
      
      // Helper function for currency
      const fmt = (val) => formatCurrency(val);
      
      // ============ HOJA 1: RESUMEN EJECUTIVO ============
      const ws1 = wb.addWorksheet('Resumen');
      ws1.properties.tabColor = secondaryColor;
      
      // Title
      ws1.mergeCells('A1:D1');
      const titleCell = ws1.getCell('A1');
      titleCell.value = '🌐 Comercio Global Logístico';
      titleCell.font = { size: 24, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws1.getRow(1).height = 40;
      
      // Subtitle
      ws1.mergeCells('A2:D2');
      ws1.getCell('A2').value = `Reporte Mensual - ${mesActual?.mes_nombre}`;
      ws1.getCell('A2').font = { size: 14, bold: true };
      ws1.getCell('A2').alignment = { horizontal: 'center' };
      
      // Date
      ws1.mergeCells('A3:D3');
      ws1.getCell('A3').value = `Generado: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      ws1.getCell('A3').font = { size: 10, italic: true, color: { argb: '666666' } };
      ws1.getCell('A3').alignment = { horizontal: 'center' };
      
      // KPI Cards
      const kpis = [
        { label: 'Total de Ventas', value: reporteMensual.resumen_ejecutivo?.total_ventas || 0, color: primaryColor },
        { label: 'Monto Total', value: fmt(reporteMensual.resumen_ejecutivo?.monto_total_ventas), color: primaryColor },
        { label: 'Ganancia del Mes', value: fmt(reporteMensual.resumen_ejecutivo?.total_ganancia), color: successColor },
        { label: 'Saldo Cartera', value: fmt(reporteMensual.resumen_ejecutivo?.saldo_cartera), color: accentColor },
        { label: 'Clientes Nuevos', value: reporteMensual.resumen_ejecutivo?.clientes_nuevos || 0, color: secondaryColor },
        { label: 'Pacas Vendidas', value: reporteMensual.resumen_ejecutivo?.pacas_vendidas || 0, color: secondaryColor },
      ];
      
      let kpiRow = 5;
      for (let i = 0; i < kpis.length; i += 2) {
        const kpi1 = kpis[i];
        const kpi2 = kpis[i + 1];
        
        // KPI 1
        ws1.getCell(`A${kpiRow}`).value = kpi1.label;
        ws1.getCell(`A${kpiRow}`).font = { size: 11, bold: true };
        ws1.getCell(`A${kpiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBg } };
        
        ws1.getCell(`B${kpiRow}`).value = kpi1.value;
        ws1.getCell(`B${kpiRow}`).font = { size: 14, bold: true, color: { argb: kpi1.color } };
        ws1.getCell(`B${kpiRow}`).alignment = { horizontal: 'right' };
        
        // KPI 2
        if (kpi2) {
          ws1.getCell(`C${kpiRow}`).value = kpi2.label;
          ws1.getCell(`C${kpiRow}`).font = { size: 11, bold: true };
          ws1.getCell(`C${kpiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lightBg } };
          
          ws1.getCell(`D${kpiRow}`).value = kpi2.value;
          ws1.getCell(`D${kpiRow}`).font = { size: 14, bold: true, color: { argb: kpi2.color } };
          ws1.getCell(`D${kpiRow}`).alignment = { horizontal: 'right' };
        }
        
        kpiRow++;
      }
      
      // Column widths
      ws1.getColumn(1).width = 20;
      ws1.getColumn(2).width = 18;
      ws1.getColumn(3).width = 20;
      ws1.getColumn(4).width = 18;
      
      // ============ HOJA 2: VENTAS ============
      const ws2 = wb.addWorksheet('Ventas');
      ws2.properties.tabColor = successColor;
      
      // Header
      const ventasHeaders = ['Fecha', 'Factura', 'Cliente', 'Teléfono', 'Tipo de Pago', 'Total'];
      ws2.addTable({
        name: 'VentasTable',
        ref: 'A1',
        headerRow: true,
        style: {
          theme: 'none',
          showRowStripes: false,
        },
        columns: ventasHeaders.map(h => ({ name: h, filterButton: false })),
        rows: (reporteMensual.ventas || []).map(v => [
          new Date(v.fecha).toLocaleDateString('es-MX'),
          v.uuid?.slice(0, 8).toUpperCase(),
          v.cliente_nombre,
          v.cliente_telefono || '-',
          v.tipo_pago?.toUpperCase(),
          parseFloat(v.total)
        ])
      });
      
      // Style header row
      const ventasRow1 = ws2.getRow(1);
      ventasRow1.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
        cell.alignment = { horizontal: 'center' };
        cell.border = { bottom: { style: 'medium', color: { argb: secondaryColor } } };
      });
      
      // Format currency column
      ws2.eachRow(row => {
        row.getCell(6).numFmt = '$#,##0';
        row.getCell(6).font = { bold: true };
      });
      
      ws2.getColumn(1).width = 14;
      ws2.getColumn(2).width = 12;
      ws2.getColumn(3).width = 25;
      ws2.getColumn(4).width = 14;
      ws2.getColumn(5).width = 14;
      ws2.getColumn(6).width = 14;
      
      // ============ HOJA 3: PACAS VENDIDAS ============
      const ws3 = wb.addWorksheet('Pacas Vendidas');
      ws3.properties.tabColor = secondaryColor;
      
      const pacasHeaders = ['Tipo', 'Categoría', 'Cantidad', 'Total Vendido', 'Costo', 'Ganancia'];
      ws3.addTable({
        name: 'PacasTable',
        ref: 'A1',
        headerRow: true,
        columns: pacasHeaders.map(h => ({ name: h, filterButton: false })),
        rows: (reporteMensual.pacas_por_tipo || []).map(p => [
          p.clasificacion?.toUpperCase(),
          p.referencia?.toUpperCase(),
          parseInt(p.cantidad),
          parseFloat(p.total),
          parseFloat(p.costo),
          parseFloat(p.total) - parseFloat(p.costo)
        ])
      });
      
      const pacasRow1 = ws3.getRow(1);
      pacasRow1.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondaryColor } };
        cell.alignment = { horizontal: 'center' };
      });
      
      ws3.eachRow((row, rowNum) => {
        if (rowNum > 1) {
          row.getCell(4).numFmt = '$#,##0';
          row.getCell(5).numFmt = '$#,##0';
          row.getCell(6).numFmt = '$#,##0';
          row.getCell(6).font = { bold: true, color: { argb: successColor } };
        }
      });
      
      ws3.getColumn(1).width = 16;
      ws3.getColumn(2).width = 14;
      ws3.getColumn(3).width = 12;
      ws3.getColumn(4).width = 16;
      ws3.getColumn(5).width = 16;
      ws3.getColumn(6).width = 16;
      
      // ============ HOJA 4: CARTERA ============
      const ws4 = wb.addWorksheet('Cartera');
      ws4.properties.tabColor = accentColor;
      
      const carteraHeaders = ['Cliente', 'Ciudad', 'Total Vendido', 'Total Abonado', 'Saldo Pendiente'];
      ws4.addTable({
        name: 'CarteraTable',
        ref: 'A1',
        headerRow: true,
        columns: carteraHeaders.map(h => ({ name: h, filterButton: false })),
        rows: (reporteMensual.cartera || []).map(c => [
          c.nombre,
          c.ciudad || '-',
          parseFloat(c.total_vendido),
          parseFloat(c.total_abonado),
          parseFloat(c.saldo_pendiente)
        ])
      });
      
      const carteraRow1 = ws4.getRow(1);
      carteraRow1.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentColor } };
        cell.alignment = { horizontal: 'center' };
      });
      
      ws4.eachRow((row, rowNum) => {
        if (rowNum > 1) {
          for (let i = 3; i <= 5; i++) {
            row.getCell(i).numFmt = '$#,##0';
          }
          row.getCell(5).font = { bold: true, color: { argb: row.getCell(5).value > 0 ? accentColor : successColor } };
        }
      });
      
      ws4.getColumn(1).width = 25;
      ws4.getColumn(2).width = 18;
      ws4.getColumn(3).width = 16;
      ws4.getColumn(4).width = 16;
      ws4.getColumn(5).width = 18;
      
      // ============ HOJA 5: CLIENTES ============
      const ws5 = wb.addWorksheet('Clientes');
      ws5.properties.tabColor = primaryColor;
      
      const clientesHeaders = ['Nombre', 'Teléfono', 'Ciudad', 'Tipo', 'Límite Crédito', 'Estado'];
      ws5.addTable({
        name: 'ClientesTable',
        ref: 'A1',
        headerRow: true,
        columns: clientesHeaders.map(h => ({ name: h, filterButton: false })),
        rows: (reporteMensual.clientes || []).map(c => [
          c.nombre,
          c.telefono || '-',
          c.ciudad || '-',
          c.tipo_cliente?.toUpperCase(),
          parseFloat(c.limite_credito),
          c.estado?.toUpperCase()
        ])
      });
      
      const clientesRow1 = ws5.getRow(1);
      clientesRow1.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
        cell.alignment = { horizontal: 'center' };
      });
      
      ws5.getColumn(1).width = 28;
      ws5.getColumn(2).width = 14;
      ws5.getColumn(3).width = 18;
      ws5.getColumn(4).width = 12;
      ws5.getColumn(5).width = 15;
      ws5.getColumn(6).width = 12;
      
      // ============ HOJA 6: INVENTARIO ============
      const ws6 = wb.addWorksheet('Inventario');
      ws6.properties.tabColor = '666666';
      
      const inventarioHeaders = ['Estado', 'Cantidad', 'Costo Total', 'Precio Total', 'Valor en Venta'];
      ws6.addTable({
        name: 'InventarioTable',
        ref: 'A1',
        headerRow: true,
        columns: inventarioHeaders.map(h => ({ name: h, filterButton: false })),
        rows: (reporteMensual.inventario || []).map(i => [
          i.estado?.toUpperCase(),
          parseInt(i.cantidad),
          parseFloat(i.costo_total),
          parseFloat(i.precio_total),
          parseFloat(i.precio_total) - parseFloat(i.costo_total)
        ])
      });
      
      const inventarioRow1 = ws6.getRow(1);
      inventarioRow1.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '666666' } };
        cell.alignment = { horizontal: 'center' };
      });
      
      ws6.eachRow((row, rowNum) => {
        if (rowNum > 1) {
          for (let i = 3; i <= 5; i++) {
            row.getCell(i).numFmt = '$#,##0';
          }
          const estado = row.getCell(1).value;
          row.getCell(1).font = { 
            bold: true, 
            color: { argb: estado === 'DISPONIBLE' ? successColor : estado === 'VENDIDA' ? accentColor : secondaryColor } 
          };
        }
      });
      
      ws6.getColumn(1).width = 16;
      ws6.getColumn(2).width = 12;
      ws6.getColumn(3).width = 16;
      ws6.getColumn(4).width = 16;
      ws6.getColumn(5).width = 16;
      
      // Download
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Reporte_Bodega_${mesActual?.mes_nombre?.replace(' ', '_')}_${hoy()}.xlsx`;
      link.click();
      
      addToast('✅ Reporte Excel descargado correctamente', 'success');
    } catch (err) {
      console.error(err);
      addToast(err?.message ? `No se pudo generar el Excel: ${err.message}` : 'No se pudo generar el Excel', 'error');
    } finally {
      setLoadingGeneral(false);
    }
  };

  const totalVendido = pacasVendidas.reduce((sum, p) => sum + parseFloat(p.precio_venta || 0), 0);
  const totalCosto = pacasVendidas.reduce((sum, p) => sum + parseFloat(p.costo_base || 0), 0);
  const totalGanancia = ganancias.reduce((sum, g) => sum + parseFloat(g.ganancia || 0), 0);

  // Pantalla de error: sin ella se pintaban $0 en Total Vendido y Ganancia Neta,
  // que se leen como "este mes no se vendió nada".
  if (error) {
    return (
      <Layout title="Reportes" subtitle="Mensual">
        <Card className="border-2 border-error/30">
          <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="p-3 rounded-2xl bg-error/10">
              <AlertTriangle className="w-7 h-7 text-error" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-lg text-primary">No se pudieron cargar los reportes</p>
              <p className="text-sm text-muted mt-1">{error}</p>
              <p className="text-xs text-muted mt-2">
                No se muestran cifras para que no se confundan con ventas reales.
              </p>
            </div>
            <Button variant="secondary" icon={RefreshCw} onClick={loadReportes}>Reintentar</Button>
          </CardBody>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Reportes" subtitle={mesActual?.mes_nombre || 'Mensual'}>
      <div className="space-y-6">
        {/* Reporte Mensual Automatizado */}
        <Card className="border-2 border-secondary/20">
          <CardBody>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 sm:p-3 rounded-xl bg-secondary/15 flex-shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-secondary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg sm:text-xl text-primary truncate">Reporte Mensual</h3>
                    <p className="text-xs sm:text-sm text-muted truncate">
                      {mesActual?.fecha_inicio && mesActual?.fecha_fin
                        ? `Período: ${mesActual.fecha_inicio} al ${mesActual.fecha_fin}`
                        : loading ? 'Cargando período…' : 'Período no disponible'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={downloadExcel}
                    loading={loadingGeneral}
                    disabled={!reporteMensual}
                    icon={Download}
                    className="text-xs sm:text-sm"
                  >
                    <span className="hidden sm:inline">Descargar Excel</span>
                    <span className="sm:hidden">Excel</span>
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={loadReportes}
                    icon={RefreshCw}
                    className="text-xs sm:text-sm"
                  >
                    Actualizar
                  </Button>
                </div>
              </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-secondary"></div>
              </div>
            ) : reporteMensual ? (
              <div className="space-y-4">
                {/* Resumen Ejecutivo */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                  <div className="p-3 sm:p-4 bg-success/10 rounded-xl text-center min-w-0">
                    {/* total_ventas es el NÚMERO de ventas, no un importe: el
                        tooltip lo mostraba como "$12" pesos. */}
                    <p className="text-lg sm:text-2xl font-display text-success truncate" title={String(reporteMensual.resumen_ejecutivo?.total_ventas || 0)}>
                      {reporteMensual.resumen_ejecutivo?.total_ventas || 0}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Ventas</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-primary/10 rounded-xl text-center min-w-0">
                    <p className="text-lg sm:text-2xl font-display text-primary truncate" title={formatCurrency(reporteMensual.resumen_ejecutivo?.monto_total_ventas)}>
                      {formatCurrency(reporteMensual.resumen_ejecutivo?.monto_total_ventas)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Monto Total</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-secondary/15 rounded-xl text-center min-w-0">
                    <p className="text-lg sm:text-2xl font-display text-primary truncate" title={formatCurrency(reporteMensual.resumen_ejecutivo?.total_ganancia)}>
                      {formatCurrency(reporteMensual.resumen_ejecutivo?.total_ganancia)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Ganancia</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-accent/10 rounded-xl text-center min-w-0">
                    <p className="text-lg sm:text-2xl font-display text-accent truncate" title={formatCurrency(reporteMensual.resumen_ejecutivo?.saldo_cartera)}>
                      {formatCurrency(reporteMensual.resumen_ejecutivo?.saldo_cartera)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Cartera</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-success/10 rounded-xl text-center min-w-0">
                    <p className="text-lg sm:text-2xl font-display text-success truncate" title={String(reporteMensual.resumen_ejecutivo?.clientes_nuevos || 0)}>
                      {reporteMensual.resumen_ejecutivo?.clientes_nuevos || 0}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Clientes Nuevos</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-warning/10 rounded-xl text-center min-w-0">
                    <p className="text-lg sm:text-2xl font-display text-warning truncate" title={String(reporteMensual.resumen_ejecutivo?.pacas_vendidas || 0)}>
                      {reporteMensual.resumen_ejecutivo?.pacas_vendidas || 0}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Pacas Vendidas</p>
                  </div>
                </div>

                {/* Detalles */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="font-medium text-primary mb-2">Ventas del Mes</h4>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Fecha</th>
                            <th className="px-2 py-1 text-left">Cliente</th>
                            <th className="px-2 py-1 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reporteMensual.ventas?.slice(0, 10).map((v, i) => (
                            <tr key={i}>
                              <td className="px-2 py-1">{new Date(v.fecha).toLocaleDateString('es-MX')}</td>
                              <td className="px-2 py-1">
                                <RefLink to="/cartera" id={v.cliente_id} title="Ver cartera del cliente" icon={false}>{v.cliente_nombre}</RefLink>
                              </td>
                              <td className="px-2 py-1 text-right">{formatCurrency(v.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-primary mb-2">Pacas por Tipo</h4>
                    <div className="space-y-2">
                      {reporteMensual.pacas_por_tipo?.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <div>
                            <span className="font-medium">{p.clasificacion}</span>
                            <span className="text-muted text-sm ml-2">({p.referencia})</span>
                          </div>
                          <div className="text-right">
                            <span className="font-medium">{p.cantidad}</span>
                            <span className="text-muted text-sm ml-1">x {formatCurrency(p.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-sm font-medium text-primary">Todavía no hay movimientos este mes</p>
                <p className="text-xs text-muted mt-1">
                  En cuanto se registre la primera venta del mes, el reporte aparecerá aquí.
                </p>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Aviso cuando sólo fallaron los listados secundarios: sus tarjetas
            quedarían en 0 y se leerían como "no se vendió nada". */}
        {fallosListas?.secciones?.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-error/10 border border-error/30 rounded-xl" role="alert">
            <AlertTriangle className="w-5 h-5 text-error flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">
                No se pudieron consultar: {fallosListas.secciones.join(', ')}
              </p>
              <p className="text-xs text-muted mt-1">
                {fallosListas.motivo || 'Revisa tu conexión e inténtalo de nuevo.'} Estas cifras se muestran como «—» para que no se confundan con ventas reales.
              </p>
            </div>
            <Button variant="ghost" icon={RefreshCw} onClick={loadReportes} className="text-xs sm:text-sm">
              Reintentar
            </Button>
          </div>
        )}

        {/* Reportes Generales */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <Card hover className="animate-fade-in">
            <CardBody className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-success flex-shrink-0" />
                <h4 className="font-medium text-primary truncate">Pacas Vendidas</h4>
              </div>
              {/* "—" mientras carga o si la consulta falló: un 0 aquí se lee como
                  "no se vendió nada", que no es lo mismo que "no se pudo consultar". */}
              <p
                className="text-xl sm:text-2xl font-display text-primary truncate"
                title={loading || fallosListas?.pacas ? 'Dato no disponible' : String(pacasVendidas.length)}
              >
                {loading || fallosListas?.pacas ? '—' : pacasVendidas.length}
              </p>
              {!loading && fallosListas?.pacas && (
                <p className="text-[10px] text-muted mt-0.5">No se pudo consultar</p>
              )}
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in stagger-1">
            <CardBody className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-secondary flex-shrink-0" />
                <h4 className="font-medium text-primary truncate">Total Vendido</h4>
              </div>
              <p
                className="text-xl sm:text-2xl font-display text-primary truncate"
                title={loading || fallosListas?.pacas ? 'Dato no disponible' : formatCurrency(totalVendido)}
              >
                {loading || fallosListas?.pacas ? '—' : formatCurrency(totalVendido)}
              </p>
              {!loading && fallosListas?.pacas && (
                <p className="text-[10px] text-muted mt-0.5">No se pudo consultar</p>
              )}
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in stagger-2">
            <CardBody className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-success flex-shrink-0" />
                <h4 className="font-medium text-primary truncate">Ganancia Neta</h4>
              </div>
              <p
                className="text-xl sm:text-2xl font-display text-success truncate"
                title={loading || fallosListas?.ganancia ? 'Dato no disponible' : formatCurrency(totalGanancia)}
              >
                {loading || fallosListas?.ganancia ? '—' : formatCurrency(totalGanancia)}
              </p>
              {!loading && fallosListas?.ganancia && (
                <p className="text-[10px] text-muted mt-0.5">No se pudo consultar</p>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Detalles */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <Package className="w-5 h-5 text-primary" />
                <h3 className="font-display text-lg text-primary">Pacas Vendidas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-right">Venta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loading ? (
                      <TableSkeleton cols={4} rows={5} />
                    ) : fallosListas?.pacas ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-error">No se pudo consultar este listado</td></tr>
                    ) : pacasVendidas.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-muted">Sin datos</td></tr>
                    ) : (
                      pacasVendidas.slice(0, 10).map((p, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{new Date(p.fecha_venta).toLocaleDateString('es-MX')}</td>
                          <td className="px-3 py-2">{p.cliente}</td>
                          <td className="px-3 py-2">{p.clasificacion}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(p.precio_venta)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <div className="flex items-center gap-3 mb-4">
                <Users className="w-5 h-5 text-accent" />
                <h3 className="font-display text-lg text-primary">Clientes con Deuda</h3>
              </div>
              <div className="space-y-3">
                {loading ? (
                  <div className="text-center py-4">Cargando...</div>
                ) : fallosListas?.deudores ? (
                  <div className="text-center py-4 text-error">No se pudo consultar este listado</div>
                ) : deudores.length === 0 ? (
                  <div className="text-center py-4 text-muted">Sin deudores</div>
                ) : (
                  deudores.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg min-w-0">
                      <div className="min-w-0 flex-1 mr-2">
                        <RefLink to="/cartera" id={c.id} title="Ver cartera del cliente" icon={false} className="font-medium truncate">{c.nombre}</RefLink>
                        <p className="text-sm text-muted truncate">{c.ciudad || 'Sin ciudad'}</p>
                      </div>
                      <div className="text-right flex-shrink-0 min-w-0">
                        <p className="font-display text-accent text-sm sm:text-base break-all" title={formatCurrency(c.saldo_pendiente)}>
                          {formatCurrency(c.saldo_pendiente)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </Layout>
  );
}