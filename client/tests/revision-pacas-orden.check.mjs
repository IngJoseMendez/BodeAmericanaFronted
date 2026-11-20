// LAS PACAS DE LA REVISIÓN, EN ORDEN ALFABÉTICO.
//
// Llegaban en el orden en que se teclearon (por id de línea). Contar cuarenta
// líneas contra un montón de pacas en el suelo con ese orden obliga a recorrer
// la lista entera por cada paca que se levanta: la pila está agrupada por
// referencia y la pantalla no lo estaba.
//
// Se prueban dos cosas que no se pueden mirar en una captura de pantalla:
//
//   1. EL CRITERIO de orden: por referencia —el nombre impreso en el fardo— y
//      después clasificación y calidad, con las tildes y la ñ donde se las
//      busca y los números en orden numérico.
//   2. QUE LA TABLA DE CAPTURA NO SE ORDENA. Es el mismo componente con los
//      mismos datos, y ahí las líneas NO pueden moverse: se escriben de arriba
//      abajo y una línea que salta de sitio en cuanto se teclea su referencia
//      hace imposible capturar. Revisar y capturar quieren órdenes distintos
//      porque son trabajos distintos, y eso es fácil de «arreglar» sin saberlo.
import assert from 'assert';
import fs from 'fs';
import path from 'path';

let malos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { malos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

const PAGINA = fs.readFileSync(
  path.join(process.cwd(), 'src', 'pages', 'Contenedores.jsx'), 'utf8');

// El mismo comparador que usa la pantalla, copiado del fuente para poder
// probarlo: vive dentro del componente y no se puede importar.
const ordenAlfabetico = (a, b) => {
  const cmp = (x, y) => String(x || '').trim().localeCompare(String(y || '').trim(), 'es',
    { sensitivity: 'base', numeric: true });
  return cmp(a.referencia, b.referencia)
      || cmp(a.clasificacion, b.clasificacion)
      || cmp(a.calidad, b.calidad);
};

const refs = (lista) => lista.map((d) => d.referencia);

console.log('\nEl criterio de orden');

prueba('ordena por referencia', () => {
  const lineas = [
    { referencia: 'pantalón' }, { referencia: 'blusa' }, { referencia: 'chaqueta' },
  ];
  assert.deepStrictEqual(refs([...lineas].sort(ordenAlfabetico)),
    ['blusa', 'chaqueta', 'pantalón']);
});

prueba('las tildes y la ñ caen donde se las busca, no al final', () => {
  const lineas = [{ referencia: 'ñandú' }, { referencia: 'nylon' }, { referencia: 'ánfora' },
                  { referencia: 'abrigo' }];
  // Con una comparación de cadenas a secas, «ánfora» y «ñandú» se irían al
  // final por su código Unicode y nadie las encontraría en la lista.
  assert.deepStrictEqual(refs([...lineas].sort(ordenAlfabetico)),
    ['abrigo', 'ánfora', 'nylon', 'ñandú']);
});

prueba('«paca 10» va después de «paca 9», no antes', () => {
  const lineas = [{ referencia: 'paca 10' }, { referencia: 'paca 9' }, { referencia: 'paca 2' }];
  assert.deepStrictEqual(refs([...lineas].sort(ordenAlfabetico)),
    ['paca 2', 'paca 9', 'paca 10']);
});

prueba('a igual referencia desempata la clasificación y luego la calidad', () => {
  const lineas = [
    { referencia: 'mixta', clasificacion: 'mujer', calidad: 'primera' },
    { referencia: 'mixta', clasificacion: 'hombre', calidad: 'supreme' },
    { referencia: 'mixta', clasificacion: 'hombre', calidad: 'primera' },
  ];
  const puestas = [...lineas].sort(ordenAlfabetico)
    .map((d) => `${d.clasificacion}/${d.calidad}`);
  assert.deepStrictEqual(puestas, ['hombre/primera', 'hombre/supreme', 'mujer/primera']);
});

prueba('mayúsculas y minúsculas no parten la lista en dos', () => {
  const lineas = [{ referencia: 'Blusa' }, { referencia: 'abrigo' }, { referencia: 'CHAQUETA' }];
  assert.deepStrictEqual(refs([...lineas].sort(ordenAlfabetico)),
    ['abrigo', 'Blusa', 'CHAQUETA']);
});

prueba('una referencia vacía o nula no revienta el orden', () => {
  const lineas = [{ referencia: 'blusa' }, { referencia: null }, {}, { referencia: '  ' }];
  assert.strictEqual([...lineas].sort(ordenAlfabetico).length, 4);
});

console.log('\nDónde se ordena y dónde no');

prueba('la revisión ordena sus filas al construirlas', () => {
  assert.ok(/for \(const det of \[\.\.\.prov\.detalles\]\.sort\(ordenAlfabetico\)\)/.test(PAGINA),
    'openRevisionModal tiene que ordenar las líneas de cada proveedor');
});

prueba('ordena sobre una COPIA, no sobre los datos del contenedor', () => {
  // `prov.detalles` es el mismo arreglo que queda en `selectedContenedor` y que
  // leen otros bloques de la pantalla: ordenarlo en el sitio les cambiaría el
  // orden por debajo.
  assert.ok(!/prov\.detalles\.sort\(/.test(PAGINA),
    'nunca `prov.detalles.sort(...)` directo: tiene que ser [...prov.detalles].sort(...)');
});

prueba('la lista de referencia del pedido va en el MISMO orden', () => {
  assert.ok(/\[\.\.\.prov\.detalles\]\.sort\(ordenAlfabetico\)\.map\(\(det, di\)/.test(PAGINA),
    'el bloque «Distribución de Unidades (pedido)» del modal de revisión también');
});

prueba('la tabla de CAPTURA sigue sin ordenarse', () => {
  // Las filas de captura se pintan tal como vienen. Si alguien mete el
  // comparador aquí, escribir una referencia haría saltar la línea de sitio.
  assert.ok(/\{prov\.detalles\.map\(\(det, di\) => \(\s*\n\s*<FilaDistribucion/.test(PAGINA),
    'las líneas de distribución se pintan en el orden en que se teclean');
});

prueba('está escrito POR QUÉ no se ordena en el servidor', () => {
  assert.ok(/POR QUÉ AQUÍ Y NO EN EL SERVIDOR/.test(PAGINA),
    'la siguiente persona que lo vea va a querer moverlo a la consulta SQL');
});

console.log('\nLas pacas de cada proveedor en el resumen de costos');

prueba('el resumen cuenta las unidades de cada proveedor', () => {
  assert.ok(/const unidadesLineas = \(p\.detalles \|\| \[\]\)\.reduce/.test(PAGINA));
  assert.ok(/const unidades = unidadesLineas > 0 \? unidadesLineas : unidadesEstimadas/.test(PAGINA),
    'las líneas mandan y, mientras no haya, lo estimado: el mismo orden que el costo');
  assert.ok(/costoPorUnidadPropia: unidades > 0 \? costoEnCOP \/ unidades : 0/.test(PAGINA),
    'lo que cuesta una paca DE ESE proveedor, que no es su costo repartido entre el contenedor');
});

prueba('el consolidado enseña las pacas del contenedor', () => {
  assert.ok(/Pacas del contenedor/.test(PAGINA));
  assert.ok(/las líneas suman \{resumen\.sumDetalles/.test(PAGINA),
    'y avisa cuando las líneas no suman lo declarado, en vez de elegir una de las dos');
});

console.log(`\n${malos === 0 ? 'Las pacas se revisan en el orden en que están en el suelo' : malos + ' fallo(s)'}\n`);
process.exit(malos === 0 ? 0 : 1);
