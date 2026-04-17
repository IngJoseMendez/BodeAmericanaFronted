import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Badge, Modal, Button, useToast } from '../components/common';
import { pedidosApi } from '../services/api';
import ExcelJS from 'exceljs';
import html2pdf from 'html2pdf.js';
import { Package, Clock, CheckCircle, XCircle, ShoppingCart, FileSpreadsheet, Download } from 'lucide-react';

export default function MisPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [detallePedido, setDetallePedido] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    loadPedidos();
  }, []);

  const loadPedidos = async () => {
    try {
      const data = await pedidosApi.getAll();
      setPedidos(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const abrirDetalle = async (pedidoId) => {
    try {
      setLoadingDetalle(true);
      const data = await pedidosApi.getOne(pedidoId);
      setDetallePedido(data);
      setPedidoSeleccionado(pedidoId);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingDetalle(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  };

  const getEstadoBadge = (estado) => {
    const variants = {
      pendiente: 'warning',
      aprobado: 'success',
      rechazado: 'error',
      convertido: 'success'
    };
    const labels = {
      pendiente: 'Pendiente',
      aprobado: 'Aprobado',
      rechazado: 'Rechazado',
      convertido: 'Completado'
    };
    return <Badge variant={variants[estado] || 'default'}>{labels[estado] || estado}</Badge>;
  };

  const getEstadoIcon = (estado) => {
    switch (estado) {
      case 'pendiente': return <Clock className="w-5 h-5 text-warning" />;
      case 'aprobado': return <CheckCircle className="w-5 h-5 text-success" />;
      case 'rechazado': return <XCircle className="w-5 h-5 text-error" />;
      case 'convertido': return <ShoppingCart className="w-5 h-5 text-success" />;
      default: return <Clock className="w-5 h-5 text-muted" />;
    }
  };

  const exportarExcel = async () => {
    if (!detallePedido) return;
    
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Bodega Americana';
      wb.created = new Date();
      
      const primaryColor = '1a1a2e';
      const secondaryColor = 'd4a373';
      
      const ws = wb.addWorksheet('Pedido');
      ws.properties.tabColor = secondaryColor;
      
      ws.mergeCells('A1:E1');
      const titleCell = ws.getCell('A1');
      titleCell.value = '📦 BODEGA AMERICANA - Detalle de Pedido';
      titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 28;
      
      ws.mergeCells('A2:E2');
      ws.getCell('A2').value = `Pedido #${detallePedido.id}`;
      ws.getCell('A2').font = { size: 14, bold: true };
      ws.getCell('A2').alignment = { horizontal: 'center' };
      
      ws.mergeCells('A3:E3');
      ws.getCell('A3').value = `Fecha: ${new Date(detallePedido.created_at).toLocaleDateString('es-MX')}`;
      ws.getCell('A3').font = { size: 10, italic: true, color: { argb: '666666' } };
      ws.getCell('A3').alignment = { horizontal: 'center' };
      
      ws.getColumn(1).width = 20;
      ws.getColumn(2).width = 18;
      ws.getColumn(3).width = 15;
      ws.getColumn(4).width = 15;
      ws.getColumn(5).width = 18;
      
      let row = 5;
      
      const estadoLabels = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', convertido: 'Completado' };
      
      ws.getCell(`A${row}`).value = 'Estado:';
      ws.getCell(`A${row}`).font = { bold: true };
      ws.getCell(`B${row}`).value = estadoLabels[detallePedido.estado] || detallePedido.estado;
      ws.getCell(`B${row}`).font = { bold: true, color: { argb: detallePedido.estado === 'convertido' ? '6a994e' : detallePedido.estado === 'pendiente' ? 'd4a373' : 'bc4749' } };
      row++;
      
      ws.getCell(`A${row}`).value = 'Notas:';
      ws.getCell(`A${row}`).font = { bold: true };
      ws.getCell(`B${row}`).value = detallePedido.notas || 'Sin notas';
      ws.mergeCells(`B${row}:E${row}`);
      row += 2;
      
      ws.getCell(`A${row}`).value = 'Detalles del Pedido';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      ws.mergeCells(`A${row}:E${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      const headers = ['Paca UUID', 'Tipo', 'Categoría', 'Precio Unitario', 'Subtotal'];
      headers.forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${row}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondaryColor } };
        cell.alignment = { horizontal: 'center' };
      });
      row++;
      
      for (const d of (detallePedido.detalles || [])) {
        ws.getCell(`A${row}`).value = d.paca_uuid?.slice(0, 8) || '-';
        ws.getCell(`B${row}`).value = d.tipo || '-';
        ws.getCell(`C${row}`).value = d.categoria || '-';
        ws.getCell(`D${row}`).value = parseFloat(d.precio);
        ws.getCell(`D${row}`).numFmt = '$#,##0.00';
        ws.getCell(`E${row}`).value = parseFloat(d.precio);
        ws.getCell(`E${row}`).numFmt = '$#,##0.00';
        ws.getCell(`E${row}`).font = { bold: true };
        row++;
      }
      
      row++;
      ws.getCell(`A${row}`).value = 'TOTAL:';
      ws.getCell(`A${row}`).font = { bold: true, size: 12 };
      ws.getCell(`E${row}`).value = detallePedido.total_estimado;
      ws.getCell(`E${row}`).numFmt = '$#,##0.00';
      ws.getCell(`E${row}`).font = { bold: true, size: 14, color: { argb: primaryColor } };
      ws.getCell(`E${row}`).alignment = { horizontal: 'right' };
      
      row += 2;
      ws.getCell(`A${row}`).value = `Documento generado el ${new Date().toLocaleString('es-MX')}`;
      ws.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: '999999' } };
      ws.mergeCells(`A${row}:E${row}`);
      
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Pedido_${detallePedido.id}_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      
      addToast('Excel descargado', 'success');
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };
  
  const exportarPDF = async () => {
    if (!detallePedido) return;
    
    const estadoLabels = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', convertido: 'Completado' };
    
    const contenido = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Pedido #${detallePedido.id}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #1a1a2e; }
          .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #d4a373; }
          .header h1 { color: #1a1a2e; font-size: 22px; }
          .info { background: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .info-label { font-weight: bold; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
          .status.pendiente { background: #d4a373; color: white; }
          .status.convertido { background: #6a994e; color: white; }
          .status.rechazado { background: #bc4749; color: white; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1a1a2e; color: white; padding: 12px; text-align: left; font-size: 12px; }
          td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
          .total-row { background: #f5f5f5; font-weight: bold; font-size: 14px; }
          .footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📦 BODEGA AMERICANA</h1>
          <p>Detalle de Pedido</p>
        </div>
        
        <div class="info">
          <div class="info-row">
            <span class="info-label">Pedido #:</span>
            <span>${detallePedido.id}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Fecha:</span>
            <span>${new Date(detallePedido.created_at).toLocaleDateString('es-MX')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Estado:</span>
            <span class="status ${detallePedido.estado}">${estadoLabels[detallePedido.estado] || detallePedido.estado}</span>
          </div>
          ${detallePedido.notas ? `
          <div class="info-row">
            <span class="info-label">Notas:</span>
            <span>${detallePedido.notas}</span>
          </div>
          ` : ''}
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Paca</th>
              <th>Tipo</th>
              <th>Categoría</th>
              <th style="text-align:right">Precio</th>
            </tr>
          </thead>
          <tbody>
            ${(detallePedido.detalles || []).map(d => `
              <tr>
                <td>${d.paca_uuid?.slice(0, 8) || '-'}</td>
                <td>${d.tipo || '-'}</td>
                <td>${d.categoria || '-'}</td>
                <td style="text-align:right">${formatCurrency(d.precio)}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3" style="text-align:right">TOTAL:</td>
              <td style="text-align:right">${formatCurrency(detallePedido.total_estimado)}</td>
            </tr>
          </tbody>
        </table>
        
        <div class="footer">
          Documento generado el ${new Date().toLocaleString('es-MX')}
        </div>
      </body>
      </html>
    `;
    
    const opt = {
      margin:       10,
      filename:     `Pedido_${detallePedido.id}_${new Date().toISOString().split('T')[0]}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
    };
    
    const element = document.createElement('div');
    element.innerHTML = contenido;
    
    html2pdf().set(opt).from(element).save().then(() => {
      addToast('PDF descargado', 'success');
    }).catch(err => {
      addToast('Error al generar PDF', 'error');
    });
  };

  return (
    <Layout title="Mis Pedidos" subtitle="Historial de pedidos">
      <div className="space-y-4">
        {loading ? (
          <Card>
            <CardBody className="text-center text-muted">Cargando...</CardBody>
          </Card>
        ) : pedidos.length === 0 ? (
          <Card>
            <CardBody className="text-center text-muted">No tienes pedidos</CardBody>
          </Card>
        ) : (
          pedidos.map((pedido) => (
            <Card key={pedido.id} hover className="cursor-pointer" onClick={() => abrirDetalle(pedido.id)}>
              <CardBody className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {getEstadoIcon(pedido.estado)}
                  <div>
                    <p className="font-medium text-primary">Pedido #{pedido.id}</p>
                    <p className="text-sm text-muted">
                      {new Date(pedido.created_at).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{formatCurrency(pedido.total_estimado)}</p>
                  {getEstadoBadge(pedido.estado)}
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={!!detallePedido} onClose={() => { setDetallePedido(null); setPedidoSeleccionado(null); }} title={`Pedido #${detallePedido?.id}`} size="lg">
        {detallePedido && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg">
              <div>
                <p className="text-sm text-muted">Estado</p>
                <div className="mt-1">{getEstadoBadge(detallePedido.estado)}</div>
              </div>
              <div>
                <p className="text-sm text-muted">Fecha</p>
                <p className="font-medium">{new Date(detallePedido.created_at).toLocaleDateString('es-MX')}</p>
              </div>
            </div>

            {detallePedido.notas && (
              <div>
                <p className="text-sm text-muted mb-1">Notas</p>
                <p className="p-3 bg-gray-50 rounded-lg">{detallePedido.notas}</p>
              </div>
            )}

            <div>
              <p className="font-medium text-primary mb-2">Detalles del Pedido</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Paca</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Categoría</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(detallePedido.detalles || []).map((d, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-muted font-mono text-xs">{d.paca_uuid?.slice(0, 8) || '-'}</td>
                        <td className="px-3 py-2">{d.tipo || '-'}</td>
                        <td className="px-3 py-2">{d.categoria || '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(d.precio)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-primary/5">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-right font-bold">TOTAL</td>
                      <td className="px-3 py-2 text-right font-bold text-lg text-primary">{formatCurrency(detallePedido.total_estimado)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={exportarExcel} icon={FileSpreadsheet}>
                Excel
              </Button>
              <Button variant="secondary" onClick={exportarPDF} icon={Download}>
                PDF
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}