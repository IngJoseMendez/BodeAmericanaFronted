/**
 * Que la rueda del ratón deje de cambiar los números.
 *
 * EL PROBLEMA
 * Un <input type="number"> enfocado responde a la rueda del ratón sumando y
 * restando. Es comportamiento del navegador, no del proyecto, y no lo pide
 * nadie: pasa sola, mientras la usuaria cree que está bajando por la pantalla.
 * En una tabla de reparto —donde se teclea una cantidad, se rueda para ver la
 * siguiente y se vuelve— eso significa cambiar una cifra de mercancía sin verlo
 * y sin que nada avise. Es la clase de fallo que se descubre en la bodega.
 *
 * POR QUÉ AQUÍ Y NO EN CADA CAMPO
 * Hay más de treinta <input type="number"> repartidos por una docena de
 * pantallas, y cada campo nuevo que alguien escriba mañana volvería a traer el
 * problema. Un solo oyente en la raíz cubre los de hoy y los de mañana.
 *
 * POR QUÉ QUITAR EL FOCO Y NO CANCELAR EL EVENTO
 * `preventDefault()` sí frena el cambio de valor, pero frena también el
 * desplazamiento: la rueda dejaría de mover la página mientras el puntero pasa
 * por encima de un campo, que es peor que el problema original. Quitando el foco
 * el número se queda quieto y la página rueda como siempre. Lo que se pierde es
 * el cursor dentro del campo, y eso no cuesta nada: si estaba rodando, no
 * estaba escribiendo.
 *
 * Va en captura y en modo pasivo: no cancela nada, solo mira pasar el evento.
 */
export function quitarRuedaDeLosNumeros() {
  document.addEventListener('wheel', (evento) => {
    const activo = document.activeElement;
    if (!activo || activo.type !== 'number') return;
    // Sólo si la rueda va sobre el propio campo. Rodando por cualquier otro
    // sitio de la pantalla no hay razón para quitarle el foco a nadie.
    if (activo !== evento.target && !activo.contains(evento.target)) return;
    activo.blur();
  }, { passive: true, capture: true });
}
