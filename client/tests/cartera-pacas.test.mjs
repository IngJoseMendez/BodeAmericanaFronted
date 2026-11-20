// CUÁNTAS PACAS SE LE VENDIERON, Y DE CUÁNTAS COMPRAS SE SABE.
//
// El negocio pidió dos cosas: la CANTIDAD TOTAL de pacas en el resumen de cada
// cliente, y que se arreglara por qué algunos clientes aparecen «con la cantidad
// de pacas vacía».
//
// Lo segundo no era un agujero de datos: era un guion que significaba dos cosas
// distintas. De las 223 compras sin cantidad de los libros, 213 NO SON
// MERCANCÍA —fletes, descuentos, ajustes de cuadre— y por lo tanto no tienen
// pacas que contar; solo 59 son mercancía a la que de verdad le falta el dato,
// porque la propia hoja se contradice con su total. Con el mismo «—» para las
// dos, la pantalla parecía tener 223 agujeros y nadie podía ir a arreglar los 59
// que importan.
//
// La regla de los tres casos vive en src/lib/cartera.js y es lo que se prueba
// aquí: un número, NO_APLICA, o null. Nunca un cero, que diría «cero pacas».
import assert from 'assert';
import {
  pacasDeCompra, pacasDeCompras, pacasDeCliente, esMercancia, NO_APLICA,
} from '../src/lib/cartera.js';

let malos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { malos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

// Una compra del libro viejo: la cantidad viene deducida y comprobada al cargar.
const DEL_LIBRO = { id: 1, tipo: 'venta', clase: 'venta', monto: 2400000, cantidad: 8 };
// Una venta hecha en el sistema: no trae `cantidad`, trae sus pacas de verdad.
const DEL_SISTEMA = {
  id: 2, tipo: 'venta', clase: 'venta', monto: 900000,
  detalles: [{ referencia: 'mixta verano', cantidad: 2 }, { referencia: 'blusa', cantidad: 1 }],
};
// Un flete: lleva un recuento de PRENDAS, que no son pacas.
const FLETE = { id: 3, tipo: 'venta', clase: 'ajuste', monto: 120000, cantidad: null };
// Mercancía a la que le falta el dato: una de las 59.
const SIN_DATO = { id: 4, tipo: 'venta', clase: 'venta', monto: 1500000, cantidad: null };
// Un abono: no es una compra.
const ABONO = { id: 5, tipo: 'abono', clase: 'pago', monto: 500000 };

console.log('\nLas tres respuestas posibles, que no son dos');

prueba('una compra del libro trae su cantidad', () => {
  assert.strictEqual(pacasDeCompra(DEL_LIBRO), 8);
});

prueba('una venta del sistema las cuenta de su detalle', () => {
  assert.strictEqual(pacasDeCompra(DEL_SISTEMA), 3);
});

prueba('un flete o un ajuste NO es un dato que falte: no aplica', () => {
  assert.strictEqual(pacasDeCompra(FLETE), NO_APLICA);
  assert.strictEqual(pacasDeCompra({ tipo: 'venta', clase: 'descuento' }), NO_APLICA);
  assert.notStrictEqual(pacasDeCompra(FLETE), null,
    'confundirlo con lo desconocido es justo el defecto que se vino a corregir');
});

prueba('mercancía sin cantidad devuelve null, nunca cero', () => {
  assert.strictEqual(pacasDeCompra(SIN_DATO), null);
  assert.notStrictEqual(pacasDeCompra(SIN_DATO), 0, 'un cero diría «cero pacas»');
});

prueba('sin clase se da por mercancía, como antes de que existiera la columna', () => {
  assert.strictEqual(esMercancia({ tipo: 'venta' }), true);
  assert.strictEqual(pacasDeCompra({ tipo: 'venta', cantidad: 5 }), 5);
});

prueba('la cantidad del libro manda sobre el detalle', () => {
  // Si las dos están, la del libro es la comprobada contra el importe.
  const mixto = { ...DEL_SISTEMA, cantidad: 4 };
  assert.strictEqual(pacasDeCompra(mixto), 4);
});

console.log('\nLa suma, con la cuenta de sobre cuántas compras se calculó');

prueba('suma solo lo que se sabe y dice cuántas quedaron fuera', () => {
  const t = pacasDeCompras([DEL_LIBRO, DEL_SISTEMA, SIN_DATO, FLETE]);
  assert.strictEqual(t.pacas, 11);
  assert.strictEqual(t.conDato, 2);
  assert.strictEqual(t.sinDato, 1);
  assert.strictEqual(t.noAplica, 1);
});

prueba('el flete NO entra en el divisor: no es una compra sin dato', () => {
  const t = pacasDeCompras([DEL_LIBRO, DEL_SISTEMA, SIN_DATO, FLETE]);
  assert.strictEqual(t.compras, 3,
    'decir «de 2 de 4 compras» metiendo el flete inventaría un agujero');
});

prueba('todo completo: ni sinDato ni noAplica', () => {
  const t = pacasDeCompras([DEL_LIBRO, DEL_SISTEMA]);
  assert.deepStrictEqual(
    { pacas: t.pacas, sinDato: t.sinDato, noAplica: t.noAplica, compras: t.compras },
    { pacas: 11, sinDato: 0, noAplica: 0, compras: 2 });
});

console.log('\nLa CANTIDAD TOTAL del cliente');

prueba('cuenta todas sus compras y ningún abono', () => {
  const t = pacasDeCliente([DEL_LIBRO, DEL_SISTEMA, ABONO]);
  assert.strictEqual(t.pacas, 11);
  assert.strictEqual(t.compras, 2, 'un abono no es una compra');
});

prueba('un cliente que solo ha abonado tiene cero pacas, no NaN', () => {
  const t = pacasDeCliente([ABONO]);
  assert.strictEqual(t.pacas, 0);
  assert.strictEqual(t.compras, 0);
  assert.strictEqual(t.sinDato, 0, 'y tampoco un agujero de datos que no existe');
});

prueba('sin movimientos devuelve ceros, no undefined', () => {
  for (const vacio of [[], null, undefined]) {
    assert.deepStrictEqual(pacasDeCliente(vacio),
      { pacas: 0, conDato: 0, sinDato: 0, noAplica: 0, compras: 0 });
  }
});

prueba('aguanta basura sin devolver NaN', () => {
  const t = pacasDeCompras([
    { tipo: 'venta', cantidad: 'x' },
    { tipo: 'venta', detalles: [{ cantidad: null }] },
  ]);
  assert.ok(Number.isFinite(t.pacas));
});

prueba('un cliente con 1.592 compras se cuenta entero', () => {
  // MARTA BOTERO. El total del resumen NO depende de la ventana de filas ni del
  // buscador: es un total del cliente.
  const muchas = Array.from({ length: 1592 }, (_, i) => ({
    id: i, tipo: 'venta', clase: 'venta', monto: 100000, cantidad: 1,
  }));
  assert.strictEqual(pacasDeCliente(muchas).pacas, 1592);
});

console.log(`\n${malos === 0 ? 'Una cantidad vacía dice por qué está vacía' : malos + ' fallo(s)'}\n`);
process.exit(malos === 0 ? 0 : 1);
