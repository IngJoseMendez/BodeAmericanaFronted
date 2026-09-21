// UN DESPLIEGUE NO PUEDE DEJAR MUERTA LA PESTAÑA QUE YA ESTABA ABIERTA.
//
// Salió el 20/09/2026: «Failed to fetch dynamically imported module:
// …/assets/Contenedores-ezUHX687.js», y en muchas pantallas a la vez. El
// `index.html` que la pestaña descargó por la mañana conoce los nombres de los
// archivos de ESA versión; al publicar otra, esos archivos dejan de existir y
// cualquier pantalla que ella abra pide algo que ya no está.
//
// Lo que se prueba aquí es lo que decide el arreglo, que es donde puede
// equivocarse:
//   · distinguir «no pude traer el archivo» de un error de verdad de la
//     pantalla — si se confunden, un fallo real se convierte en una recarga y
//     se pierde para siempre sin que nadie lo vea;
//   · recargar una vez y no entrar en bucle — recargar en bucle deja la
//     pantalla parpadeando y sin manera de salir;
//   · y que un despliegue posterior, en la misma sesión, siga teniendo derecho
//     a su recarga.

import {
  esFalloDeDescarga, debeRecargar, cargarModulo, MENSAJE_NO_CARGA,
} from '../src/lib/cargaDiferida.js';

let malos = 0;
const ok = (etiqueta, real, esp) => {
  const bien = JSON.stringify(real) === JSON.stringify(esp);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(56)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esp)}`);
};

// ── QUÉ CUENTA COMO «NO LLEGÓ EL ARCHIVO» ──────────────────────────────────
// Cada navegador lo redacta a su manera y los cuatro tienen que entrar.
console.log('\nReconocer el fallo de descarga');
ok('Chrome/Edge',
  esFalloDeDescarga(new Error('Failed to fetch dynamically imported module: https://x/assets/Contenedores-ezUHX687.js')), true);
ok('Firefox',
  esFalloDeDescarga(new Error('error loading dynamically imported module')), true);
ok('Safari',
  esFalloDeDescarga(new Error('Importing a module script failed.')), true);
ok('hoja de estilos que no llegó',
  esFalloDeDescarga(new Error('Unable to preload CSS for /assets/index-4b1c.css')), true);

// Y lo que NO puede entrar: un error de la pantalla tiene que llegar entero al
// límite de error, no disfrazarse de recarga.
ok('un error de verdad NO es fallo de descarga',
  esFalloDeDescarga(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
ok('un fallo de la API tampoco',
  esFalloDeDescarga(new Error('Error de conexión con el servidor')), false);
ok('sin error tampoco', esFalloDeDescarga(null), false);

// ── EL FRENO ────────────────────────────────────────────────────────────────
console.log('\nCuándo se puede recargar');
const AHORA = 1_758_000_000_000;
ok('primera vez: se recarga', debeRecargar(AHORA, null), true);
ok('memoria en blanco: se recarga', debeRecargar(AHORA, ''), true);
ok('memoria con basura: se recarga', debeRecargar(AHORA, 'ayer'), true);
ok('acaba de recargar: NO se recarga', debeRecargar(AHORA, String(AHORA - 1_000)), false);
ok('justo en el límite: NO se recarga', debeRecargar(AHORA, String(AHORA - 10_000)), false);
// Un despliegue más tarde, la misma sesión vuelve a tener derecho a recargar.
ok('un rato después: se recarga otra vez', debeRecargar(AHORA, String(AHORA - 30_000)), true);

// ── LA CARGA, DE PUNTA A PUNTA ──────────────────────────────────────────────
// Sin navegador: se finge `sessionStorage` y `location.reload` para poder ver
// qué haría sin recargar nada de verdad.
console.log('\nCargar el módulo');
const memoria = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => memoria.set(k, v),
};
let recargas = 0;
globalThis.window = { location: { reload: () => { recargas++; } }, addEventListener: () => {} };

const falloDeDescarga = () => { throw new Error('Failed to fetch dynamically imported module: /assets/Contenedores-ezUHX687.js'); };

ok('lo normal: devuelve el módulo', await cargarModulo(async () => ({ ok: 1 })), { ok: 1 });

// Un tropiezo de red y a la segunda entra: la tableta pierde el wifi un
// segundo y recargar por eso sería peor que esperar.
let intentos = 0;
const tropiezo = async () => { if (++intentos === 1) falloDeDescarga(); return { ok: 2 }; };
ok('tropiezo de red: reintenta y entra', await cargarModulo(tropiezo), { ok: 2 });
ok('y no recargó por un tropiezo', recargas, 0);

// Versión nueva publicada: falla las dos veces, así que recarga.
const promesaColgada = cargarModulo(falloDeDescarga);
let resuelta = false;
promesaColgada.then(() => { resuelta = true; }, () => { resuelta = true; });
await new Promise((listo) => setTimeout(listo, 600));
ok('versión nueva: recarga', recargas, 1);
// Mientras la página se va, la promesa se queda colgada a propósito: así el
// spinner sigue puesto en vez de enseñar un error que dura un parpadeo.
ok('y deja el spinner puesto, sin error', resuelta, false);

// Si tras recargar vuelve a fallar, ya no es la versión: no se recarga otra
// vez y el error sale con un mensaje que se entiende.
let mensaje = '';
try { await cargarModulo(falloDeDescarga); } catch (e) { mensaje = e.message; }
ok('a la segunda ya no recarga', recargas, 1);
ok('y avisa con palabras', mensaje, MENSAJE_NO_CARGA);

// Un error de verdad de la pantalla sale tal cual, sin recargas ni reintentos.
let real = '';
let veces = 0;
try {
  await cargarModulo(async () => { veces++; throw new TypeError('x.map is not a function'); });
} catch (e) { real = e.message; }
ok('un error real sale tal cual', real, 'x.map is not a function');
ok('y no se reintenta', veces, 1);
ok('ni se recarga', recargas, 1);

console.log(malos
  ? `\n${malos} PRUEBA(S) FALLIDA(S)`
  : '\nUn despliegue ya no deja muerta la pestaña abierta');
process.exit(malos ? 1 : 0);
