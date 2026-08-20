// Las cuentas de una cotización, que son las mismas en la pantalla normal y en
// la separación masiva. Si estas fallan, se le cobra de más o de menos a un
// cliente real, así que se comprueban contra números hechos a mano.
import {
  cantidadDe, precioDe, itemCompleto, precioConDescuento, totalesFila,
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
    descuento: '3.000', tipo_descuento: 'valor_fijo', transporte_unitario: '',
  }, 500);
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
  }, 0);
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
  }, 0);
  comprobar('subtotal de los dos ítems', t.subtotal, 1380000);
  comprobar('sólo descuenta el ítem normal', t.descuento, 50000);
  comprobar('total', t.total, 1330000);
}

grupo('transporte: global, propio y el cero a propósito');
{
  const base = { items: [item('CHAQ-001', 'PRIMERA', '10', '10.000')], descuento: '', tipo_descuento: 'valor_fijo' };
  comprobar('celda vacía hereda el global',
    totalesFila({ ...base, transporte_unitario: '' }, 700).transporteUnitario, 700);
  comprobar('valor propio pisa al global',
    totalesFila({ ...base, transporte_unitario: '1.200' }, 700).transporteUnitario, 1200);
  // "Este cliente recoge en bodega": un 0 escrito a mano no puede heredar 700.
  comprobar('un 0 escrito vale 0, no hereda',
    totalesFila({ ...base, transporte_unitario: '0' }, 700).transporteUnitario, 0);
  comprobar('total con transporte propio',
    totalesFila({ ...base, transporte_unitario: '1.200' }, 700).total, 112000);
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
  }, 0);
  comprobar('sólo cuenta la línea completa', t.validos.length, 1);
  comprobar('las unidades no incluyen las incompletas', t.unidades, 5);
  comprobar('el transporte no se cobra por líneas vacías', t.transporteTotal, 500);
  comprobar('total', t.total, 50500);

  const vacia = totalesFila({ items: [], descuento: '', transporte_unitario: '' }, 500);
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
  const t = totalesFila(fila, 0);
  const aMano = t.validos.reduce(
    (s, i) => s + precioConDescuento(precioDe(i), 2500, 'valor_fijo') * cantidadDe(i), 0
  ) + t.transporteTotal;
  comprobar('suma ítem por ítem = total de la función', t.total, aMano);
  // El ítem B vale 2.000 y el descuento es 2.500: no puede quedar negativo.
  comprobar('el ítem barato no arrastra el total a negativo', t.total > 0, true);
}

console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)` : '\nLas cuentas de cotización cuadran');
process.exit(malos ? 1 : 0);
