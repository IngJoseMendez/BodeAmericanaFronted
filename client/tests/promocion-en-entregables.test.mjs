// LA PROMOCIÓN GANA SOBRE EL PRECIO, Y TIENE QUE VERSE EN EL PAPEL.
//
// Un producto en promoción se cotiza al precio rebajado —la pantalla resuelve
// promoción primero—, pero los entregables enseñaban el de lista: la columna
// PROMO de la hoja MATRIZ salía vacía y el inventario interno ni siquiera tenía
// esa columna. Así, el Excel que se manda y la cotización que se cobra decían
// precios distintos del mismo producto, sin que fallara nada.
//
// Hay DOS formas de estar en promoción y las dos tienen que salir:
//   · `precio_promocion` — la promoción vigente vive en su propia tabla y la
//     paca conserva su precio de lista. Es como se registran hoy, y es la que
//     no aparecía.
//   · `tiene_promocion` — la paca nació con el precio ya rebajado (se finalizó
//     su contenedor con una promoción corriendo). Ahí no hay precio de lista
//     que enseñar al lado, y por eso ORIGINAL se queda vacío: repetir la misma
//     cifra bajo los dos rótulos se lee como que la rebaja no rebaja nada.

import ExcelJS from 'exceljs';
import {
  hojaMatrizClientes, hojaInventarioInterno, promoDeLinea, precioDeLinea,
} from '../src/lib/entregables.js';

const base = {
  contenedor: 'C526', proveedor_nombre: 'DIAS', categoria: 'verano', clasificacion: 'mujer',
  cantidad: 5, fisico: 5, despachadas: 0, separadas: 0, disponibles: 5,
};
const filas = [
  // Sin promoción: se cobra el de lista.
  { ...base, referencia: 'blusa', calidad: 'premium', precio_minimo: 900000, precio_unitario: 2300000,
    tiene_promocion: false, precio_promocion: null },
  // Promoción vigente en su tabla: la paca sigue con su precio de lista.
  { ...base, referencia: 'blusa camiseta', calidad: 'especial', precio_minimo: 786614, precio_unitario: 1600000,
    tiene_promocion: false, precio_promocion: 1300000, disponibles: 3 },
  // Paca nacida ya rebajada: su precio_venta ES el de promoción.
  { ...base, referencia: 'jeans mujer', calidad: 'supreme', precio_minimo: 1000000, precio_unitario: 1600000,
    tiene_promocion: true, precio_promocion: null, disponibles: 2 },
];

let malos = 0;
const ok = (etiqueta, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(52)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esp)}`);
};

console.log('\n── La regla, en una sola función ────────────────────────');
ok('sin promoción no hay promo', promoDeLinea(filas[0]), null);
ok('sin promoción el precio es el de lista', precioDeLinea(filas[0]), 2300000);
ok('con promoción vigente, promo es la rebaja', promoDeLinea(filas[1]), 1300000);
ok('y el precio que se cobra es la rebaja', precioDeLinea(filas[1]), 1300000);
ok('paca ya rebajada: su propio precio es la promo', promoDeLinea(filas[2]), 1600000);
ok('basura no revienta', [promoDeLinea(null), precioDeLinea(undefined)], [null, 0]);

const wb = new ExcelJS.Workbook();
const matriz = hojaMatrizClientes(wb, filas, []);
const m = (r, c) => { const x = matriz.getCell(r, c).value; return x == null || x === '' ? '' : x; };

console.log('\n── MATRIZ: las dos columnas de precio ───────────────────');
ok('sin promo: PROMO vacío y ORIGINAL con el precio', [m(5, 6), m(5, 7)], ['', 2300000]);
ok('con promo: PROMO la rebaja y ORIGINAL el de lista', [m(6, 6), m(6, 7)], [1300000, 1600000]);
ok('paca ya rebajada: PROMO su precio y ORIGINAL vacío', [m(7, 6), m(7, 7)], [1600000, '']);

const interno = hojaInventarioInterno(new ExcelJS.Workbook(), filas);
const i = (r, c) => { const x = interno.getCell(r, c).value; return x == null || x === '' ? '' : x; };
const filaCab = 2;

console.log('\n── INVENTARIO(INTERNO): PROMO y el valor del inventario ──');
ok('encabezados con PROMO al lado de PRECIO',
  Array.from({ length: 10 }, (_, k) => i(filaCab, k + 1)),
  ['CATEGORIA', 'CLASIFICACION', 'REFERENCIA', 'CALIDAD', 'COSTO', 'PRECIO', 'PROMO', 'DISP', 'COSTO TOTAL', 'PRECIO TOTAL']);
ok('sin promo: PROMO vacío', i(filaCab + 1, 7), '');
ok('con promo: la rebaja en su columna', i(filaCab + 2, 7), 1300000);
ok('el de lista se conserva al lado', i(filaCab + 2, 6), 1600000);
// 3 disponibles × 1.300.000 de promoción = 3.900.000, no 4.800.000 al de lista.
ok('PRECIO TOTAL se valora con la rebaja', i(filaCab + 2, 10), 3900000);
ok('sin promo se valora con el de lista', i(filaCab + 1, 10), 2300000 * 5);
// TOTAL: 5×2.300.000 + 3×1.300.000 + 2×1.600.000 = 11.500.000 + 3.900.000 + 3.200.000
ok('el TOTAL suma con las rebajas puestas', i(filaCab + 4, 10), 18600000);
ok('y sigue contando las pacas', i(filaCab + 4, 8), 10);

console.log(malos
  ? `\n${malos} PRUEBA(S) FALLIDA(S)`
  : '\nLa promoción gana en la MATRIZ y en el inventario');
process.exit(malos ? 1 : 0);
