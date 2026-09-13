// Pruebas del campo que pone los puntos de miles mientras se escribe.
//
// Son dos cosas distintas y las dos se rompen fácil: el TEXTO que queda y dónde
// queda el CURSOR. Lo segundo no se ve en una captura de pantalla y es lo que
// hace que un campo así sea usable o haya que pelearlo: si al corregir un dígito
// en medio de 1.500.000 el cursor salta al final, el campo no sirve.
//
// Y una tercera, la que de verdad importa: que lo que el campo guarda se pueda
// volver a leer como número. parseFloat("1.500.000") es 1,5 y parseInt es 1.

import {
  formatearTecleado, textoDesdeValor, crudoDesdeTecleado,
  cuentaUtiles, posTrasUtiles, parseMonto, agruparMiles, corregirBorradoDeSeparador,
} from '../src/lib/money.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 52 - t.length)));
function comprobar(etiqueta, real, esperado) {
  const bien = Object.is(real, esperado) ||
    (typeof real === 'number' && typeof esperado === 'number' && Math.abs(real - esperado) < 1e-9);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(42)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esperado)}`);
}

grupo('Se escribe y aparecen los puntos');
comprobar('1500000',                    formatearTecleado('1500000'), '1.500.000');
comprobar('un dígito',                  formatearTecleado('1'), '1');
comprobar('tres dígitos, aún sin punto', formatearTecleado('999'), '999');
comprobar('el cuarto ya lo pone',       formatearTecleado('1000'), '1.000');
comprobar('vacío se queda vacío',       formatearTecleado(''), '');
comprobar('negativo',                   formatearTecleado('-45000'), '-45.000');

grupo('Los puntos los pone el campo, no la persona');
comprobar('pegar "1.500.000"',          formatearTecleado('1.500.000'), '1.500.000');
comprobar('pegar "$ 1.500.000 COP"',    formatearTecleado('$ 1.500.000 COP'), '1.500.000');
comprobar('letras sueltas se caen',     formatearTecleado('1a5b0c0'), '1.500');

grupo('La coma es el decimal y sobrevive a medio escribir');
comprobar('"285,50"',                   formatearTecleado('285,50'), '285,50');
comprobar('coma recién puesta',         formatearTecleado('1500,'), '1.500,');
comprobar('solo la coma',               formatearTecleado(','), '0,');
comprobar('una segunda coma se ignora', formatearTecleado('1,5,7'), '1,57');
comprobar('se corta en 2 decimales',    formatearTecleado('1500,999'), '1.500,99');
comprobar('con 0 decimales la coma CORTA', formatearTecleado('1500,5', 0), '1.500');

grupo('Ceros a la izquierda');
comprobar('"007" es 7',                 formatearTecleado('007'), '7');
comprobar('un cero solo se queda',      formatearTecleado('0'), '0');
comprobar('"0,5" se queda',             formatearTecleado('0,5'), '0,5');

grupo('Lo que llega de fuera entra en formato');
comprobar('número 1500000',             textoDesdeValor(1500000), '1.500.000');
comprobar('número con decimales',       textoDesdeValor(1500.5), '1.500,5');
comprobar('texto del servidor "45000.00"', textoDesdeValor('45000.00'), '45.000');
comprobar('vacío',                      textoDesdeValor(''), '');
comprobar('nulo',                       textoDesdeValor(null), '');
comprobar('cero es un valor, no vacío', textoDesdeValor(0), '0');

grupo('Se ve formateado, se entrega crudo');
comprobar('"1.500.000" sale como',      crudoDesdeTecleado('1.500.000'), '1500000');
comprobar('"285,50" sale como',         crudoDesdeTecleado('285,50'), '285.50');
comprobar('coma a medio escribir',      crudoDesdeTecleado('1.500,'), '1500.');
comprobar('negativo',                   crudoDesdeTecleado('-45.000'), '-45000');
comprobar('vacío sigue vacío',          crudoDesdeTecleado(''), '');
comprobar('solo una coma es vacío',     crudoDesdeTecleado(','), '');

grupo('LO QUE ENTREGA LO LEE EL SISTEMA COMO SIEMPRE');
// Este es el grupo que justifica el diseño: el campo enseña los puntos, pero
// entrega el número de siempre, así que los parseFloat y parseInt que ya había
// repartidos por todo el sistema siguen leyendo bien sin tocar ni uno.
for (const n of [0, 1, 999, 1000, 45000, 1234567, 98000.5, 285.5]) {
  const visto = formatearTecleado(textoDesdeValor(n));
  const crudo = crudoDesdeTecleado(visto);
  comprobar(`${n} → se ve ${JSON.stringify(visto)} → parseFloat`, parseFloat(crudo) || 0, n);
  comprobar(`${n} → parseMonto también`, parseMonto(crudo), n);
}
comprobar('parseInt de un entero grande', parseInt(crudoDesdeTecleado('1.234.567'), 10), 1234567);
comprobar('y a medio teclear no revienta', parseFloat(crudoDesdeTecleado('1.500,')) || 0, 1500);

grupo('Por qué NO se guarda el texto formateado');
comprobar('parseFloat("1.500.000") es 1,5', parseFloat('1.500.000'), 1.5);
comprobar('parseInt("1.500.000") es 1',     parseInt('1.500.000', 10), 1);
comprobar('parseMonto sí lo lee',           parseMonto('1.500.000'), 1500000);

grupo('El cursor se queda donde estaba');
// Se teclea un 9 delante de "1.500.000" -> el texto crudo que llega es
// "91.500.000" con el cursor en 1. Tras reformatear son "91.500.000" y el
// cursor tiene que seguir tras el primer dígito.
{
  const crudo = '91.500.000', cursor = 1;
  const utiles = cuentaUtiles(crudo, cursor);
  const fmt = formatearTecleado(crudo);
  comprobar('texto tras teclear el 9 al principio', fmt, '91.500.000');
  comprobar('el cursor sigue tras el primer dígito', posTrasUtiles(fmt, utiles), 1);
}
// Se teclea un 4 en medio: "1.5400.000" con el cursor tras el 4 (posición 4).
{
  const crudo = '1.5400.000', cursor = 4;
  const utiles = cuentaUtiles(crudo, cursor);   // 1,5,4 -> 3
  const fmt = formatearTecleado(crudo);
  comprobar('reagrupa al meter un dígito en medio', fmt, '15.400.000');
  comprobar('el cursor queda tras el dígito tecleado', posTrasUtiles(fmt, utiles), 4);
  comprobar('y ahí está el 4', fmt[posTrasUtiles(fmt, utiles) - 1], '4');
}
// Al final de todo.
{
  const crudo = '1500000', cursor = 7;
  const fmt = formatearTecleado(crudo);
  comprobar('cursor al final', posTrasUtiles(fmt, cuentaUtiles(crudo, cursor)), fmt.length);
}
// Un punto no cuenta como carácter útil: el cursor no se ancla a él.
comprobar('los puntos no cuentan', cuentaUtiles('1.500.000', 9), 7);
comprobar('la coma sí cuenta',     cuentaUtiles('1.500,25', 8), 7);
comprobar('cursor al inicio',      posTrasUtiles('1.500.000', 0), 0);

grupo('Retroceso sobre un punto de miles');
// Sin esto, con el cursor detras del punto de "1.500" el retroceso borra el
// punto, el campo lo vuelve a poner y parece que la tecla no funciona.
{
  // "15.400.000" con el cursor en 3: se borro el punto -> llega "15400.000"
  const r = corregirBorradoDeSeparador('15400.000', '15.400.000', 2, 'Backspace');
  comprobar('borra el digito de delante (el 5)', r.cadena, '1400000');
  comprobar('y el cursor retrocede uno', r.cuenta, 1);
  comprobar('lo que se ve', formatearTecleado(r.cadena), '1.400.000');
}
{
  // Suprimir mira al otro lado
  const r = corregirBorradoDeSeparador('15400.000', '15.400.000', 2, 'Delete');
  comprobar('suprimir borra el de despues', r.cadena, '1500000');
  comprobar('y el cursor no se mueve', r.cuenta, 2);
}
{
  // Un retroceso normal sobre un DIGITO no se toca
  const r = corregirBorradoDeSeparador('1.500.00', '1.500.000', 7, 'Backspace');
  comprobar('borrar un digito se respeta', r.cadena, '150000');
  comprobar('y la cuenta tampoco cambia', r.cuenta, 7);
}
{
  // Escribir no es borrar
  const r = corregirBorradoDeSeparador('1.500.0009', '1.500.000', 8, 'ADD');
  comprobar('teclear no dispara la correccion', r.cadena, '15000009');
}

grupo('agruparMiles por su cuenta');
comprobar('vacío',      agruparMiles(''), '');
comprobar('3 cifras',   agruparMiles('123'), '123');
comprobar('4 cifras',   agruparMiles('1234'), '1.234');
comprobar('7 cifras',   agruparMiles('1234567'), '1.234.567');

console.log('');
if (malos) {
  console.log(`✗ ${malos} FALLO(S) EN EL CAMPO DE DINERO`);
  process.exit(1);
}
console.log('✅ EL CAMPO DE DINERO FORMATEA Y NO PIERDE EL CURSOR');
