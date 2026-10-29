// ── LAS TRES LISTAS DE UN ABONO ───────────────────────────────────
//
// Al registrar un abono se escoge cómo llegó la plata (Transacción), por dónde
// (Entidad) y a quién (Cuenta). Lo que se comprueba aquí es la regla que evita
// guardar un renglón que se contradice: el efectivo no entró por ningún banco
// ni cayó en ninguna cuenta, así que «Efectivo en Bancolombia a Caro» no
// significa nada y no puede llegar a la base.
//
// La regla vive en una sola función, `transaccionTieneDestino`, precisamente
// para que la pantalla y el servidor no puedan discrepar: si cada uno la
// decidiera por su cuenta, el día que cambie una de las dos se guardarían
// abonos con entidad en unos sitios y sin ella en otros.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TRANSACCIONES, etiquetaTransaccion, transaccionTieneDestino,
} from '../src/types/index.js';

let hechas = 0;
const prueba = (nombre, fn) => { fn(); hechas++; console.log('  ✓ ' + nombre); };

console.log('Las tres listas de un abono');

// ── La lista ──────────────────────────────────────────────────────
prueba('son las cuatro formas en que entra la plata, en su orden', () => {
  assert.deepEqual(TRANSACCIONES.map((t) => t.label),
    ['Efectivo', 'Consignación', 'Transferencia', 'Giro']);
});

prueba('el valor guardado va en minusculas y sin tildes', () => {
  for (const t of TRANSACCIONES) {
    assert.equal(t.value, t.value.toLowerCase(), t.value + ' tiene mayusculas');
    assert.doesNotMatch(t.value, /[áéíóúñ]/, t.value + ' lleva tilde o ñ');
  }
  // 'efectivo' es el valor que YA tiene guardado el unico abono con metodo en
  // produccion: la convencion no se cambia, se respeta.
  assert.ok(TRANSACCIONES.some((t) => t.value === 'efectivo'));
});

prueba('la etiqueta se saca del valor, y un valor viejo no se borra', () => {
  assert.equal(etiquetaTransaccion('consignacion'), 'Consignación');
  // Un metodo de los viejos ('cheque') no esta en la lista: se devuelve tal
  // cual en vez de vacio, porque enseñar vacio donde hay un dato lo esconde.
  assert.equal(etiquetaTransaccion('cheque'), 'cheque');
  assert.equal(etiquetaTransaccion(null), '');
  assert.equal(etiquetaTransaccion(undefined), '');
});

// ── La regla que importa ──────────────────────────────────────────
prueba('el efectivo NO tiene entidad ni cuenta', () => {
  assert.equal(transaccionTieneDestino('efectivo'), false);
});

prueba('las otras tres SI', () => {
  for (const v of ['consignacion', 'transferencia', 'giro']) {
    assert.equal(transaccionTieneDestino(v), true, v + ' deberia llevar destino');
  }
});

prueba('sin transaccion elegida no se pide destino', () => {
  for (const v of [null, undefined, '']) {
    assert.equal(transaccionTieneDestino(v), false);
  }
});

// ── Que la pantalla use la regla en SUS DOS salidas ───────────────
//
// El lado del servidor se comprueba en su propio repositorio
// (tests/abono-destino.test.js en BodeAmericana): son dos repos distintos y un
// test que lea el otro por una ruta hermana se rompe en cuanto alguien los
// coloca de otra forma.
prueba('la pantalla no manda entidad ni cuenta cuando no hay destino', () => {
  const cartera = fs.readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'Cartera.jsx'), 'utf8');
  // Las dos salidas (crear y corregir) tienen que pasar por la misma funcion.
  const guardas = (cartera.match(/transaccionTieneDestino\([^)]*\) && \w+\.(banco_id|cuenta_id)/g) || []).length;
  assert.equal(guardas, 4,
    'crear y corregir, por entidad y por cuenta: cuatro guardas (encontre ' + guardas + ')');
});

prueba('al pasar a efectivo los dos campos se VACIAN, no se esconden', () => {
  const cartera = fs.readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'Cartera.jsx'), 'utf8');
  // Un campo escondido que conserva lo que tenia es la forma mas silenciosa de
  // guardar un dato que nadie eligio.
  const limpiezas = (cartera.match(/transaccionTieneDestino\(\w+\) \? \w+\.(banco_id|cuenta_id)\s*:\s*''/g) || []).length;
  assert.ok(limpiezas >= 4,
    'el formulario y la fila de edicion tienen que vaciar los dos (encontre ' + limpiezas + ')');
});

console.log('');
console.log(hechas + ' comprobaciones OK, 0 fallos');
