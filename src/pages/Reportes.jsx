import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, useToast, Badge } from '../components/common';
import { reportesApi, dashboardApi, carteraApi } from '../services/api';
import ExcelJS from 'exceljs';
import { FileText, Calendar, TrendingUp, Users, Package, Download, RefreshCw } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value || 0);
};

export default function Reportes() {
  const [loading, setLoading] = useState(true);
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [reporteMensual, setReporteMensual] = useState(null);
  const [mesActual, setMesActual] = useState(null);
  const [pacasVendidas, setPacasVendidas] = useState([]);
  const [ganancias, setGanancias] = useState([]);
  const [deudores, setDeudores] = useState([]);
  const { addToast } = useToast();

  useEffect(() => {
    loadReportes();
  }, []);

  const loadReportes = async () => {
    setLoading(true);
    try {
      const [reporteData, mesData] = await Promise.all([
        reportesApi.getMensual(),
        reportesApi.getMesActual()
      ]);
      
      setReporteMensual(reporteData);
      setMesActual(mesData);
      
      const [pacasData, gananciaData, deudoresData] = await Promise.all([
        dashboardApi.getPacasVendidas({}),
        dashboardApi.getGanancia({}),
        carteraApi.getDeudores()
      ]);

      setPacasVendidas(pacasData);
      setGanancias(gananciaData);
      setDeudores(deudoresData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    if (!reporteMensual) return;
    setLoadingGeneral(true);
    
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Bodega Americana';
      wb.created = new Date();
      
      // Colors
      const primaryColor = '1a1a2e';
      const secondaryColor = 'd4a373';
      const accentColor = 'bc4749';
      const successColor = '6a994e';
      const lightBg = 'faf8f5';
      
      // Helper function for currency
      const fmt = (val) => formatCurrency(val);
      
      // ============ HOJA 1: RESUMEN EJECUTIVO ============
      const ws1 = wb.addWorksheet('Resumen');
      ws1.properties.tabColor = secondaryColor;
      
      // Title
      ws1.mergeCells('A1:D1');
      const titleCell = ws1.getCell('A1');
      titleCell.value = '📦 BODEGA AMERICANA';
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
          p.tipo?.toUpperCase(),
          p.categoria?.toUpperCase(),
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
      link.download = `Reporte_Bodega_${mesActual?.mes_nombre?.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      
      addToast('✅ Reporte Excel descargado correctamente', 'success');
    } catch (err) {
      console.error(err);
      addToast('Error al descargar reporte', 'error');
    } finally {
      setLoadingGeneral(false);
    }
  };

  const totalVendido = pacasVendidas.reduce((sum, p) => sum + parseFloat(p.precio_venta || 0), 0);
  const totalCosto = pacasVendidas.reduce((sum, p) => sum + parseFloat(p.costo_base || 0), 0);
  const totalGanancia = ganancias.reduce((sum, g) => sum + parseFloat(g.ganancia || 0), 0);

  return (
    <Layout title="Reportes" subtitle={mesActual?.mes_nombre || 'Mensual'}>
      <div className="space-y-6">
        {/* Reporte Mensual Automatizado */}
        <Card className="border-2 border-secondary/20">
          <CardBody>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-secondary/15">
                  <FileText className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <h3 className="font-display text-xl text-primary">Reporte Mensual</h3>
                  <p className="text-sm text-muted">
                    Período: {mesActual?.fecha_inicio} al {mesActual?.fecha_fin}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="secondary" 
                  onClick={downloadExcel}
                  loading={loadingGeneral}
                  icon={Download}
                >
                  Descargar Excel
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={loadReportes}
                  icon={RefreshCw}
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="p-4 bg-success/10 rounded-xl text-center">
                    <p className="text-2xl font-display text-success">{reporteMensual.resumen_ejecutivo?.total_ventas || 0}</p>
                    <p className="text-xs text-muted">Ventas</p>
                  </div>
                  <div className="p-4 bg-primary/10 rounded-xl text-center">
                    <p className="text-2xl font-display text-primary">{formatCurrency(reporteMensual.resumen_ejecutivo?.monto_total_ventas)}</p>
                    <p className="text-xs text-muted">Monto Total</p>
                  </div>
                  <div className="p-4 bg-secondary/15 rounded-xl text-center">
                    <p className="text-2xl font-display text-primary">{formatCurrency(reporteMensual.resumen_ejecutivo?.total_ganancia)}</p>
                    <p className="text-xs text-muted">Ganancia</p>
                  </div>
                  <div className="p-4 bg-accent/10 rounded-xl text-center">
                    <p className="text-2xl font-display text-accent">{formatCurrency(reporteMensual.resumen_ejecutivo?.saldo_cartera)}</p>
                    <p className="text-xs text-muted">Cartera</p>
                  </div>
                  <div className="p-4 bg-success/10 rounded-xl text-center">
                    <p className="text-2xl font-display text-success">{reporteMensual.resumen_ejecutivo?.clientes_nuevos || 0}</p>
                    <p className="text-xs text-muted">Clientes Nuevos</p>
                  </div>
                  <div className="p-4 bg-warning/10 rounded-xl text-center">
                    <p className="text-2xl font-display text-warning">{reporteMensual.resumen_ejecutivo?.pacas_vendidas || 0}</p>
                    <p className="text-xs text-muted">Pacas Vendidas</p>
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
                              <td className="px-2 py-1">{v.cliente_nombre}</td>
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
                            <span className="font-medium">{p.tipo}</span>
                            <span className="text-muted text-sm ml-2">({p.categoria})</span>
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
              <p className="text-center text-muted py-4">No hay datos disponibles</p>
            )}
          </CardBody>
        </Card>

        {/* Reportes Generales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card hover className="animate-fade-in">
            <CardBody>
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-success" />
                <h4 className="font-medium text-primary">Pacas Vendidas</h4>
              </div>
              <p className="text-2xl font-display text-primary">{pacasVendidas.length}</p>
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in stagger-1">
            <CardBody>
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-secondary" />
                <h4 className="font-medium text-primary">Total Vendido</h4>
              </div>
              <p className="text-2xl font-display text-primary">{formatCurrency(totalVendido)}</p>
            </CardBody>
          </Card>

          <Card hover className="animate-fade-in stagger-2">
            <CardBody>
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-success" />
                <h4 className="font-medium text-primary">Ganancia Neta</h4>
              </div>
              <p className="text-2xl font-display text-success">{formatCurrency(totalGanancia)}</p>
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
                      <tr><td colSpan={4} className="px-3 py-4 text-center">Cargando...</td></tr>
                    ) : pacasVendidas.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-muted">Sin datos</td></tr>
                    ) : (
                      pacasVendidas.slice(0, 10).map((p, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{new Date(p.fecha_venta).toLocaleDateString('es-MX')}</td>
                          <td className="px-3 py-2">{p.cliente}</td>
                          <td className="px-3 py-2">{p.tipo}</td>
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
                ) : deudores.length === 0 ? (
                  <div className="text-center py-4 text-muted">Sin deudores</div>
                ) : (
                  deudores.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-primary">{c.nombre}</p>
                        <p className="text-sm text-muted">{c.ciudad || 'Sin ciudad'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-display text-accent">{formatCurrency(c.saldo_pendiente)}</p>
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