import { lazy } from 'react';

// ── CUANDO SALE UNA VERSIÓN NUEVA, LA PESTAÑA ABIERTA SE QUEDA COJA ─────────
//
// EL FALLO, TAL CUAL LO VE LA OPERACIÓN
//   «Failed to fetch dynamically imported module:
//    https://…/assets/Contenedores-ezUHX687.js»
// y pasa en muchas pantallas a la vez, sin tocar nada.
//
// POR QUÉ
// Las pantallas se cargan por separado (`import()`), y al compilar cada una
// queda en un archivo con un hash en el nombre: `Contenedores-ezUHX687.js`. El
// `index.html` que la pestaña descargó al abrirse es el que sabe esos nombres.
//
// Cada despliegue genera hashes nuevos y publica SOLO los archivos nuevos: los
// de la versión anterior dejan de existir. Así que una pestaña que lleva
// abierta desde antes del despliegue —y en esta operación la tableta pasa el
// día entera con el sistema abierto— sigue pidiendo `Contenedores-ezUHX687.js`,
// que ya no está. El servidor responde el `index.html` (por la regla que manda
// todo a la aplicación), el navegador recibe HTML donde esperaba JavaScript, y
// revienta. Como el `index.html` viejo apunta a TODAS las pantallas con hashes
// viejos, falla cualquiera que ella abra: de ahí el «en muchos lugares».
//
// No es un error de código ni de red: es que el código que la pestaña busca ya
// no existe. La única salida real es volver a pedir el `index.html`, que es
// exactamente lo que hace recargar.
//
// POR QUÉ RECARGAR SOLA NO LE PISA EL TRABAJO
// Esto solo salta al ABRIR otra pantalla, o sea cuando ya está dejando la que
// tenía. Y lo que se estaba escribiendo en Contenedores vive en el borrador del
// navegador (`bodega_contenedor_borrador`), que sobrevive a la recarga. Recarga
// la MISMA dirección que acababa de pedir, así que aterriza donde iba.
//
// EL FRENO
// Si tras recargar vuelve a fallar, ya no es la versión: es la conexión, o el
// archivo de verdad no está. Recargar otra vez la dejaría en un bucle con la
// pantalla parpadeando, así que a partir del segundo intento se deja pasar el
// error y el límite de error enseña un mensaje que se entiende. Por eso el
// freno mira la HORA y no un «ya recargué»: un despliegue más tarde, en la
// misma sesión, tiene derecho a su recarga.

const CLAVE_RECARGA = 'app.recarga-por-version';
const ESPERA_ENTRE_RECARGAS_MS = 10_000;
const ESPERA_ANTES_DE_REINTENTAR_MS = 350;

export const MENSAJE_NO_CARGA =
  'No se pudo cargar esta pantalla. Revisa la conexión y vuelve a intentarlo; ' +
  'si acaba de salir una versión nueva del sistema, recarga la página.';

/**
 * ¿Este error es «el archivo de la pantalla no se pudo traer»?
 *
 * Cada navegador lo redacta distinto —y por eso se comprueban los cuatro
 * textos—, pero todos significan lo mismo: el `import()` no consiguió el
 * módulo. Se mira el texto porque no hay un tipo de error propio para esto.
 * Cualquier otro fallo (un error de verdad dentro de la pantalla) NO entra
 * aquí: ese tiene que llegar entero al límite de error, no disfrazarse de
 * recarga.
 */
export function esFalloDeDescarga(error) {
  const texto = String(error?.message || error || '');
  return (
    texto.includes('Failed to fetch dynamically imported module') ||   // Chrome, Edge
    texto.includes('error loading dynamically imported module') ||      // Firefox
    texto.includes('Importing a module script failed') ||               // Safari
    texto.includes('Unable to preload CSS')                             // Vite, hoja de estilos
  );
}

/**
 * ¿Toca recargar? Sí si no hemos recargado nunca o si la última vez fue hace
 * más de diez segundos.
 *
 * @param {number} ahora           marca de tiempo actual
 * @param {string|null} ultima     lo guardado la vez anterior
 */
export function debeRecargar(ahora, ultima) {
  const anterior = Number(ultima);
  if (!Number.isFinite(anterior) || anterior <= 0) return true;
  return ahora - anterior > ESPERA_ENTRE_RECARGAS_MS;
}

// `sessionStorage` puede lanzar (ventana privada, permisos de sitio), y aquí
// estamos justo en medio de un fallo: si la memoria no está disponible se
// recarga igual, que es lo que arregla el caso normal.
function leerUltimaRecarga() {
  try { return sessionStorage.getItem(CLAVE_RECARGA); } catch { return null; }
}
function anotarRecarga(ahora) {
  try { sessionStorage.setItem(CLAVE_RECARGA, String(ahora)); } catch { /* da igual */ }
}

/** Recarga si el freno lo permite. Devuelve si recargó. */
export function recargarPorVersionNueva() {
  const ahora = Date.now();
  if (!debeRecargar(ahora, leerUltimaRecarga())) return false;
  anotarRecarga(ahora);
  window.location.reload();
  return true;
}

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Carga un módulo diferido aguantando las dos cosas que le pasan de verdad:
 * un tropiezo de red (se reintenta una vez) y una versión nueva publicada
 * (se recarga).
 *
 * @param {() => Promise<any>} importar la función de `import()`
 */
export async function cargarModulo(importar) {
  try {
    return await importar();
  } catch (error) {
    if (!esFalloDeDescarga(error)) throw error;

    // Un reintento antes de recargar: en la tableta el wifi se cae un segundo
    // y recargar por un tropiezo es peor que esperar 350 ms.
    try {
      await esperar(ESPERA_ANTES_DE_REINTENTAR_MS);
      return await importar();
    } catch (segundo) {
      if (!esFalloDeDescarga(segundo)) throw segundo;

      if (recargarPorVersionNueva()) {
        // La página se está yendo. Esta promesa no se resuelve nunca a
        // propósito: así se queda el spinner de <Suspense> hasta que la
        // recarga entra, en vez de enseñar un error que dura un parpadeo.
        return new Promise(() => {});
      }
      throw new Error(MENSAJE_NO_CARGA, { cause: segundo });
    }
  }
}

/**
 * Lo mismo que `lazy()`, pero sobreviviendo a un despliegue.
 *
 * Se usa en App.jsx para TODAS las pantallas. Si mañana se añade una, tiene que
 * entrar por aquí: un `lazy()` suelto vuelve a romperse en la primera
 * publicación.
 */
export function paginaDiferida(importar) {
  return lazy(() => cargarModulo(importar));
}

// Vite avisa por su cuenta cuando no consigue precargar un trozo de código.
// Sin escucharlo, ese aviso termina en un error sin dueño en la consola. Se
// trata igual que el resto: si se puede recargar, se recarga y se le dice a
// Vite que ya está atendido; si el freno no deja, se le deja seguir para que
// el error llegue al límite de error con su mensaje.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (evento) => {
    if (recargarPorVersionNueva()) evento.preventDefault();
  });
}
