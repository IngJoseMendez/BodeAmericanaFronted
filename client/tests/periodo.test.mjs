// ── EL PERIODO DE UN REPORTE ──────────────────────────────────────
//
// `mes` en null = el año entero. Lo que se protege aquí:
//
//   1. LA IDA Y VUELTA. Escribir un periodo en la URL y volver a leerlo tiene
//      que devolver el mismo periodo. Si no, pulsar atrás o recargar enseñaría
//      un mes distinto del que dice la barra de direcciones, y entonces las
//      cifras de la pantalla no serían del periodo que se cree estar mirando.
//      Es por esto que el año entero se escribe `mes=todo` en vez de dejar el
//      parámetro fuera: `?anio=2026` a secas no se puede distinguir de
//      septiembre de 2026.
//
//   2. QUE UNA URL ROTA NO ROMPA LA PANTALLA. La puede escribir una persona a
//      mano o venir de un enlace viejo. `?mes=19` no puede dejarla en blanco ni
//      pedirle al servidor un mes que no existe.
//
//   3. EL CRUCE DE AÑO. Un paso atrás desde enero es diciembre del año
//      anterior. Es la clase de aritmética que parece obvia y sale mal.
import assert from 'node:assert/strict';
import {
  leerPeriodoDeUrl, periodoAParams, moverPeriodo, periodoDeHoy,
} from '../src/lib/periodo.js';

let hechas = 0;
const prueba = (nombre, fn) => { fn(); hechas++; console.log('  ✓ ' + nombre); };

// Un día fijo para no depender de cuándo se corra la prueba.
const AHORA = new Date(2026, 9, 29); // 29 de octubre de 2026 (mes 10)
const url = (s) => new URLSearchParams(s);

console.log('El periodo de un reporte');

// ── 1. La ida y vuelta ────────────────────────────────────────────
prueba('escribir y volver a leer devuelve el MISMO periodo', () => {
  const casos = [
    { anio: 2026, mes: 1 },
    { anio: 2026, mes: 12 },
    { anio: 2024, mes: 7 },
    { anio: 2026, mes: null },   // el año entero
    { anio: 1999, mes: null },
  ];
  for (const p of casos) {
    const escrito = periodoAParams(p);
    const leido = leerPeriodoDeUrl(url(escrito), AHORA);
    assert.deepEqual(leido, p,
      'se rompio la ida y vuelta de ' + JSON.stringify(p) + ' -> ' + JSON.stringify(escrito));
  }
});

prueba('el año entero se escribe mes=todo, no se omite el parametro', () => {
  assert.deepEqual(periodoAParams({ anio: 2026, mes: null }), { anio: '2026', mes: 'todo' });
  // Y la razon: sin el, esta URL seria ambigua.
  assert.deepEqual(leerPeriodoDeUrl(url({ anio: '2026', mes: 'todo' }), AHORA),
    { anio: 2026, mes: null });
});

// ── 2. Lo que no puede romper la pantalla ─────────────────────────
prueba('sin parametros, el mes de hoy', () => {
  assert.deepEqual(leerPeriodoDeUrl(url(''), AHORA), { anio: 2026, mes: 10 });
  assert.deepEqual(leerPeriodoDeUrl(url(''), AHORA), periodoDeHoy(AHORA));
});

prueba('un mes imposible cae en el mes de hoy, no en blanco', () => {
  for (const malo of ['0', '13', '19', '-3', 'abril', '', 'null']) {
    const p = leerPeriodoDeUrl(url({ anio: '2026', mes: malo }), AHORA);
    assert.equal(p.anio, 2026);
    assert.ok(p.mes >= 1 && p.mes <= 12, 'mes=' + malo + ' dio ' + p.mes);
  }
});

prueba('un anio imposible cae en el de hoy', () => {
  for (const malo of ['', 'ayer', 'NaN']) {
    const p = leerPeriodoDeUrl(url({ anio: malo, mes: '5' }), AHORA);
    assert.equal(p.anio, 2026, 'anio=' + malo + ' dio ' + p.anio);
    assert.equal(p.mes, 5);
  }
});

prueba('no revienta sin parametros de ningun tipo', () => {
  for (const nada of [null, undefined, {}]) {
    const p = leerPeriodoDeUrl(nada, AHORA);
    assert.deepEqual(p, { anio: 2026, mes: 10 });
  }
});

prueba('solo el mes, sin anio: el anio de hoy', () => {
  assert.deepEqual(leerPeriodoDeUrl(url({ mes: '3' }), AHORA), { anio: 2026, mes: 3 });
});

// ── 3. El cruce de año ────────────────────────────────────────────
prueba('un paso atras desde enero es diciembre del anio anterior', () => {
  assert.deepEqual(moverPeriodo({ anio: 2026, mes: 1 }, -1), { anio: 2025, mes: 12 });
});

prueba('un paso adelante desde diciembre es enero del siguiente', () => {
  assert.deepEqual(moverPeriodo({ anio: 2025, mes: 12 }, 1), { anio: 2026, mes: 1 });
});

prueba('doce pasos son un anio exacto, en los dos sentidos', () => {
  assert.deepEqual(moverPeriodo({ anio: 2026, mes: 7 }, 12), { anio: 2027, mes: 7 });
  assert.deepEqual(moverPeriodo({ anio: 2026, mes: 7 }, -12), { anio: 2025, mes: 7 });
});

prueba('con el anio entero puesto, los pasos mueven de ANIO', () => {
  assert.deepEqual(moverPeriodo({ anio: 2026, mes: null }, -1), { anio: 2025, mes: null });
  assert.deepEqual(moverPeriodo({ anio: 2026, mes: null }, 1), { anio: 2027, mes: null });
});

prueba('moverse y escribir en la URL se llevan bien', () => {
  // El recorrido completo: estoy en enero, doy un paso atras, y lo que queda en
  // la URL se lee como diciembre del anio anterior.
  let p = { anio: 2026, mes: 1 };
  p = moverPeriodo(p, -1);
  p = leerPeriodoDeUrl(url(periodoAParams(p)), AHORA);
  assert.deepEqual(p, { anio: 2025, mes: 12 });
});

console.log('');
console.log(hechas + ' comprobaciones OK, 0 fallos');
