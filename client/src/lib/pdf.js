import jsPDF from 'jspdf';
// LA TABLA SE DIBUJA LLAMANDO A LA FUNCIÓN, NO AL DOCUMENTO.
// Hasta jspdf-autotable 4, importar el paquete por su efecto —`import
// 'jspdf-autotable'`— le añadía el método `autoTable` a jsPDF y se escribía
// `doc.autoTable({…})`. Desde la 5 ya no engancha nada: el método no existe y
// todos los entregables en PDF morían con «g.autoTable is not a function»
// (`g` es `doc` después de minificar), con el Excel funcionando al lado. Ahora
// se importa la función y se le pasa el documento, que es como ya lo hacían
// Pacas.jsx y Ventas.jsx.
import autoTable from 'jspdf-autotable';
// El costo por línea sale del mismo sitio que en las hojas de Excel: si el PDF
// se lo calculara por su cuenta, el papel y el libro acabarían enseñando cifras
// distintas del mismo inventario y nadie sabría cuál creer.
import { agruparPorProducto } from './entregables.js';

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

  // DESPACHO(GENERAL) — el papel que se lleva a la bodega.
  //
  // Va PRIMERO porque es con el que se recorre la bodega: todos los clientes
  // seguidos, ordenado por lo que hay que ir a buscar y no por a quien se le
  // entrega, con el nombre en cada renglon. Es la misma forma que la hoja de
  // Excel del mismo nombre; en papel el bloque de separadas va detras.
  if (sel.includes('DESPACHO(GENERAL)')) {
    const salen = (data.despachos || []).reduce(
      (n, d) => n + d.grupos.reduce((m, g) => m + (parseInt(g.cantidad) || 0), 0), 0);
    addTitle(`DESPACHAR - ${salen} unidad(es)`);
    const rows = [];
    for (const d of (data.despachos || [])) {
      for (const g of d.grupos) {
        rows.push([
          g.referencia || '', g.calidad || '',
          // Vacio, no un cero, cuando el costo o el precio no son unicos. Un
          // cero en papel se lee como «no cuesta nada».
          g.costo != null ? formatCOP(g.costo) : '',
          g.precio != null ? formatCOP(g.precio) : '',
          g.cantidad,
          d.nombre || '', d.ciudad || '', d.direccion || '', d.celular || '',
          d.tipo_transporte || d.transporte || '', d.transportadora || '', d.fletes || '',
        ]);
      }
    }
    autoTable(doc, {
      startY: 60,
      head: [['REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'CAN', 'NOMBRE',
        'CIUDAD', 'DIRECCION', 'CELULAR', 'TIPO', 'TRANSP.', 'FLETES']],
      body: rows.length ? rows : [['No hay nada que despachar.', '', '', '', '', '', '', '', '', '', '', '']],
      foot: [['TOTAL A DESPACHAR', '', '', '', salen, '', '', '', '', '', '', '']],
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [99, 102, 241] },
      footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    // Lo apartado va aparte y SI por cliente, porque es lo contrario: no sale
    // hoy, se aparta y se marca con el nombre encima.
    if ((data.separadas || []).length) {
      const rowsSep = [];
      for (const c of data.separadas) {
        let primera = true;
        for (const g of c.grupos) {
          rowsSep.push([
            primera ? (c.nombre || '') : '',
            g.referencia || '', g.calidad || '', g.cantidad,
          ]);
          primera = false;
        }
      }
      addTitle('SEPARAR');
      autoTable(doc, {
        startY: 60,
        head: [['CLIENTE', 'REFERENCIA', 'CALIDAD', 'CANT']],
        body: rowsSep,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [217, 119, 6] },
        columnStyles: { 3: { halign: 'center' } },
      });
    }
  }

  // CONTEO(BODEGA) — la hoja para contar a mano, y en papel es donde de verdad
  // se usa. La columna de cantidad va EN BLANCO a proposito: cualquier cifra
  // impresa al lado del casillero deja de ser un conteo y pasa a ser una
  // confirmacion, se copia el numero que ya esta y nadie cuenta nada.
  if (sel.includes('CONTEO(BODEGA)')) {
    const grupos = agruparPorProducto(data.inventario || []);
    addTitle(`CONTEO FISICO - ${grupos.length} productos`);
    autoTable(doc, {
      startY: 60,
      head: [['REFERENCIA', 'CALIDAD', 'CANTIDAD']],
      body: grupos.map((g) => [g.referencia || '', g.calidad || '', '']),
      theme: 'grid',
      styles: { fontSize: 9, minCellHeight: 18 },
      headStyles: { fillColor: [15, 23, 42] },
      columnStyles: { 0: { cellWidth: 240 }, 1: { cellWidth: 110 }, 2: { cellWidth: 90 } },
    });
  }

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
    autoTable(doc, {
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
    autoTable(doc, {
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
    autoTable(doc, {
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
      autoTable(doc, {
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
    // Las mismas columnas, el mismo orden y el mismo criterio que la hoja de
    // Excel (ver hojaInventarioInterno): primero cuánto hay, luego cómo se
    // llama, y al final la plata. El papel y el libro tienen que poder ponerse
    // uno al lado del otro sin que nadie dude de si son el mismo inventario.
    //
    // PRECIO TOTAL se valora con la promoción donde la hay, que es lo que de
    // verdad se cobra, igual que en la MATRIZ y en Cotizaciones.
    // La MISMA agrupacion que el Excel, de la misma funcion: una linea por
    // producto. Repetir aqui el agrupado seria la segunda version de la misma
    // cuenta, y este proyecto ya tuvo el bug de dos formulas de dinero que se
    // separaron sin que nada fallara.
    let ct = 0, pt = 0, disp = 0;
    const rows = agruparPorProducto(data.inventario || []).map(g => {
      ct += g.costoTotal; pt += g.precioTotal; disp += g.disponibles;
      return [
        g.disponibles, g.referencia, g.calidad,
        // Vacia, no cero, cuando el producto entro a costos distintos en dos
        // contenedores: no hay UN costo por unidad. Los totales si son exactos.
        g.costo != null ? formatCOP(g.costo) : '',
        g.precio != null ? formatCOP(g.precio) : '',
        g.promo != null ? formatCOP(g.promo) : '',
        formatCOP(g.costoTotal), formatCOP(g.precioTotal),
      ];
    });
    autoTable(doc, {
      startY: 60,
      head: [['DISPONIBLES', 'REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'PROMO', 'COSTO TOTAL', 'PRECIO TOTAL']],
      body: rows,
      foot: [[disp, 'TOTAL', '', '', '', '', formatCOP(ct), formatCOP(pt)]],
      theme: 'grid',
      styles: { fontSize: 8 },
      columnStyles: {
        0: { halign: 'center' },
        3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
        6: { halign: 'right' }, 7: { halign: 'right' },
      },
      headStyles: { fillColor: [231, 111, 81] },
      footStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
    });
  }

  if (sel.includes('CARTERA(INTERNA)')) {
    addTitle(`CARTERA (INTERNA)`);
    // Sólo los que deben, y en orden alfabético: lo mismo que en el Excel. Se
    // había arreglado allá y aquí no, así que el PDF seguía sacando las 85
    // filas con 55 clientes en cero. La lista se usa para cobrar.
    const paraOrdenar = (s) => String(s || '').normalize('NFD')
      .replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    const saldoDe = (c) => Number(c.saldo ?? c.saldo_pendiente ?? 0);
    const conSaldo = (data.cartera || [])
      .filter((c) => saldoDe(c) !== 0)
      .sort((a, b) => paraOrdenar(a.nombre).localeCompare(paraOrdenar(b.nombre), 'es'));
    // Las dadas por perdidas van en su propia tabla, debajo del total y con el
    // motivo al lado. Mezcladas en la misma tabla alguien sumaría la columna
    // entera; separadas, la cifra que se cobra es la del TOTAL y punto. Es la
    // misma decisión que en la hoja de Excel (ver hojaCarteraInterna).
    const activas = conSaldo.filter((c) => !c.cartera_inactiva);
    const perdidas = conSaldo.filter((c) => c.cartera_inactiva);

    const total = activas.reduce((s, c) => s + saldoDe(c), 0);
    autoTable(doc, {
      startY: 60,
      head: [['CLIENTE', 'LIMITE', 'DIAS', 'SALDO', 'VENCIDO']],
      body: activas.map((c) => [
        c.nombre, formatCOP(c.limite_credito), c.dias_credito, formatCOP(c.saldo ?? c.saldo_pendiente), formatCOP(c.vencido),
      ]),
      foot: [['TOTAL', '', '', formatCOP(total), '']],
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [231, 111, 81] },
      footStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    if (perdidas.length) {
      const perdido = perdidas.reduce((s, c) => s + saldoDe(c), 0);
      autoTable(doc, {
        startY: (doc.lastAutoTable?.finalY || 60) + 18,
        head: [['DADAS POR PERDIDAS — no suman al TOTAL de arriba', 'SALDO', 'POR QUÉ SE DEJÓ DE COBRAR']],
        body: perdidas.map((c) => [
          c.nombre,
          formatCOP(saldoDe(c)),
          String(c.cartera_inactiva_motivo || '').trim() || 'SIN MOTIVO ESCRITO',
        ]),
        foot: [['TOTAL DADO POR PERDIDO', formatCOP(perdido), 'no entra en el TOTAL de arriba']],
        theme: 'grid',
        styles: { fontSize: 8 },
        columnStyles: { 1: { halign: 'right' } },
        headStyles: { fillColor: [180, 83, 9] },
        footStyles: { fillColor: [253, 230, 138], textColor: [146, 64, 14], fontStyle: 'bold' }
      });
    }
  }

  if (!pageAdded) {
    doc.text("No data selected or missing PDF mapping for selected pages", 40, 40);
  }

  doc.save(`${fileName}.pdf`);
}
