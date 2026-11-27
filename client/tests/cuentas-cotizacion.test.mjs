// Las cuentas de una cotización, que son las mismas en la pantalla normal y en
// la separación masiva. Si estas fallan, se le cobra de más o de menos a un
// cliente real, así que se comprueban contra números hechos a mano.
import {
  cantidadDe, precioDe, itemCompleto, precioConDescuento, totalesFila, tasaDeFila,
} from '../src/lib/cotizacion.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 52 - t.length)));
function comprobar(etiqueta, real, esperado) {
  const bien = typeof real === 'number' && typeof esperado === 'number'
    ? Math.abs(real - esperado) < 0.001
    : JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(46)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esperado)}`);
}

const item = (referencia, calidad, cantidad, precio, esPromocion = false) =>
  ({ referencia, calidad, cantidad, precio, esPromocion });

grupo('lectura de los campos que escribe la usuaria');
comprobar('cantidad "12"', cantidadDe({ cantidad: '12' }), 12);
comprobar('cantidad vacía es 0', cantidadDe({ cantidad: '' }), 0);
comprobar('cantidad con decimales se redondea', cantidadDe({ cantidad: '12,4' }), 12);
comprobar('cantidad negativa se topa en 0', cantidadDe({ cantidad: '-5' }), 0);
// El punto separa MILES en Colombia: "98.000" son noventa y ocho mil.
comprobar('precio "98.000" son 98 mil', precioDe({ precio: '98.000' }), 98000);
comprobar('precio vacío es 0', precioDe({ precio: '' }), 0);

grupo('qué línea se envía y cuál no');
comprobar('línea completa cuenta', itemCompleto(item('CHAQ-001', 'PRIMERA', '2', '98.000')), true);
comprobar('sin calidad no cuenta', itemCompleto(item('CHAQ-001', '', '2', '98.000')), false);
comprobar('sin precio no cuenta', itemCompleto(item('CHAQ-001', 'PRIMERA', '2', '')), false);
comprobar('cantidad 0 no cuenta', itemCompleto(item('CHAQ-001', 'PRIMERA', '0', '98.000')), false);

grupo('descuento por unidad, topado por ítem');
comprobar('valor fijo: 98.000 − 3.000', precioConDescuento(98000, 3000, 'valor_fijo'), 95000);
comprobar('porcentaje: 10% de 98.000', precioConDescuento(98000, 10, 'porcentaje'), 88200);
comprobar('sin descuento devuelve el precio', precioConDescuento(98000, 0, 'valor_fijo'), 98000);
// Éste es el caso que descuadraba el total: un descuento mayor que el precio.
comprobar('el descuento NO deja el precio negativo', precioConDescuento(2000, 5000, 'valor_fijo'), 0);
comprobar('100% deja el precio en 0', precioConDescuento(98000, 100, 'porcentaje'), 0);
comprobar('se redondea a peso', precioConDescuento(9999, 33, 'porcentaje'), 6699);

grupo('total de un cliente — descuento fijo');
{
  // 12 × 98.000 = 1.176.000 · descuento 3.000/u sobre 12 = 36.000
  // transporte 500/u × 12 = 6.000 → total 1.146.000
  const t = totalesFila({
    items: [item('CHAQ-001', 'PRIMERA', '12', '98.000')],
    descuento: '3.000', tipo_descuento: 'valor_fijo', transporte_unitario: '500',
  });
  comprobar('subtotal', t.subtotal, 1176000);
  comprobar('unidades', t.unidades, 12);
  comprobar('descuento', t.descuento, 36000);
  comprobar('transporte total', t.transporteTotal, 6000);
  comprobar('total', t.total, 1146000);
}

grupo('total de un cliente — descuento en porcentaje');
{
  // 10 × 50.000 = 500.000 · 10% → precio unitario 45.000 → descuento 50.000
  const t = totalesFila({
    items: [item('JEAN-002', 'PRIMERA', '10', '50.000')],
    descuento: '10', tipo_descuento: 'porcentaje', transporte_unitario: '',
  });
  comprobar('descuento del 10%', t.descuento, 50000);
  comprobar('total', t.total, 450000);
}

grupo('las promociones no reciben descuento encima');
{
  // La promoción YA es el precio rebajado: descontar otra vez regala mercancía.
  const t = totalesFila({
    items: [
      item('CHAQ-001', 'PRIMERA', '10', '98.000'),          // normal
      item('JEAN-002', 'PRIMERA', '10', '40.000', true),    // en promoción
    ],
    descuento: '5.000', tipo_descuento: 'valor_fijo', transporte_unitario: '0',
  });
  comprobar('subtotal de los dos ítems', t.subtotal, 1380000);
  comprobar('sólo descuenta el ítem normal', t.descuento, 50000);
  comprobar('total', t.total, 1330000);
}

// EL TRANSPORTE ES DE CADA CLIENTE Y NO HEREDA DE NADA.
//
// Aquí se comprobaba la herencia: la barra de la Matriz tenía un transporte
// global, una celda vacía lo tomaba y un 0 escrito a mano valía 0 para decir
// «este cliente recoge en bodega». La dueña bajó el flete —y la tasa— a cada
// cliente, así que ya no hay de dónde heredar y el vacío significa exactamente
// lo que antes había que escribir con un cero: sin transporte.
grupo('transporte: el de la fila, y el vacío es sin transporte');
{
  const base = { items: [item('CHAQ-001', 'PRIMERA', '10', '10.000')], descuento: '', tipo_descuento: 'valor_fijo' };
  comprobar('celda vacía es sin transporte',
    totalesFila({ ...base, transporte_unitario: '' }).transporteUnitario, 0);
  comprobar('un 0 escrito vale lo mismo que el vacío',
    totalesFila({ ...base, transporte_unitario: '0' }).transporteUnitario, 0);
  comprobar('el valor de la fila es el que se cobra',
    totalesFila({ ...base, transporte_unitario: '1.200' }).transporteUnitario, 1200);
  comprobar('y en el total son 10 pacas × 1.200',
    totalesFila({ ...base, transporte_unitario: '1.200' }).total, 112000);
  // Un segundo argumento ya no se lee: si alguien lo dejara puesto de la época
  // del global, el flete de ese cliente NO puede cambiar por eso.
  comprobar('un segundo argumento viejo se ignora',
    totalesFila({ ...base, transporte_unitario: '' }, 700).transporteUnitario, 0);
}

grupo('filas incompletas y vacías');
{
  const t = totalesFila({
    items: [
      item('CHAQ-001', 'PRIMERA', '5', '10.000'),
      item('', '', '1', ''),            // la fila en blanco que crea "Agregar ítem"
      item('JEAN-002', '', '3', '9.000'), // a medio llenar
    ],
    descuento: '', tipo_descuento: 'valor_fijo', transporte_unitario: '100',
  });
  comprobar('sólo cuenta la línea completa', t.validos.length, 1);
  comprobar('las unidades no incluyen las incompletas', t.unidades, 5);
  comprobar('el transporte no se cobra por líneas vacías', t.transporteTotal, 500);
  comprobar('total', t.total, 50500);

  const vacia = totalesFila({ items: [], descuento: '', transporte_unitario: '' });
  comprobar('cliente sin ítems: total 0', vacia.total, 0);
  comprobar('cliente sin ítems: nada que enviar', vacia.validos.length, 0);
}

grupo('la fila y el pie siempre cuadran');
{
  // Comprobación cruzada: sumar ítem por ítem tiene que dar exactamente el
  // mismo total que devuelve la función. Es la incoherencia que ya apareció
  // una vez en Cotizaciones.
  const fila = {
    items: [
      item('A', 'PRIMERA', '7', '13.333'),
      item('B', 'SEGUNDA', '3', '2.000'),
      item('C', 'PRIMERA', '11', '45.500'),
    ],
    descuento: '2.500', tipo_descuento: 'valor_fijo', transporte_unitario: '350',
  };
  const t = totalesFila(fila);
  const aMano = t.validos.reduce(
    (s, i) => s + precioConDescuento(precioDe(i), 2500, 'valor_fijo') * cantidadDe(i), 0
  ) + t.transporteTotal;
  comprobar('suma ítem por ítem = total de la función', t.total, aMano);
  // El ítem B vale 2.000 y el descuento es 2.500: no puede quedar negativo.
  comprobar('el ítem barato no arrastra el total a negativo', t.total > 0, true);
}

// LA MONEDA DE CADA CLIENTE. Hay clientes que compran en pesos y clientes que
// compran en pesos y dólares, y en la Matriz lo único que los distingue es si su
// casilla de tasa está escrita. Antes había UNA tasa para toda la ronda, así que
// esto no se podía ni preguntar: salían todos en la misma moneda.
//
// Lo que se comprueba aquí es que el VACÍO SIGNIFICA PESOS, porque de ese null
// depende que el PDF salga sin columna de dólares.
grupo('la tasa de cada cliente, y el vacío que significa «en pesos»');
{
  comprobar('sin casilla: factura en pesos', tasaDeFila({}), null);
  comprobar('casilla vacía: en pesos', tasaDeFila({ tasa: '' }), null);
  comprobar('sólo espacios: en pesos', tasaDeFila({ tasa: '   ' }), null);
  comprobar('un cero escrito: en pesos', tasaDeFila({ tasa: '0' }), null);
  // El 1 es el caso que de verdad pasó: con tasa 1 el PDF sacaba el total en
  // dólares igual que el de pesos. Las cinco cotizaciones de producción
  // estaban así, y por eso 1 NO es una tasa.
  comprobar('un 1 no es una tasa, es un peso por dólar', tasaDeFila({ tasa: '1' }), null);
  comprobar('texto que no es número: en pesos', tasaDeFila({ tasa: 'cuatro mil' }), null);
  comprobar('fila nula no revienta', tasaDeFila(null), null);
  // Y con tasa escrita, en pesos Y dólares. Con el punto de miles colombiano.
  comprobar('"4.000" son cuatro mil', tasaDeFila({ tasa: '4.000' }), 4000);
  comprobar('los decimales se conservan', tasaDeFila({ tasa: '4.012,50' }), 4012.5);
}

console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)` : '\nLas cuentas de cotización cuadran');
process.exit(malos ? 1 : 0);
