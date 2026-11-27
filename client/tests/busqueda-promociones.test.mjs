// La búsqueda del módulo de promociones.
//
// El comparador (`coincideBusqueda`: todas las palabras, en cualquier orden, sin
// tildes ni mayúsculas) ya está probado en src/lib/matriz.test.mjs y aquí no se
// vuelve a probar. Lo que se fija aquí es lo OTRO, que es lo que decide si la
// búsqueda sirve: QUÉ campos de la promoción se buscan.
//
// Si alguien añade mañana el estado o la categoría al texto buscable, estas
// comprobaciones fallan y dicen por qué no se debe: no es una opinión escrita en
// un comentario, es un candado.
import { textoDeFila, filtrarPromociones } from '../src/lib/promociones.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 52 - t.length)));
function comprobar(etiqueta, real, esperado) {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(48)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esperado)}`);
}

// Una promoción como las que hay en produccion: 55 filas de referencia +
// calidad, la mayoria sin clasificacion.
const promo = (referencia, calidad, clasificacion = null) => ({
  referencia, calidad, clasificacion,
  precio_promocional: '1.500.000',
  fecha_inicio: '2026-11-01', fecha_fin: '2026-12-31', activo: true,
});

// El filtro de la pantalla, el de verdad: se llama a la misma funcion que usa
// PreciosPromocion y solo se recogen los nombres para poder compararlos.
const buscar = (lista, consulta) => filtrarPromociones(lista, consulta).map((p) => p.referencia);

const LISTA = [
  promo('mixta invierno plus size', 'premium'),
  promo('mixta invierno', 'supreme'),
  promo('deportivo', 'especial', 'dama'),
  promo('buzo con capota', 'premium', 'hombre'),
  promo('jean clasico', 'primera'),
];

grupo('el texto que se busca es el que se ve en la fila');
comprobar('referencia, calidad y clasificacion',
  textoDeFila(promo('deportivo', 'especial', 'dama')), 'deportivo especial dama');
// La pantalla pinta «Todas» en la columna cuando no hay clasificacion, asi que
// esa palabra tiene que estar: se busca lo que esta escrito en la fila.
comprobar('sin clasificacion dice Todas, como la columna',
  textoDeFila(promo('jean clasico', 'primera')), 'jean clasico primera Todas');
comprobar('una promocion vacia no revienta', textoDeFila({}), '  Todas');
comprobar('null tampoco', textoDeFila(null), '  Todas');

grupo('buscar por el nombre del producto');
comprobar('un trozo del nombre', buscar(LISTA, 'mixta'),
  ['mixta invierno plus size', 'mixta invierno']);
// ESTE ES EL CASO QUE JUSTIFICA EL COMPARADOR. Con un `includes` de la frase
// entera, «plus mixta» no encontraria nada: exige las palabras pegadas y en ese
// orden. Estos nombres son largos y compuestos y nadie los recuerda enteros.
comprobar('las palabras en cualquier orden', buscar(LISTA, 'plus mixta'),
  ['mixta invierno plus size']);
comprobar('da igual mayusculas y tildes', buscar(LISTA, 'JEAN CLÁSICO'),
  ['jean clasico']);

grupo('buscar por calidad, y por las dos cosas a la vez');
comprobar('solo la calidad', buscar(LISTA, 'premium'),
  ['mixta invierno plus size', 'buzo con capota']);
// Referencia por un lado y calidad por el otro: las dos palabras estan en la
// fila pero en campos distintos, que es justo lo que resuelve juntar el texto.
comprobar('referencia + calidad', buscar(LISTA, 'mixta premium'),
  ['mixta invierno plus size']);
comprobar('calidad + clasificacion', buscar(LISTA, 'dama especial'), ['deportivo']);

grupo('lo que NO se busca, y es a proposito');
// «inactiva» CONTIENE «activa»: con el estado dentro del texto, buscar las
// activas devolveria tambien las apagadas y la busqueda estaria mintiendo.
comprobar('el estado no entra: buscar «activa» no filtra nada',
  buscar(LISTA, 'activa'), []);
comprobar('ni «inactiva»', buscar(LISTA, 'inactiva'), []);
// La categoria (temporada) no esta escrita en la fila. Devolver filas donde la
// palabra no aparece por ningun lado se lee como un fallo de la pantalla.
comprobar('la categoria no entra: «invierno» solo casa con el nombre',
  buscar(LISTA, 'invierno'), ['mixta invierno plus size', 'mixta invierno']);
// Un «1» suelto coincidiria con casi todos los precios y todas las fechas.
comprobar('los precios no entran', buscar(LISTA, '1.500.000'), []);
comprobar('las fechas tampoco', buscar(LISTA, '2026'), []);

grupo('quitar la busqueda devuelve la lista entera');
comprobar('vacio', buscar(LISTA, '').length, 5);
comprobar('solo espacios', buscar(LISTA, '   ').length, 5);
comprobar('sin coincidencias no inventa nada', buscar(LISTA, 'zapatos'), []);

console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)` : '\nLa busqueda de promociones encuentra lo que debe y nada mas');
process.exit(malos ? 1 : 0);
