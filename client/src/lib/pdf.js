import jsPDF from 'jspdf';
import 'jspdf-autotable';

const formatNum = (v) => (parseInt(v) || 0).toLocaleString('es-CO');
const formatCOP = (v) => '$' + (parseFloat(v) || 0).toLocaleString('es-CO');

// Fecha corta dd/mm/aaaa recortando la cadena que manda el servidor, SIN pasar
// por `new Date(...)`. Es la trampa de siempre de este proyecto: una fecha de
// solo día se lee como medianoche UTC y en Colombia retrocede un día al
// pintarla, así que el papel diría «11/08» al lado de los «29 días» contados
// desde el 12 y por teléfono se le daría al cliente una fecha equivocada.
const formatFechaCorta = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

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

  // FALTANTES(BODEGA) — POR QUÉ SÍ ESTÁ AQUÍ, para que nadie lo quite.
  //
  // Esta hoja se declara en el grupo 'bodega' de Entregables.jsx y este
  // generador pregunta hoja por hoja con `sel.includes(...)`: un nombre que no
  // conoce lo ignora sin romper nada y sin avisar. Mientras faltó este bloque
  // había DOS entregables llamados «Para la bodega» con contenido distinto según
  // se pulsara Excel o PDF, y la casilla de FALTANTES quedaba marcada en la
  // pantalla sin efecto ninguno. Eso es exactamente la clase de fallo que no
  // duele hasta que alguien imprime el PDF creyendo que lleva los faltantes.
  //
  // Se consideró la salida contraria —dejarla fuera porque el PDF es para la
  // bodega física y los faltantes son información de oficina— y se descartó: el
  // grupo entero es el mismo público y la misma decisión ya está tomada del otro
  // lado. FALTANTES vive en 'bodega' y no en 'internos' precisamente porque
  // lleva precios de VENTA que el cliente ya conoce y ni un solo costo ni
  // margen. Si sale en el Excel de bodega, sale en el PDF de bodega; y el PDF es
  // el formato que de verdad se imprime, que es como ella llama a los clientes.
  //
  // Lo que sigue Excel-only a propósito de otro encargo es MATRIZ: también se
  // declara en el grupo y este generador tampoco la conoce. No se toca aquí
  // porque no es parte de este arreglo — queda anotado para que no se confunda
  // con un olvido nuevo.
  if (sel.includes('FALTANTES(BODEGA)')) {
    // `data.faltantes` es el arreglo de dentro de la respuesta de
    // GET /api/matriz/faltantes, o null si la consulta se cayó. La distinción es
    // la regla de oro del módulo y aquí pesa más que en ningún sitio: un PDF se
    // imprime y se queda encima de la mesa. Una tabla vacía en papel se lee como
    // «no le debes nada a nadie», así que cuando no hay dato el papel lo dice con
    // todas las letras en vez de enseñar una tabla en blanco.
    const filas = Array.isArray(data.faltantes) ? [...data.faltantes] : null;
    addTitle('LO QUE QUEDO FALTANDO');
    doc.setFontSize(9);
    doc.text(
      'PRECIO y VALOR van al precio de cuando se pidio, no al de hoy. FALTA es lo que todavia se le queda debiendo.',
      40, 58
    );

    if (!filas) {
      doc.setFontSize(11);
      doc.text(
        'NO SE PUDO LEER LO QUE QUEDO FALTANDO. Esta pagina esta vacia porque no llegaron los datos,',
        40, 84
      );
      doc.text('NO porque no se le quede debiendo nada a nadie.', 40, 100);
    } else if (filas.length === 0) {
      doc.setFontSize(11);
      doc.text('No se le esta quedando debiendo mercancia a nadie.', 40, 84);
    } else {
      // Mismo orden que la hoja de Excel —por cliente y, dentro del cliente, lo
      // más viejo primero—, porque son el mismo entregable en dos formatos: si
      // las filas salieran en otro orden, cotejar el papel contra la pantalla
      // dejaría de ser posible justo cuando alguien reclama.
      filas.sort((a, b) =>
        String(a.cliente_nombre ?? '').localeCompare(String(b.cliente_nombre ?? ''), 'es')
        || (parseInt(a.cliente_id) || 0) - (parseInt(b.cliente_id) || 0)
        || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      );
      const rows = filas.map(f => [
        f.cliente_nombre || '',
        f.cliente_ciudad ?? f.ciudad ?? '',
        // El celular va como texto tal cual llega: es el dato con el que se marca.
        f.cliente_telefono ?? f.telefono ?? '',
        f.referencia || '', f.calidad || '',
        formatNum(f.cantidad_original), formatNum(f.cantidad_saldada), formatNum(f.cantidad_abierta),
        formatCOP(f.precio_unitario_origen),
        formatCOP((parseInt(f.cantidad_abierta) || 0) * (parseFloat(f.precio_unitario_origen) || 0)),
        formatFechaCorta(f.created_at), formatNum(f.dias_abierto), formatNum(f.veces_aplazado),
      ]);
      doc.autoTable({
        startY: 72,
        head: [['CLIENTE', 'CIUDAD', 'CELULAR', 'REFERENCIA', 'CALIDAD',
                'PIDIO', 'RECIBIO', 'FALTA', 'PRECIO', 'VALOR', 'DESDE', 'DIAS', 'REPARTOS']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 7 },
        // Ámbar de la casa (--color-warning): es el color del faltante en toda la
        // aplicación y el mismo con el que la hoja de Excel pinta la columna
        // FALTA. En rojo no, que aquí significa «esto salió mal», y quedar
        // faltando no es un fallo sino el hecho que se está registrando.
        headStyles: { fillColor: [217, 119, 6] }
      });
    }
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
