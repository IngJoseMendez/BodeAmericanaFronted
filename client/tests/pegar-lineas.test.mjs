// PEGAR 61 LÍNEAS DE UNA VEZ NO PUEDE INVENTARSE NINGUNA.
//
// La factura del proveedor ya existe en Excel; pegarla entera es lo que hace
// que capturar aquí sea más rápido que capturar allí. Pero todo en este sistema
// se cruza por NOMBRE: una referencia que no casa con el catálogo nace sin
// familia, se queda sin precio en cotizaciones, y eso no se descubre hasta tres
// semanas después al abrir el Excel de matriz. Con 61 líneas de golpe, un
// cruce silencioso mal hecho es un contenedor entero mal cargado.
//
// Lo que se prueba aquí es exactamente eso: que lo que no casa se CONSERVE y se
// MARQUE, nunca se sustituya por lo más parecido; y que un pegado normal de una
// palabra en un campo siga funcionando como siempre.

import { leerBloquePegado, cruzarConCatalogo, numeroPegado } from '../src/lib/pegarLineas.js';

let malos = 0;
const ok = (etiqueta, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(58)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esp)}`);
};

// El catálogo real de la operación, en minúsculas como está en la base.
const CATALOGOS = {
  categoria: ['verano', 'invierno', 'clasificación'],
  clasificacion: ['hombre', 'mujer', 'mixta', 'niño', 'hogar'],
  calidad: ['premium', 'supreme', 'especial', 'diamante'],
  referencia: ['mixta hombre', 'deportivo', 'blusa short', 'chaqueta mixta', 'jean short'],
};
const CATEGORIA_DE = (ref) => ({
  'mixta hombre': 'verano', deportivo: 'verano', 'blusa short': 'verano',
  'chaqueta mixta': 'invierno', 'jean short': 'verano',
}[ref] || '');

// ── UN PEGADO NORMAL NO SE CONVIERTE EN UN BLOQUE ──────────────────────────
console.log('\nQué cuenta como bloque');
ok('una palabra suelta: no es bloque', leerBloquePegado('premium'), null);
ok('vacío: no es bloque', leerBloquePegado(''), null);
ok('un nombre con espacios tampoco', leerBloquePegado('mixta hombre'), null);
ok('con tabulador sí es bloque', Boolean(leerBloquePegado('verano\thombre')), true);
ok('con salto de línea también', Boolean(leerBloquePegado('verano\ninvierno')), true);

// ── LA HOJA DE ELLA, TAL COMO ESTÁ ─────────────────────────────────────────
// PROVEEDORES MERCANCIA.xlsx trae la columna de REFERENCIA rotulada
// «PROVEEDOR», igual que la primera. No se puede adivinar cuál es cuál, así que
// esa columna se deja SIN asignar y la previsualización obliga a decirlo. Es
// justo lo contrario de adivinar: entre equivocarse y preguntar, pregunta.
console.log('\nLa hoja real (CONT6_26FACTURA)');
const hojaReal = [
  'PROVEEDOR\tCATEGORIA\tCLASIFICACION\tPROVEEDOR\tCALIDAD\tCANTIDAD\tPRECIO\tTOTAL',
  'DIAS\tVERANO\tHOMBRE\tMIXTA HOMBRE\tPREMIUM\t1\t320\t320',
  'DIAS\tVERANO\tMIXTA\tDEPORTIVO\tPREMIUM\t4\t320\t1280',
].join('\n');
const bloqueReal = leerBloquePegado(hojaReal);
ok('reconoce la fila de rótulos', bloqueReal.cabeceraDetectada, true);
ok('lee las dos líneas de datos', bloqueReal.cuerpo.length, 2);
ok('mapea lo que sí sabe leer',
  bloqueReal.columnas,
  ['', 'categoria', 'clasificacion', '', 'calidad', 'cantidad', 'costo_unitario', '']);
ok('y NO adivina cuál de las dos «PROVEEDOR» es la referencia',
  bloqueReal.columnas.filter((c) => c === 'referencia').length, 0);

// Con la columna 4 asignada a mano en la previsualización, ya cuadra todo.
const corregido = { ...bloqueReal, columnas: bloqueReal.columnas.map((c, i) => (i === 3 ? 'referencia' : c)) };
const cruceReal = cruzarConCatalogo(corregido, CATALOGOS, CATEGORIA_DE);
ok('corrigiendo la columna, todo casa', cruceReal.sinCasar, 0);
ok('primera línea completa', cruceReal.lineas[0].linea,
  { categoria: 'verano', clasificacion: 'hombre', referencia: 'mixta hombre',
    calidad: 'premium', cantidad: '1', costo_unitario: '320' });

// ── SIN RÓTULOS: POR POSICIÓN ──────────────────────────────────────────────
console.log('\nSin fila de rótulos');
const sinRotulos = leerBloquePegado('verano\tmixta\tdeportivo\tpremium\t4\t320');
ok('no se inventa una cabecera', sinRotulos.cabeceraDetectada, false);
ok('asigna por posición', sinRotulos.columnas,
  ['categoria', 'clasificacion', 'referencia', 'calidad', 'cantidad', 'costo_unitario']);
ok('y no se come la fila de datos', sinRotulos.cuerpo.length, 1);

// UNA sola celda que suene a rótulo no basta: si bastara, una línea de datos
// que empiece por «verano» se tragaría como cabecera y se perdería entera.
const casiRotulo = leerBloquePegado('categoria\tmixta\tdeportivo\npremium\tmixta\tjean short');
ok('un solo acierto NO es una cabecera', casiRotulo.cabeceraDetectada, false);
ok('así no se pierde ninguna línea', casiRotulo.cuerpo.length, 2);

// ── CRUZAR CONTRA EL CATÁLOGO ──────────────────────────────────────────────
console.log('\nCruzar con el catálogo');
const conRuido = leerBloquePegado([
  'INVIERNO\tMIXTA\tCHAQUETA MIXTA\tDIAMANTE\t2\t450',
  'Verano\tNiño\tPantalón Rojo\tPremium\t3\t180',
].join('\n'));
const cruce = cruzarConCatalogo(conRuido, CATALOGOS, CATEGORIA_DE);

ok('mayúsculas y tildes no impiden casar', cruce.lineas[0].linea.referencia, 'chaqueta mixta');
ok('y devuelve el nombre del catálogo, no el tecleado', cruce.lineas[0].linea.clasificacion, 'mixta');
ok('lo que casa no lleva avisos', cruce.lineas[0].avisos, []);
ok('la ñ y el acento casan', cruce.lineas[1].linea.clasificacion, 'niño');

// Lo que NO está en el catálogo se CONSERVA tal cual y se marca. Sustituirlo
// por lo más parecido ("pantalón rojo" → "pantalón") es el error que esta
// previsualización existe para evitar.
ok('lo que no existe se conserva tal cual', cruce.lineas[1].linea.referencia, 'Pantalón Rojo');
ok('y queda marcado', cruce.lineas[1].avisos, ['referencia']);
ok('se cuentan las líneas con problemas', cruce.sinCasar, 1);

// ── LA CATEGORÍA LA MANDA EL CATÁLOGO ──────────────────────────────────────
console.log('\nLa categoría sale de la referencia');
const catMal = cruzarConCatalogo(
  leerBloquePegado('INVIERNO\tMIXTA\tDEPORTIVO\tPREMIUM\t4\t320'), CATALOGOS, CATEGORIA_DE);
ok('una categoría equivocada se corrige por la referencia', catMal.lineas[0].linea.categoria, 'verano');
ok('y no se queda marcada como problema', catMal.lineas[0].avisos, []);

const sinCat = cruzarConCatalogo(
  { columnas: ['clasificacion', 'referencia'], cuerpo: [['mixta', 'jean short']] },
  CATALOGOS, CATEGORIA_DE);
ok('si la hoja no la trae, se rellena sola', sinCat.lineas[0].linea.categoria, 'verano');

// Una referencia fuera del catálogo no tiene categoría que copiar: se respeta
// lo que venía escrito en vez de vaciarlo.
const refRara = cruzarConCatalogo(
  { columnas: ['categoria', 'referencia'], cuerpo: [['verano', 'gorra']] }, CATALOGOS, CATEGORIA_DE);
ok('sin categoría en el catálogo, se respeta la pegada', refRara.lineas[0].linea.categoria, 'verano');

// ── NÚMEROS COMO LOS ESCRIBE EXCEL ─────────────────────────────────────────
console.log('\nNúmeros');
ok('entero simple', numeroPegado('320'), '320');
ok('miles con punto y decimal con coma', numeroPegado('1.234,56'), '1234.56');
ok('decimal con punto', numeroPegado('1234.56'), '1234.56');
ok('con espacios', numeroPegado('  24  '), '24');
// EL PUNTO ES AMBIGUO Y AQUÍ VALE DINERO. "1.500" en la hoja de ella son mil
// quinientos; leerlo como 1,5 divide el costo por mil, y eso se propaga al
// costo del contenedor, al precio mínimo y al precio de venta de cada paca sin
// que falle nada por el camino.
ok('1.500 son mil quinientos, no uno y medio', numeroPegado('$ 1.500'), '1500');
ok('varios puntos son miles', numeroPegado('1.234.567'), '1234567');
ok('un punto con dos cifras detrás es decimal', numeroPegado('1.50'), '1.50');
ok('un punto con una cifra detrás es decimal', numeroPegado('1.5'), '1.5');
ok('con cuatro cifras delante, el punto es decimal', numeroPegado('1234.567'), '1234.567');
ok('menos de mil con decimales', numeroPegado('0.75'), '0.75');
// Vacío y NO 0: un 0 en cantidad o en costo se lee como «esta línea no cuesta
// nada» y así quedaría guardado. Es la regla de la casa.
ok('vacío se queda vacío, no en 0', numeroPegado(''), '');
ok('texto que no es número, vacío', numeroPegado('n/a'), '');
ok('nulo, vacío', numeroPegado(null), '');

// ── COLUMNAS DE SOBRA Y FILAS EN BLANCO ────────────────────────────────────
console.log('\nBasura que trae una hoja de verdad');
const conBlancos = leerBloquePegado('verano\tmixta\tdeportivo\n\n\nverano\tmixta\tjean short\n');
ok('las filas en blanco se descartan', conBlancos.cuerpo.length, 2);

const conSobras = cruzarConCatalogo(
  { columnas: ['categoria', '', 'referencia', ''], cuerpo: [['verano', 'basura', 'deportivo', 'mas basura']] },
  CATALOGOS, CATEGORIA_DE);
ok('una columna sin asignar se ignora', conSobras.lineas[0].linea,
  { categoria: 'verano', clasificacion: '', referencia: 'deportivo', calidad: '', cantidad: '', costo_unitario: '' });

console.log(malos
  ? `\n${malos} PRUEBA(S) FALLIDA(S)`
  : '\nPegar desde Excel no inventa ni pierde ninguna línea');
process.exit(malos ? 1 : 0);
