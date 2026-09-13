// ── CAMPO DE DINERO ─────────────────────────────────────────────────────────
//
// Un <input> que va poniendo los puntos de miles MIENTRAS se escribe. Se teclea
// 1500000 y se ve 1.500.000 sin tocar nada.
//
// POR QUÉ EXISTE
// Había CUATRO copias de esta idea, cada una con su comportamiento: PriceInput
// en Contenedores, MoneyInput en Cotizaciones, PrecioInput en Precios y la de
// DeudaMasiva. Tres de ellas formateaban solo al SALIR del campo, así que
// mientras se escribía la cifra larga se veía como un chorro de dígitos —que es
// justo cuando hace falta el separador, porque es cuando uno cuenta ceros—. Y
// además el resto del sistema ni siquiera usaba una de esas cuatro: montaba un
// <input type="number"> pelado, donde 1500000 se queda en 1500000.
//
// SE VE FORMATEADO, SE ENTREGA CRUDO
// Esta es la decisión que hace que esto no obligue a reescribir medio sistema.
// El campo enseña "1.500.000", pero `onChange` entrega { target: { value:
// "1500000" } }: el número de siempre, con punto decimal y sin agrupar. Así los
// cien sitios que ya leían ese dato con parseFloat o parseInt siguen leyéndolo
// igual y no hay que tocarlos uno por uno.
//
// La tentación era guardar el texto formateado, que es menos código aquí. Pero
// parseFloat("1.500.000") es 1,5 y parseInt es 1, así que eso habría metido en
// silencio el mismo fallo que ya costó caro en este proyecto: un número que se
// lee como otro. Lo que se ve y lo que se guarda son dos cosas, y esa es la
// diferencia.
//
// EL PUNTO NO SE TECLEA, LO PONE EL CAMPO
// Los puntos que escriba la persona se ignoran: son los mismos que el campo ya
// está poniendo. La COMA sí se respeta, que es el decimal en Colombia —"285,50"
// son doscientos ochenta y cinco con cincuenta—, y pegar "1.500.000" copiado de
// otro lado funciona porque los puntos se caen y quedan los dígitos.
//
// EL CURSOR SE QUEDA DONDE ESTABA
// Es la mitad del trabajo y es lo que hace la diferencia entre un campo usable y
// uno que hay que pelear. Al reformatear, el texto cambia de largo: si uno
// corrige un dígito en medio de 1.500.000 y el cursor salta al final, el campo
// es inservible. Se cuentan los caracteres que importan (dígitos y la coma) a la
// izquierda del cursor, se reformatea y se vuelve a poner el cursor tras esos
// mismos caracteres.

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  parseMonto, formatearTecleado, textoDesdeValor, crudoDesdeTecleado,
  cuentaUtiles, posTrasUtiles, corregirBorradoDeSeparador,
} from '../../lib/money';

// Las cuentas de texto viven en lib/money.js y no aqui: son aritmetica pura y
// ahi se pueden probar sin navegador, que es donde estan casi todos los fallos
// de un campo que se reformatea solo.
const vacio = (v) => String(v ?? '').trim() === '';

export const CampoMonto = forwardRef(function CampoMonto(
  { value, onChange, decimales = 2, className = '', onBlur, onFocus, onKeyDown, ...rest },
  refFuera,
) {
  const refPropia = useRef(null);
  const ponerRef = useCallback((nodo) => {
    refPropia.current = nodo;
    if (typeof refFuera === 'function') refFuera(nodo);
    else if (refFuera) refFuera.current = nodo;
  }, [refFuera]);

  const [texto, setTexto] = useState(() => textoDesdeValor(value, decimales));
  // Qué tecla vino. Hace falta para el retroceso sobre un punto de miles: ver
  // más abajo.
  const ultimaTecla = useRef(null);
  // Dónde dejar el cursor en el próximo pintado. null = no tocarlo, que es lo
  // correcto cuando el cambio viene de fuera y no de una tecla.
  const cursorPendiente = useRef(null);

  // Sincronizar con lo de fuera SOLO cuando de verdad es otro número. Si el
  // padre devuelve lo mismo que acabamos de emitir, no se toca el texto: así
  // sobrevive una coma a medio escribir, que vale exactamente lo mismo.
  useEffect(() => {
    if (vacio(value) && vacio(texto)) return;
    if (!vacio(value) && !vacio(texto) && parseMonto(value) === parseMonto(texto)) return;
    setTexto(textoDesdeValor(value, decimales));
  }, [value, decimales]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const pos = cursorPendiente.current;
    if (pos == null) return;
    cursorPendiente.current = null;
    const el = refPropia.current;
    // Solo si el campo tiene el foco: mover el cursor de un campo que nadie está
    // usando lo roba de donde esté la persona.
    if (el && document.activeElement === el) {
      try { el.setSelectionRange(pos, pos); } catch { /* el navegador dirá */ }
    }
  }, [texto]);

  const emitir = (formateado) => {
    const crudo = crudoDesdeTecleado(formateado);
    onChange?.({ target: { value: crudo, valueAsNumber: crudo === '' ? 0 : parseMonto(crudo) } });
  };

  const alTeclear = (e) => {
    const tecleado = e.target.value;
    const cuentaCruda = cuentaUtiles(tecleado, e.target.selectionStart ?? tecleado.length);
    // El retroceso sobre un punto de miles no borraria nada visible; la
    // corrección vive en lib/money.js, con sus pruebas.
    const { cadena, cuenta } = corregirBorradoDeSeparador(
      tecleado, texto, cuentaCruda, ultimaTecla.current,
    );

    const formateado = formatearTecleado(cadena, decimales);
    cursorPendiente.current = posTrasUtiles(formateado, cuenta);
    setTexto(formateado);
    emitir(formateado);
  };

  const alSalir = (e) => {
    // Se limpia lo que quedó a medio: "1.500," pasa a "1.500" y "," a vacío.
    const limpio = vacio(texto) ? '' : textoDesdeValor(texto, decimales);
    if (limpio !== texto) {
      setTexto(limpio);
      emitir(limpio);
    }
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      ref={ponerRef}
      // text y no number: en number el navegador no deja escribir el punto de
      // miles, y además la rueda del ratón cambia la cifra sin querer.
      type="text"
      inputMode={decimales > 0 ? 'decimal' : 'numeric'}
      value={texto}
      onChange={alTeclear}
      onKeyDown={(e) => { ultimaTecla.current = e.key; onKeyDown?.(e); }}
      onFocus={onFocus}
      onBlur={alSalir}
      className={className}
    />
  );
});

export default CampoMonto;
