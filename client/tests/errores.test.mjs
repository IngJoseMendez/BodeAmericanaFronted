// ── LO QUE SE LE DICE A UNA PERSONA CUANDO ALGO FALLA ─────────────
//
// Se comprueban tres cosas, por este orden de importancia:
//
//   1. Que NUNCA se prometa «no se guardó nada» cuando no se puede saber. Un
//      tiempo de espera agotado salió del dispositivo: puede haberse guardado
//      y haberse perdido sólo la respuesta. Decirle que no se guardó la lleva
//      a repetir el abono, y entonces el cliente aparece pagando dos veces.
//   2. Que un error del navegador no se enseñe como si fuera la causa. «Cannot
//      read properties of undefined» no es un error para quien está en la
//      bodega: es un susto. Va apartado al final, entre paréntesis.
//   3. Que todo mensaje diga qué hacer, y que no diga dos cosas que hacer.
import assert from 'node:assert/strict';
import { mensajeDeError, clasificarError } from '../src/lib/errores.js';

let hechas = 0;
const prueba = (nombre, fn) => {
  fn();
  hechas++;
  console.log('  \u2713 ' + nombre);
};

const conStatus = (status, message) => Object.assign(new Error(message), { status });

console.log('Los mensajes de error');

// ── 1. La promesa que no se puede hacer ───────────────────────────
prueba('la red caída SÍ puede prometer que no se guardó nada', () => {
  const m = mensajeDeError(new Error('No hay conexión con el servidor.'), 'registrar el abono');
  assert.match(m, /no se guardó nada/);
});

prueba('el tiempo agotado NO promete que no se guardó nada', () => {
  const m = mensajeDeError(
    new Error('El servidor no respondió a tiempo. Revisa tu conexión e inténtalo de nuevo.'),
    'registrar el abono');
  assert.doesNotMatch(m, /no se guardó nada/,
    'un tiempo agotado puede haberse guardado: prometer lo contrario hace repetir el abono');
});

prueba('un 500 tampoco promete que no se guardó nada', () => {
  const m = mensajeDeError(conStatus(500, 'El servidor tuvo un problema al procesar la solicitud.'), 'guardar');
  assert.doesNotMatch(m, /no se guardó nada/);
});

// ── 2. El error del navegador, apartado ───────────────────────────
prueba('un TypeError no se enseña como causa', () => {
  const m = mensajeDeError(new TypeError("Cannot read properties of undefined (reading 'map')"), 'generar el Excel');
  assert.match(m, /^No se pudo generar el Excel\./, 'la primera frase tiene que ser utilizable');
  assert.match(m, /\(Cannot read properties of undefined \(reading 'map'\)\)$/,
    'el detalle técnico se conserva, apartado al final');
});

prueba('un error del navegador sin accion sigue siendo legible', () => {
  const m = mensajeDeError(new TypeError('x is not a function'));
  assert.match(m, /^La operación no se pudo completar\./);
  assert.match(m, /avísale a Jose/);
});

prueba('no se pierde el detalle tecnico: es lo unico que permite arreglarlo', () => {
  const m = mensajeDeError(new Error('Unexpected end of JSON input'), 'importar');
  assert.ok(m.includes('Unexpected end of JSON input'));
});

// ── 3. Una sola instrucción ───────────────────────────────────────
prueba('si la causa ya dice que hacer, no se le pega otra orden encima', () => {
  const causa = 'Tu sesión ya no es válida. Vuelve a iniciar sesión.';
  const m = mensajeDeError(conStatus(401, causa), 'guardar');
  const ordenes = (m.match(/vuelve a/gi) || []).length;
  assert.equal(ordenes, 1, 'dos ordenes seguidas se leen peor que una: ' + m);
});

prueba('si la causa no dice que hacer, se le anade el paso', () => {
  const m = mensajeDeError(conStatus(403, 'No tienes permiso para hacer esta operación.'), 'borrar el cliente');
  assert.match(m, /permiso de administrador/);
});

// ── La clasificación ──────────────────────────────────────────────
prueba('clasifica por texto antes que por codigo, porque la red no trae codigo', () => {
  assert.equal(clasificarError(new Error('No hay conexión con el servidor.')), 'conexion');
  assert.equal(clasificarError(new Error('El servidor no respondió a tiempo.')), 'tiempo');
});

prueba('clasifica cada familia de codigo HTTP', () => {
  assert.equal(clasificarError(conStatus(401, 'x')), 'sesion');
  assert.equal(clasificarError(conStatus(403, 'x')), 'permiso');
  assert.equal(clasificarError(conStatus(409, 'x')), 'choque');
  assert.equal(clasificarError(conStatus(400, 'x')), 'datos');
  assert.equal(clasificarError(conStatus(422, 'x')), 'datos');
  assert.equal(clasificarError(conStatus(429, 'x')), 'servidor');
  assert.equal(clasificarError(conStatus(502, 'x')), 'servidor');
});

prueba('el mensaje del servidor se respeta: ya es el especifico', () => {
  const m = mensajeDeError(
    conStatus(400, 'El abono ($5.000.000) excede el saldo pendiente ($2.000.000)'), 'registrar el abono');
  assert.ok(m.includes('excede el saldo pendiente ($2.000.000)'),
    'el servidor sabe el porque exacto; no se reemplaza por un texto genérico');
});

// ── Lo que no puede reventar ──────────────────────────────────────
prueba('no revienta con un error raro', () => {
  for (const malo of [null, undefined, {}, 'un texto suelto', 0]) {
    const m = mensajeDeError(malo, 'hacer algo');
    assert.equal(typeof m, 'string');
    assert.ok(m.length > 10, 'ni vacio ni un fragmento: ' + JSON.stringify(m));
  }
});

prueba('nunca devuelve algo que empiece o acabe en basura', () => {
  const casos = [
    mensajeDeError(new Error('No hay conexión con el servidor.'), 'guardar'),
    mensajeDeError(conStatus(500, 'Error interno'), ''),
    mensajeDeError(new TypeError('boom'), 'exportar'),
  ];
  for (const m of casos) {
    assert.equal(m, m.trim());
    assert.doesNotMatch(m, /^[:.,]/);
    assert.doesNotMatch(m, /\s:/);
  }
});

console.log('');
console.log(hechas + ' comprobaciones OK, 0 fallos');
