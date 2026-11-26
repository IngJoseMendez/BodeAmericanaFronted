// ── LA FAMILIA DE UNA REFERENCIA, DEDUCIDA DE SU NOMBRE ─────────────────────
//
// La vista de «lo repartido» agrupa por familia: todos los «blusa …» juntos,
// todos los «buzo …» juntos. La familia se DEDUCE del nombre porque la tabla
// que debería tenerla está vacía: en producción hay 1 familia asignada de 112
// referencias.
//
// LOS CASOS DE ABAJO SON LOS DATOS REALES, medidos contra el catálogo de
// producción. No son ejemplos inventados: son exactamente las referencias que
// hay, incluidas las tres que rompían una inferencia ingenua.
import assert from 'node:assert/strict';
import { construirFamilias, primeraPalabra, normalizar } from '../src/lib/familias.js';

let malos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { malos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

// El catálogo real, tal como está escrito en la base (con sus mayúsculas).
const CATALOGO = [
  'polo deportivo', 'polo deportivo m/l', 'polo hombre', 'polo hombre ml',
  'polo jean mujer', 'polo mix', 'polo ml mujer juvenil', 'polo mujer',
  'polo short', 'polo y jeans hombre', 'polo y short hombre', 'polo y short mujer',
  'pantalon algodon', 'pantalon cargo', 'pantalon casual de hombre',
  'pantalon deportivo', 'pantalon mix', 'pantalon mujer', 'pantalon multiusos',
  'pantalon pijama', 'pantalon polar', 'pantalon sudadera', 'pantalon y licras',
  'mixta big size', 'mixta chic mujer', 'mixta hombre', 'mixta hombre invierno',
  'mixta invierno', 'mixta invierno plus size', 'mixta mujer invierno',
  'mixta mujer verano', 'mixta plus size', 'mixta verano',
  'blusa', 'blusa camiseta', 'blusa falda', 'blusa jeans', 'blusa pantalon',
  'blusa short', 'blusa vestido',
  'buzo con capota', 'buzo con capota con zipper', 'buzo con capota/joggers',
  'buzo con capota y pantalon', 'buzo deportivo con capota', 'buzo sin capota',
  'buzo y pantalon sudadera mixta', 'buzo/joggers',
  'chaqueta', 'chaqueta cuero', 'chaqueta deportiva', 'chaqueta gruesa',
  'chaqueta liviana', 'chaqueta mixta', 'chaqueta ski',
  'falda', 'falda blusa', 'falda corta blusa', 'falda mixta', 'falda vestido',
  'falda/blusa/vestido', 'faldas largas',
  'abrigo', 'abrigo moda corto', 'abrigos', 'abrigos largo', 'abrigos moda',
  'camisa hawaiana', 'camisa lenadora', 'camisa y jeans',
  'deportivo', 'deportivo invierno', 'deportivo plus size',
  'jeans', 'jeans mixto', 'jeans mujer',
  'short hombre', 'short mixto', 'short mujer',
  'vestido', 'vestido fiesta', 'vestido invierno',
  'camiseta jeans', 'camiseta jeans mujer',
  'nino invierno', 'nino verano',
  'ropa medica', 'ropa medico',
  'baby invierno', 'bata polar', 'blazer', 'chalecos', 'cubrelechos',
  // Las de `pacas` que vienen en MAYÚSCULAS, que es como están de verdad.
  'BUZO CON CAPOTA CON ZIPPER', 'SHORT MIXTO',
];

console.log('La primera palabra');

prueba('la primera palabra es la familia', () => {
  assert.equal(primeraPalabra('blusa vestido'), 'blusa');
  assert.equal(primeraPalabra('deportivo plus size'), 'deportivo');
  assert.equal(primeraPalabra('mixta hombre invierno'), 'mixta');
});

prueba('se corta en la BARRA, no sólo en el espacio', () => {
  // «buzo/joggers» sería una familia propia de una sola referencia, al lado de
  // los siete «buzo …» a los que pertenece.
  assert.equal(primeraPalabra('buzo/joggers'), 'buzo');
  assert.equal(primeraPalabra('falda/blusa/vestido'), 'falda');
  assert.equal(primeraPalabra('polo deportivo m/l'), 'polo');
});

prueba('las mayúsculas y las tildes no parten una familia en dos', () => {
  assert.equal(primeraPalabra('BUZO CON CAPOTA CON ZIPPER'), 'buzo');
  assert.equal(primeraPalabra('SHORT MIXTO'), 'short');
  assert.equal(primeraPalabra('Pantalón cargo'), 'pantalon');
  assert.equal(normalizar('  NIÑO Invierno '), 'nino invierno');
});

prueba('una referencia vacía no revienta ni inventa una familia', () => {
  for (const v of ['', '   ', null, undefined, '///']) {
    assert.equal(primeraPalabra(v), '');
  }
});

console.log('\nEl singular y el plural son la misma familia');

prueba('«abrigos» cae en «abrigo» porque «abrigo» existe en los datos', () => {
  const { claveDe } = construirFamilias(CATALOGO);
  assert.equal(claveDe('abrigos moda'), 'abrigo');
  assert.equal(claveDe('abrigo moda corto'), 'abrigo');
  assert.equal(claveDe('abrigos largo'), 'abrigo');
});

prueba('«faldas largas» cae en «falda»', () => {
  const { claveDe } = construirFamilias(CATALOGO);
  assert.equal(claveDe('faldas largas'), 'falda');
  assert.equal(claveDe('falda vestido'), 'falda');
  assert.equal(claveDe('falda/blusa/vestido'), 'falda');
});

prueba('«jeans» NO se convierte en «jean»: ese plural no se toca', () => {
  // Quitarle la «s» a todo daría una familia que nadie llama así. Se juntan
  // sólo cuando las dos formas están de verdad en los datos.
  const { claveDe, etiquetaDe } = construirFamilias(CATALOGO);
  assert.equal(claveDe('jeans mujer'), 'jeans');
  assert.equal(etiquetaDe('jeans'), 'jeans');
});

prueba('«chalecos» y «cubrelechos» se quedan como están', () => {
  const { claveDe } = construirFamilias(CATALOGO);
  assert.equal(claveDe('chalecos'), 'chalecos');
  assert.equal(claveDe('cubrelechos'), 'cubrelechos');
});

prueba('el plural en «-es» cae en su singular si está', () => {
  // «pantalones» no está hoy en el catálogo, pero se teclea solo el día que
  // alguien lo escriba. Con la regla de la «s» daría «pantalone».
  const { claveDe } = construirFamilias([...CATALOGO, 'pantalones cargo']);
  assert.equal(claveDe('pantalones cargo'), 'pantalon');
});

prueba('no junta dos familias que sólo se parecen', () => {
  // «ropa» y «polo» no comparten nada; «bata» no es el singular de nada aquí.
  const { claveDe } = construirFamilias(CATALOGO);
  assert.notEqual(claveDe('ropa medica'), claveDe('polo mujer'));
  assert.equal(claveDe('bata polar'), 'bata');
  assert.equal(claveDe('baby invierno'), 'baby');
});

console.log('\nLas familias del catálogo real');

prueba('las que más tienen salen con su cuenta medida', () => {
  const { familias } = construirFamilias(CATALOGO);
  const por = new Map(familias.map((f) => [f.clave, f.referencias.length]));
  // Medido contra producción, ya con los plurales juntos y las barras cortadas.
  assert.equal(por.get('polo'), 12, 'polo');
  assert.equal(por.get('pantalon'), 11, 'pantalon');
  assert.equal(por.get('mixta'), 10, 'mixta');
  assert.equal(por.get('blusa'), 7, 'blusa');
  assert.equal(por.get('chaqueta'), 7, 'chaqueta');
  assert.equal(por.get('deportivo'), 3, 'deportivo');
});

prueba('buzo junta los ocho, incluida la de la barra y la de mayúsculas', () => {
  const { familias } = construirFamilias(CATALOGO);
  const buzo = familias.find((f) => f.clave === 'buzo');
  assert.ok(buzo, 'tiene que existir la familia buzo');
  // Las dos escrituras de «buzo con capota con zipper» son la MISMA referencia,
  // así que cuentan una vez: 'buzo con capota', '… con zipper', '…/joggers',
  // '… y pantalon', 'buzo deportivo con capota', 'buzo sin capota',
  // 'buzo y pantalon sudadera mixta', 'buzo/joggers'.
  assert.equal(buzo.referencias.length, 8, buzo.referencias.join(' | '));
  assert.ok(buzo.referencias.includes('buzo/joggers'));
  assert.ok(buzo.referencias.includes('buzo con capota con zipper'));
});

prueba('falda junta las siete, con «faldas largas» dentro', () => {
  const { familias } = construirFamilias(CATALOGO);
  const falda = familias.find((f) => f.clave === 'falda');
  assert.equal(falda.referencias.length, 7, falda.referencias.join(' | '));
  assert.ok(falda.referencias.includes('faldas largas'));
});

prueba('abrigo junta las cinco que estaban partidas en dos', () => {
  const { familias } = construirFamilias(CATALOGO);
  const abrigo = familias.find((f) => f.clave === 'abrigo');
  assert.equal(abrigo.referencias.length, 5, abrigo.referencias.join(' | '));
});

prueba('ninguna referencia se queda sin familia', () => {
  const { claveDe } = construirFamilias(CATALOGO);
  const huerfanas = CATALOGO.filter((r) => !claveDe(r));
  assert.equal(huerfanas.length, 0, 'sin familia: ' + huerfanas.join(', '));
});

console.log('\nLa etiqueta es como se escribe, no la clave');

prueba('gana la forma más usada', () => {
  // Tres «abrigos …» y dos «abrigo …»: en pantalla dice «abrigos».
  const { etiquetaDe } = construirFamilias(CATALOGO);
  assert.equal(etiquetaDe('abrigo'), 'abrigos');
});

prueba('a igualdad gana la más corta, y el orden no cambia entre cargas', () => {
  // Dos y dos: sin un criterio de desempate la etiqueta podría salir distinta
  // en dos cargas de la misma pantalla.
  const empate = ['abrigo a', 'abrigo b', 'abrigos c', 'abrigos d'];
  const uno = construirFamilias(empate).etiquetaDe('abrigo');
  const dos = construirFamilias([...empate].reverse()).etiquetaDe('abrigo');
  assert.equal(uno, 'abrigo');
  assert.equal(dos, 'abrigo');
});

prueba('una clave que no existe se devuelve tal cual, no vacía', () => {
  const { etiquetaDe } = construirFamilias(CATALOGO);
  assert.equal(etiquetaDe('inventada'), 'inventada');
  assert.equal(etiquetaDe(''), '');
});

prueba('sin referencias no revienta y no inventa familias', () => {
  for (const v of [[], null, undefined]) {
    const { familias, claveDe, etiquetaDe } = construirFamilias(v);
    assert.equal(familias.length, 0);
    assert.equal(claveDe('blusa vestido'), 'blusa');
    assert.equal(etiquetaDe('blusa'), 'blusa');
  }
});

console.log('');
if (malos) {
  console.error(`La familia de una referencia: ${malos} comprobación(es) en rojo`);
  process.exit(1);
}
console.log('La familia se deduce del nombre y ninguna referencia queda fuera');
