// ── UN ERROR TIENE QUE DECIR QUÉ PASÓ Y QUÉ HACER ──────────────────
//
// La capa HTTP (services/api.js) ya hace la mitad buena del trabajo: distingue
// una red caída de un servidor que dijo no, pone un mensaje en español por cada
// código y conserva el texto del servidor cuando lo hay. Lo que faltaba es la
// otra mitad: el SIGUIENTE PASO.
//
// Un aviso rojo que dice «No hay conexión con el servidor.» describe el mundo
// pero no dice qué hacer, y quien lo lee no es informática: está de pie en una
// bodega con la tableta en la mano y un cliente delante. La diferencia entre
// eso y «No hay conexión con el servidor. Revisa el wifi y vuelve a intentarlo;
// no se guardó nada» es la diferencia entre quedarse parada y seguir
// trabajando.
//
// Y hay un caso peor: los errores que NO vienen del servidor. Generar un Excel,
// armar un PDF o leer un archivo son código del navegador, y cuando revientan
// sueltan cosas como «Cannot read properties of undefined (reading 'map')».
// Eso en un aviso rojo no es un error: es un susto. Aquí ese texto se aparta a
// una segunda frase, marcada como lo que es —un dato para quien programó— y la
// primera frase dice algo que se pueda usar.
//
// NO se inventa una causa. Si no se reconoce el error, se dice exactamente eso
// y se conserva el detalle: es la misma regla de siempre en este proyecto, un
// hueco antes que un valor que finge ser lo que no es.

/** Lo que de verdad puede intentar quien está delante, según el tipo de fallo. */
const SIGUIENTE_PASO = {
  // La red. No llegó a salir, así que con seguridad no se guardó nada.
  conexion: 'Revisa la conexión y vuelve a intentarlo: no se guardó nada.',
  // Salió, pero el servidor no contestó a tiempo. Aquí NO se puede prometer
  // que no se guardó nada, porque puede haberse guardado y haberse perdido la
  // respuesta. Decir «no se guardó nada» sería mentir, y la llevaría a repetir
  // un abono.
  tiempo: 'Vuelve a cargar la pantalla antes de repetirlo, por si alcanzó a guardarse.',
  sesion: 'Vuelve a entrar y repite la operación.',
  permiso: 'Pídele a quien tenga permiso de administrador que lo haga.',
  datos: 'Revisa lo que escribiste y vuelve a intentarlo.',
  choque: 'Busca el registro que ya existe en vez de crear otro.',
  servidor: 'Vuelve a intentarlo en unos minutos. Si sigue igual, avísale a Jose.',
  navegador: 'Vuelve a intentarlo. Si sigue igual, avísale a Jose con el detalle de abajo.',
  desconocido: 'Vuelve a intentarlo. Si sigue igual, avísale a Jose con el detalle de abajo.',
};

/** Clasifica el fallo. Devuelve una clave de SIGUIENTE_PASO. */
export function clasificarError(err) {
  const texto = String(err?.message || '');
  const codigo = Number(err?.status) || 0;

  // El texto se mira ANTES que el código porque estos dos los fabrica
  // services/api.js sin código: nunca hubo respuesta.
  if (/No hay conexión con el servidor/i.test(texto)) return 'conexion';
  if (/no respondió a tiempo|tardó demasiado/i.test(texto)) return 'tiempo';

  if (codigo === 401 || /Sesión expirada|sesión ya no es válida/i.test(texto)) return 'sesion';
  if (codigo === 403) return 'permiso';
  if (codigo === 409) return 'choque';
  if (codigo === 400 || codigo === 422) return 'datos';
  if (codigo === 404) return 'datos';
  if (codigo === 429) return 'servidor';
  if (codigo >= 500) return 'servidor';

  // Sin código y sin texto conocido: revienta dentro del navegador. Las formas
  // típicas de un TypeError de JavaScript, que es lo que sale al generar un
  // Excel o un PDF con datos incompletos.
  if (!codigo && /^(Cannot |undefined |null |\w+ is not |Unexpected |Failed to )/i.test(texto)) {
    return 'navegador';
  }
  if (!codigo) return 'desconocido';
  return 'servidor';
}

/**
 * El mensaje que se le enseña a una persona.
 *
 * @param err     lo que cayó en el catch
 * @param accion  en infinitivo y sin «Error al»: 'registrar el abono',
 *                'generar el Excel', 'eliminar el gasto'. Si no se pasa, el
 *                mensaje habla del fallo sin nombrar la tarea.
 */
export function mensajeDeError(err, accion = '') {
  const clase = clasificarError(err);
  const paso = SIGUIENTE_PASO[clase];
  const crudo = String(err?.message || '').trim();

  // Un error del navegador no se enseña como causa: se aparta al final,
  // marcado, y la primera frase dice algo utilizable.
  if (clase === 'navegador' || clase === 'desconocido') {
    const cabeza = accion
      ? `No se pudo ${accion}.`
      : 'La operación no se pudo completar.';
    return crudo ? `${cabeza} ${paso} (${crudo})` : `${cabeza} ${paso}`;
  }

  // En los demás casos la causa YA está en español y ya es específica —la puso
  // services/api.js o la escribió el servidor—, así que se enseña tal cual.
  const causa = crudo || 'El servidor rechazó la operación.';
  const cabeza = accion ? `No se pudo ${accion}: ` : '';
  // Si la causa ya termina con su propia instrucción, no se le pega otra
  // encima: dos órdenes seguidas se leen peor que una.
  const yaDiceQueHacer = /vuelve a|revisa|inténtalo|intentalo|espera |pídele|pidele/i.test(causa);
  const cola = yaDiceQueHacer ? '' : ' ' + paso;

  const cuerpo = cabeza
    ? cabeza + causa.charAt(0).toLowerCase() + causa.slice(1)
    : causa;
  return (cuerpo + cola).trim();
}
