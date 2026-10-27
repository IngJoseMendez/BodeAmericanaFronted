import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, Badge, TableSkeleton, RefLink } from '../components/common';
import { reportesApi, dashboardApi, carteraApi } from '../services/api';
import ExcelJS from 'exceljs';
import { FileText, Calendar, TrendingUp, Users, Package, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { hoy } from '../lib/fecha';
import { formatCOP } from '../lib/money';
import { descargarExcel } from '../lib/descargar';

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

  // LAS CIFRAS QUE DE VERDAD SE ENSENAN, con el legado ya puesto donde toca.
  //
  // `monto_total_ventas` es solo lo registrado en el sistema, y hoy eso es
  // cero: todo lo vendido en nueve anos entro por los libros de Excel. Leer esa
  // cifra a secas ponia $0 en la tarjeta de Monto Total con 57 ventas del mes
  // debajo. Aqui se arma una sola vez lo que la pantalla y el Excel usan, para
  // que el papel y la pantalla no puedan decir cosas distintas.
  //
  // Lo que NO se toca: ganancia y pacas vendidas. Las dos salen de la paca y su
  // costo, y un renglon de los libros no tiene paca detras. Se quedan con su
  // cifra del sistema y la tarjeta lo dice, que es muy distinto de inventarlas.
  const cifras = (() => {
    const r = reporteMensual?.resumen_ejecutivo || {};
    const sistema = Number(r.monto_total_ventas) || 0;
    const legado = Number(r.monto_ventas_cartera) || 0;
    return {
      // UNA venta es UNA venta, venga de donde venga: la cifra va junta.
      nVentas: (Number(r.total_ventas) || 0) + (Number(r.total_ventas_cartera) || 0),
      monto: sistema + legado,
      // De cuántas de esas ventas se puede calcular costo y margen. Es lo único
      // que hay que separar, y se usa para declarar el alcance de la ganancia,
      // no para partir la lista de ventas en dos.
      conCosto: Number(r.total_ventas) || 0,
      // Las unidades del mes, contando las de los libros.
      unidades: Number(r.unidades_vendidas) || 0,
      // Y lo de siempre, para las tres tarjetas de «Reportes generales».
      histUnidades: Number(r.historico?.unidades) || 0,
      histMonto: Number(r.historico?.monto) || 0,
      histConCosto: Number(r.historico?.con_costo) || 0,
    };
  })();

  // LAS VENTAS DEL MES, las dos clases en una sola lista y ordenadas por fecha.
  //
  // La tabla leia `reporteMensual.ventas` -las filas de la tabla `ventas`- y
  // salia en blanco debajo de una cifra que si existia: en octubre hay 57
  // ventas por 119.580.000, todas en los libros. Se juntan aqui, con `origen`
  // en cada fila para que se pueda decir de donde sale cada una, y la misma
  // lista alimenta la pantalla y el Excel: asi el papel no puede decir una cosa
  // y la pantalla otra.
  const ventasDelMes = (() => {
    const delSistema = (reporteMensual?.ventas || []).map((v, i) => ({
      clave: `s${v.id ?? i}`,
      origen: 'sistema',
      fecha: v.fecha,
      cliente_id: v.cliente_id,
      cliente_nombre: v.cliente_nombre || '',
      cliente_telefono: v.cliente_telefono || '',
      concepto: '',
      monto: Number(v.total) || 0,
    }));
    const deLosLibros = (reporteMensual?.ventas_cartera || []).map((m, i) => ({
      clave: `c${m.id ?? i}`,
      origen: 'cartera',
      fecha: m.fecha,
      cliente_id: m.cliente_id,
      cliente_nombre: m.cliente_nombre || '',
      cliente_telefono: m.cliente_telefono || '',
      concepto: m.descripcion || '',
      monto: Number(m.monto) || 0,
    }));
    // Por fecha descendente, que es como se lee un mes: lo último primero.
    return [...delSistema, ...deLosLibros]
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  })();

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
        // Las mismas cifras que la pantalla, del mismo sitio: cuando el Excel
        // leia `total_ventas` y `monto_total_ventas` a secas, el archivo salia
        // con 0 ventas por $0 debajo de una tabla con 57 filas.
        { label: 'Total de Ventas', value: cifras.nVentas, color: primaryColor },
        { label: 'Monto Total', value: fmt(cifras.monto), color: primaryColor },
        // Y la ganancia con raya cuando no hay con que calcularla, igual que en
        // pantalla: un $0 impreso en un reporte que alguien archiva es peor que
        // en una tarjeta, porque sobrevive a la explicacion.
        { label: 'Ganancia del Mes',
          value: cifras.conCosto === 0 ? 'sin costo registrado' : fmt(reporteMensual.resumen_ejecutivo?.total_ganancia),
          color: successColor },
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
      // «Concepto» y «Origen» en vez de «Factura» y «Tipo de pago»: un renglón
      // de los libros no tiene número de factura ni tipo de pago, y las dos
      // columnas salían vacías en todas las filas. El concepto sí trae lo que
      // dice el libro («MIXTA VERANO S/V»), que es lo que se busca al revisar.
      const ventasHeaders = ['Fecha', 'Cliente', 'Teléfono', 'Concepto', 'Origen', 'Total'];
      ws2.addTable({
        name: 'VentasTable',
        ref: 'A1',
        headerRow: true,
        style: {
          theme: 'none',
          showRowStripes: false,
        },
        columns: ventasHeaders.map(h => ({ name: h, filterButton: false })),
        rows: ventasDelMes.map(v => [
          String(v.fecha).slice(0, 10),
          v.cliente_nombre,
          v.cliente_telefono || '-',
          v.concepto || '-',
          v.origen === 'cartera' ? 'libro de Excel' : 'sistema',
          v.monto
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
      descargarExcel(buffer, `Reporte_Bodega_${mesActual?.mes_nombre?.replace(' ', '_')}_${hoy()}.xlsx`);
      
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

  // SI NO HAY NINGUNA VENTA CON PACAS, estas dos cifras no son cero: no existen.
  // Las dos salen del inventario del sistema -lo que se vendio de las pacas
  // registradas-, y mientras no haya salido ninguna, un $0 aqui contradice al
  // Monto Total de arriba, que cuenta todas las ventas del mes. Dos tarjetas con
  // el mismo nombre diciendo cosas opuestas, y la de arriba es la buena.
  const sinPacasVendidas = pacasVendidas.length === 0;
  const sinGanancia = ganancias.length === 0;

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
                    <p className="text-lg sm:text-2xl font-display text-success truncate" title={String(cifras.nVentas)}>
                      {cifras.nVentas}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Ventas</p>

                  </div>
                  <div className="p-3 sm:p-4 bg-primary/10 rounded-xl text-center min-w-0">
                    <p className="text-lg sm:text-2xl font-display text-primary truncate" title={formatCurrency(cifras.monto)}>
                      {formatCurrency(cifras.monto)}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Monto Total</p>

                  </div>
                  <div className="p-3 sm:p-4 bg-secondary/15 rounded-xl text-center min-w-0">
                    {/* «GANAMOS CERO» Y «NO SABEMOS CUÁNTO GANAMOS» SON COSAS
                        DISTINTAS, y la segunda se escribe con una raya.
                        La ganancia sale del costo de la paca. Las ventas que se
                        cargaron del Excel no traen costo, así que cuando ninguna
                        venta del mes lo tiene, la suma recorre una lista vacía y
                        da 0. Pintar $0 ahí diría que se vendieron 119 millones
                        sin ganar un peso, que es una afirmación que nadie hizo.
                        Cuando sí hay ventas con costo, la cifra se enseña y
                        debajo se dice de cuántas sale. */}
                    {cifras.conCosto === 0 ? (
                      <>
                        <p className="text-lg sm:text-2xl font-display text-muted truncate"
                           title="Ninguna venta de este mes tiene el costo de la mercancía registrado, así que no hay ganancia que calcular. No significa que se haya ganado cero.">
                          —
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted truncate">Ganancia</p>
                        <p className="text-[9px] text-muted/80 truncate"
                           title="Las ventas cargadas de los libros de Excel no traen el costo de la mercancía. En cuanto se registre una venta por el sistema, aquí aparece su ganancia.">
                          sin costo registrado
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg sm:text-2xl font-display text-primary truncate" title={formatCurrency(reporteMensual.resumen_ejecutivo?.total_ganancia)}>
                          {formatCurrency(reporteMensual.resumen_ejecutivo?.total_ganancia)}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted truncate">Ganancia</p>
                        {cifras.conCosto < cifras.nVentas && (
                          <p className="text-[9px] text-muted/80 truncate"
                             title={`De las ${cifras.nVentas} ventas del mes, ${cifras.conCosto} tienen el costo de la mercancía registrado. La ganancia es la de esas; las demás se cargaron de los libros sin costo.`}>
                            de {cifras.conCosto} venta{cifras.conCosto === 1 ? '' : 's'} con costo
                          </p>
                        )}
                      </>
                    )}
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
                    <p className="text-lg sm:text-2xl font-display text-warning truncate" title={String(cifras.unidades)}>
                      {cifras.unidades}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted truncate">Unidades Vendidas</p>
                    {/* LAS UNIDADES SÍ SE PUEDEN SABER, y antes ponía una raya
                        diciendo que no. Un renglón de los libros es una paca -la
                        mediana del renglón y la de una paca son las dos
                        1.600.000- y los que llevan varias lo dicen: «MIXTA
                        VERANO PREMIUM x10». De ahí salen. Lo que no se puede
                        saber de ellas es el costo, y eso lo dice la tarjeta de
                        ganancia, no esta. */}
                    {cifras.conCosto < cifras.nVentas && (
                      <p className="text-[9px] text-muted/80 truncate"
                         title="Las de los libros se cuentan como una paca por renglón, salvo las que dicen cuántas («x10»). Se comprueba dividiendo el monto entre las unidades: tiene que dar un precio de paca.">
                        derivadas de los libros
                      </p>
                    )}
                  </div>
                </div>

                {/* Detalles */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="font-medium text-primary mb-2">
                      Ventas del Mes
                      <span className="ml-2 text-xs font-normal text-muted">({ventasDelMes.length})</span>
                    </h4>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">Fecha</th>
                            <th className="px-2 py-1 text-left">Cliente</th>
                            <th className="px-2 py-1 text-left">Concepto</th>
                            <th className="px-2 py-1 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {ventasDelMes.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-2 py-4 text-center text-muted">
                                No hay ventas en el mes.
                              </td>
                            </tr>
                          )}
                          {ventasDelMes.slice(0, 15).map((v) => (
                            <tr key={v.clave}>
                              <td className="px-2 py-1 whitespace-nowrap">{String(v.fecha).slice(0, 10)}</td>
                              <td className="px-2 py-1">
                                <RefLink to="/cartera" id={v.cliente_id} title="Ver cartera del cliente" icon={false}>{v.cliente_nombre}</RefLink>
                              </td>
                              <td className="px-2 py-1 text-xs text-muted max-w-[14rem] truncate" title={v.concepto}>
                                {v.concepto || (v.origen === 'sistema' ? 'venta del sistema' : '—')}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap">{formatCurrency(v.monto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {ventasDelMes.length > 15 && (
                      <p className="text-[11px] text-muted mt-1">
                        se muestran las 15 más recientes de {ventasDelMes.length}; el Excel trae todas
                      </p>
                    )}
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
                <h4 className="font-medium text-primary truncate">Unidades Vendidas</h4>
              </div>
              {/* "—" mientras carga o si la consulta falló: un 0 aquí se lee como
                  "no se vendió nada", que no es lo mismo que "no se pudo consultar". */}
              {/* LAS UNIDADES DE SIEMPRE, no las del sistema. Esta tarjeta
                  leía la lista de pacas vendidas por el sistema, que está
                  vacía, así que marcaba 0 con nueve años de ventas en la base.
                  Un renglón de los libros es una paca y los que llevan varias
                  lo dicen; de ahí salen las 8.076. */}
              <p
                className="text-xl sm:text-2xl font-display text-primary truncate"
                title={loading ? 'Cargando…' : `${cifras.histUnidades} unidades vendidas en total`}
              >
                {loading ? '—' : cifras.histUnidades.toLocaleString('es-CO')}
              </p>
              {!loading && pacasVendidas.length > 0 && (
                <p className="text-[10px] text-muted mt-0.5">
                  {pacasVendidas.length} del inventario del sistema
                </p>
              )}
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in stagger-1">
            <CardBody className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-secondary flex-shrink-0" />
                <h4 className="font-medium text-primary truncate">Total Vendido</h4>
              </div>
              {/* EL TOTAL VENDIDO SÍ SE SABE, y antes ponía una raya. Son los
                  16.947.771.681 de los nueve años, de los cuales 16.741.274.500
                  son mercancía y el resto fletes y saldos de arrastre. Lo que no
                  se sabe es el costo, y eso lo dice la tarjeta de al lado. */}
              <p
                className="text-xl sm:text-2xl font-display text-primary truncate"
                title={loading ? 'Cargando…' : formatCurrency(cifras.histMonto)}
              >
                {loading ? '—' : formatCurrency(cifras.histMonto)}
              </p>
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in stagger-2">
            <CardBody className="min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-success flex-shrink-0" />
                <h4 className="font-medium text-primary truncate">Ganancia Neta</h4>
              </div>
              {/* ESTA SÍ SE QUEDA CON LA RAYA, y es la única. El monto y las
                  unidades se derivan de los libros; el COSTO no está escrito en
                  ninguna parte de ellos, así que no hay margen que calcular.
                  «Ganamos cero» y «no sabemos cuánto ganamos» son cosas
                  distintas. */}
              <p
                className="text-xl sm:text-2xl font-display text-success truncate"
                title={loading || fallosListas?.ganancia
                  ? 'Dato no disponible'
                  : sinGanancia
                    ? `De las ${cifras.histConCosto} ventas con costo registrado. Los libros de Excel no traen el costo de la mercancía, así que de esas ventas no hay ganancia que calcular.`
                    : formatCurrency(totalGanancia)}
              >
                {loading || fallosListas?.ganancia || sinGanancia ? '—' : formatCurrency(totalGanancia)}
              </p>
              {!loading && fallosListas?.ganancia && (
                <p className="text-[10px] text-muted mt-0.5">No se pudo consultar</p>
              )}
              {!loading && !fallosListas?.ganancia && sinGanancia && (
                <p className="text-[10px] text-muted mt-0.5">los libros no traen el costo</p>
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