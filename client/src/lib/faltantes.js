// ── La aritmética del libro de faltantes (gemelo ESM del backend) ───────────
//
// Un faltante es lo que se le quedó debiendo EN MERCANCÍA a un cliente después
// de repartir: pidió 5 chaquetas premium, había 0, le faltaron 5. No es plata
// (eso es Cartera) y no es un pedido por confirmar (esa palabra ya significa
// tres cosas distintas en esta app y por eso está prohibida en todo el módulo).
// Es una sola fila abierta por cliente + referencia + calidad que crece, se
// abona y se cierra.
//
// ESTE ARCHIVO ES UNA COPIA DELIBERADA de `BE/src/utils/faltantes.js`. No es un
// descuido ni un refactor a medio hacer: los dos repos son proyectos separados,
// sin paquete compartido ni workspace, y no hay forma de importar de uno al
// otro sin publicar una dependencia nueva —cosa prohibida en este encargo—. Se
// copia porque la alternativa real no era compartirla, era ESCRIBIRLA DOS
// VECES, cada una con su propio criterio de topes y de redondeo; y entonces la
// pantalla le dice a la dueña «le quedan faltando 7» mientras el servidor
// guarda 5, ella confía en la pantalla —siempre confía en la pantalla, es lo
// que tiene delante— y llama al cliente con una cifra que la base no tiene.
//
// POR ESO LAS CINCO LÍNEAS DE `aplicarMovimiento` ESTÁN COPIADAS LETRA POR
// LETRA del backend y no se tocan aquí. Si alguna vez hay que cambiarlas, se
// cambian en los dos archivos en el mismo commit y se comparan de un vistazo:
// una función tan corta se puede leer en paralelo. El día que las dos versiones
// diverjan nadie se va a enterar, porque no falla nada — simplemente las cifras
// dejan de cuadrar y se descubre meses después, con un cliente al teléfono.
//
// LA INVARIANTE que sostiene el módulo entero:
//
//   cantidad_original = cantidad_saldada + cantidad_anulada + cantidad_abierta
//
// Los dos Math.min son los que la garantizan, y están escritos con el saldado
// primero y el anulado después a propósito: si llegan un abono y una anulación
// que juntos se pasan de lo original, gana lo ENTREGADO. Anular de más solo
// borra un faltante que quizá seguía vivo; saldar de más afirma que salió
// mercancía que nunca salió de la bodega, y eso el cliente sí lo reclama. El
// Math.max final es la red contra datos ya torcidos: antes devolver 0 abierto
// que un negativo que se pinte como «le faltaron −3» en la cara del cliente.
//
// LOS ESTADOS son 'abierto' | 'completado' | 'anulado'. Nunca 'pendiente'.
// El orden del ternario también dice algo: mientras quede algo abierto el
// faltante sigue abierto aunque ya se le haya entregado media docena de veces;
// si no queda nada abierto pero SÍ se entregó algo es 'completado' —se cumplió,
// aunque parte se cerrara a mano—; y solo cuando no se entregó absolutamente
// nada queda como 'anulado'. Un faltante entregado a medias y cerrado el resto
// NO merece leerse como anulado: la mercancía salió.
//
// Ninguna transición ocurre por reloj. Un faltante no caduca nunca; envejece a
// la vista, y esa antigüedad es justo el dato que decide a quién se le da
// primero en el reparto siguiente.
//
// LA DIFERENCIA CON EL GEMELO, Y POR QUÉ EXISTE. El backend llama a esta
// función UNA vez por línea, dentro de una transacción, con filas que acaba de
// leer de la base: allí la entrada siempre está bien formada. Aquí la llama la
// pantalla, que la usa para adelantarle a la dueña lo que va a quedar anotado
// mientras teclea — o sea decenas de veces por segundo, con cantidades que a
// medio escribir son '', '-', 'e' o undefined porque la fila todavía no cargó.
// Una excepción ahí no se ve como un error: se ve como que la Matriz entera se
// queda en blanco con el trabajo de media mañana dentro. Por eso ANTES de las
// cinco líneas hay una normalización de la entrada, y por eso está fuera de
// ellas y no dentro: la aritmética que decide cifras es idéntica en los dos
// repos, y lo único que se añade aquí es negarse a explotar. Si be-esquema
// quiere la misma red en el backend (y le convendría, porque un cuerpo de
// petición trae lo que le da la gana), es copiar `entero` y las tres líneas de
// normalización, no tocar la fórmula.

/**
 * Convierte a entero no negativo cualquier cosa que llegue: strings del
 * servidor ("5"), null, undefined, NaN, negativos o basura a medio teclear.
 *
 * A propósito NO usa `parseMonto` de money.js, que es lo que usa el resto del
 * frontend: money.js interpreta el punto como separador de miles porque lee lo
 * que escribe la usuaria en pesos, y aquí no se leen pesos, se leen unidades
 * que además vienen del servidor en formato máquina. Usar Number a secas es lo
 * que mantiene este archivo copiable al backend tal cual, sin arrastrarle una
 * dependencia del frontend que allá no existe.
 */
const entero = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Aplica un movimiento sobre un faltante y devuelve sus cifras y su estado ya
 * cuadrados. NO escribe nada: en el backend la ruta hace el UPDATE con lo que
 * devuelve, dentro de la misma transacción en la que leyó la fila con FOR
 * UPDATE; aquí la pantalla solo lo pinta para que la dueña vea a dónde va a
 * parar cada número antes de confirmar.
 *
 * @param {object} f        fila actual del faltante (o `{}`/null si es nuevo)
 * @param {object} mov
 * @param {number} mov.suma   unidades que se le AÑADEN a lo que ya faltaba
 * @param {number} mov.salda  unidades que se le entregaron ahora
 * @param {number} mov.anula  unidades que se cierran a mano sin entregarlas
 * @returns {{cantidad_original:number, cantidad_saldada:number,
 *            cantidad_anulada:number, cantidad_abierta:number, estado:string}}
 */
export function aplicarMovimiento(f, mov) {
  // Normalización de la entrada — NO es aritmética del libro, es la red contra
  // el `null` de una fila que todavía no cargó y contra el "5" que devuelve pg
  // para las columnas DECIMAL. Ojo con lo segundo: sin esta línea,
  // ("5" || 0) + 3 da "53" y el faltante de un cliente se multiplica por diez
  // sin que falle absolutamente nada.
  const libro = f && typeof f === 'object' ? f : {};
  const movimiento = mov && typeof mov === 'object' ? mov : {};
  f = {
    cantidad_original: entero(libro.cantidad_original),
    cantidad_saldada: entero(libro.cantidad_saldada),
    cantidad_anulada: entero(libro.cantidad_anulada),
  };
  // Los movimientos se topan en 0 porque el libro es de una sola dirección: se
  // suma lo que faltó, se abona lo que se entregó y se anula lo que se perdona.
  // Un movimiento negativo no significa nada aquí y lo único que puede hacer es
  // romper la invariante por debajo, así que se lee como «no hubo movimiento».
  const suma = entero(movimiento.suma);
  const salda = entero(movimiento.salda);
  const anula = entero(movimiento.anula);

  // ── A PARTIR DE AQUÍ, COPIA LITERAL DE BE/src/utils/faltantes.js ──────────
  // No reescribir, no "mejorar", no reordenar. Si cambia, cambia en los dos.
  const original = (f.cantidad_original || 0) + suma;
  const saldada  = Math.min(original - (f.cantidad_anulada || 0), (f.cantidad_saldada || 0) + salda);
  const anulada  = Math.min(original - saldada,                   (f.cantidad_anulada || 0) + anula);
  const abierta  = Math.max(0, original - saldada - anulada);
  const estado   = abierta > 0 ? 'abierto' : (saldada > 0 ? 'completado' : 'anulado');
  return { cantidad_original: original, cantidad_saldada: saldada,
           cantidad_anulada: anulada,  cantidad_abierta: abierta, estado };
  // ── FIN DE LA COPIA LITERAL ──────────────────────────────────────────────
}

/**
 * Lo que una línea del reparto le hace al libro: cuánto de lo que se entrega
 * hoy es abono de lo que ya se le debía, y cuánto se le queda debiendo nuevo.
 *
 * Vive aquí y no en la pantalla porque el backend calcula EXACTAMENTE estas dos
 * líneas dentro de la transacción (están escritas así en el contrato), y la
 * Fase 2 tiene que enseñar en el diálogo de confirmación los mismos números que
 * van a quedar guardados. Si la pantalla dijera «quedan anotadas 19 pacas
 * faltando» y el servidor anotara 21, la primera vez que ella lo cotejara con
 * /faltantes dejaría de creerle a las dos cifras.
 *
 * El abono se topa con lo CARGADO porque lo demás del pedido es mercancía
 * nueva: si un cliente traía 3 faltando, se le cargan esas 3, pide 8 y recibe
 * 5, solo 3 de esas 5 abonan el faltante viejo; las otras 2 son venta del día.
 * Y el faltante nuevo descuenta lo cargado en LOS DOS LADOS de la resta: si no,
 * lo que ya estaba en el libro se contaría otra vez y el faltante se duplicaría
 * cada ronda sin que nadie pidiera nada de más.
 *
 * @param {object} l  { cantidad_pedida, cantidad_cargada_faltante,
 *                      cantidad_repartida, cuenta_faltante }
 * @returns {{abono:number, faltante_nuevo:number}}
 */
export function movimientoDeLinea(l) {
  const linea = l && typeof l === 'object' ? l : {};
  const pedida = entero(linea.cantidad_pedida);
  // Lo cargado nunca puede superar a lo pedido: si ella bajó a mano la cantidad
  // de una línea que venía de un faltante, lo que manda es lo que dejó escrito.
  const cargada_faltante = Math.min(entero(linea.cantidad_cargada_faltante), pedida);
  const repartida = Math.min(entero(linea.cantidad_repartida), pedida);
  // `cuenta_faltante` es la casilla escondida por línea del CAMBIO 4: resuelve
  // el caso del cliente que pide 50 sabiendo que hay 10, «a ver si suena la
  // flauta». Sin ella el libro se llena de faltantes falsos y el chip ámbar deja
  // significar nada, que es como muere un aviso.
  const cuenta_faltante = linea.cuenta_faltante !== false;

  const abono = Math.min(repartida, cargada_faltante);
  const faltante_nuevo = cuenta_faltante
    ? Math.max(0, (pedida - cargada_faltante) - (repartida - abono))
    : 0;
  return { abono, faltante_nuevo };
}
