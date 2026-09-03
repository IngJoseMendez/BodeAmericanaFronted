import jsPDF from 'jspdf';
import 'jspdf-autotable';

const formatNum = (v) => (parseInt(v) || 0).toLocaleString('es-CO');
const formatCOP = (v) => '$' + (parseFloat(v) || 0).toLocaleString('es-CO');

export async function exportarPDFBodega(sel, data, totales, fileName) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  let pageAdded = false;

  const addTitle = (title) => {
    if (pageAdded) doc.addPage();
    doc.setFontSize(14);
    doc.text(title, 40, 40);
    pageAdded = true;
  };

  if (sel.includes('DESPACHO(BODEGA)')) {
    addTitle(`DESPACHOS (EN PROCESO) - Vienen: ${totales.vienen} / Salen: ${totales.salen} / Quedan: ${totales.quedan}`);
    const rows = [];
    for (const d of data.despachos) {
      let first = true;
      for (const g of d.grupos) {
        rows.push([
          first ? (d.nombre || '') : '',
          first ? (d.ciudad || '') : '',
          first ? (d.transporte || '') : '',
          g.categoria, g.clasificacion, g.referencia, g.calidad, g.cantidad
        ]);
        first = false;
      }
    }
    doc.autoTable({
      startY: 60,
      head: [['CLIENTE', 'CIUDAD', 'TRANSPORTE', 'CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'CANT']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [42, 157, 143] }
    });
  }

  if (sel.includes('SEPARADAS(BODEGA)')) {
    addTitle(`MERCANCIA SEPARADA`);
    const rows = [];
    for (const c of data.separadas) {
      let first = true;
      for (const g of c.grupos) {
        rows.push([
          first ? (c.nombre || '') : '',
          g.categoria, g.clasificacion, g.referencia, g.calidad, g.cantidad
        ]);
        first = false;
      }
    }
    doc.autoTable({
      startY: 60,
      head: [['CLIENTE', 'CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'CANT']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [244, 162, 97] }
    });
  }

  if (sel.includes('INVENTARIO(BODEGA)')) {
    addTitle(`INVENTARIO (BODEGA)`);
    const rows = data.inventario.map(f => [
      f.categoria, f.clasificacion, f.referencia, f.calidad,
      f.fisico, f.separadas, f.disponibles
    ]);
    doc.autoTable({
      startY: 60,
      head: [['CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'FISICO', 'SEPARADA', 'DISP']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [38, 70, 83] }
    });
  }

  if (!pageAdded) {
    doc.text("No data selected", 40, 40);
  }

  doc.save(`${fileName}.pdf`);
}

export async function exportarPDFInternos(sel, data, fileName) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  let pageAdded = false;


  const addTitle = (title) => {
    if (pageAdded) doc.addPage();
    doc.setFontSize(14);
    doc.text(title, 40, 40);
    pageAdded = true;
  };

  if (sel.includes('INVENTARIO(INTERNO)')) {
    addTitle(`INVENTARIO (INTERNO)`);
    const rows = data.inventario.map(f => [
      f.categoria, f.clasificacion, f.referencia, f.calidad,
      formatCOP(parseFloat(f.precio_minimo) || parseFloat(f.costo_unitario)), formatCOP(f.precio_unitario),
      f.disponibles
    ]);
    doc.autoTable({
      startY: 60,
      head: [['CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'DISP']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [231, 111, 81] }
    });
  }

  if (sel.includes('CARTERA(INTERNA)')) {
    addTitle(`CARTERA (INTERNA)`);
    const rows = data.cartera.map(c => [
      c.nombre, formatCOP(c.limite_credito), c.dias_credito, formatCOP(c.saldo), formatCOP(c.vencido)
    ]);
    doc.autoTable({
      startY: 60,
      head: [['CLIENTE', 'LIMITE', 'DIAS', 'SALDO', 'VENCIDO']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [231, 111, 81] }
    });
  }

  if (!pageAdded) {
    doc.text("No data selected or missing PDF mapping for selected pages", 40, 40);
  }

  doc.save(`${fileName}.pdf`);
}
