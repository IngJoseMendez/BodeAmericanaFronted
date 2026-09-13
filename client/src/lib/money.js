// Parseo y formato de dinero en formato colombiano (es-CO).
//
// En es-CO el PUNTO es separador de miles y la COMA es el decimal: "1.500.000" son
// un millón y medio de pesos, no 1,5. Usar parseFloat directamente sobre ese texto
// devuelve 1.5 y destruye el dato en silencio, que es justo lo que hacían por
// separado DeudaMasiva, Cotizaciones, Cartera, Historico e Input.
//
// La implementación de referencia vivía duplicada en pages/Gastos.jsx (numLimpio);
// aquí queda una sola copia para que todas las pantallas parseen igual.

/**
 * Convierte texto escrito por el usuario a número respetando el formato es-CO.
 *   "4.000"      -> 4000
 *   "1.500.000"  -> 1500000
 *   "1.234,50"   -> 1234.5
 *   "1,234.50"   -> 1234.5   (formato en-US, también se acepta)
 *   "12,5"       -> 12.5
 *   ""  / null   -> 0
 */
export function parseMonto(v) {
  let s = String(v ?? '').trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    // Aparecen los dos separadores: el que va más a la derecha es el decimal real.
    s = lastComma > lastDot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = s.replace(',', '.');                 // coma decimal
  } else if (lastDot > -1) {
    // Solo puntos: si son separador de miles (1.234 / 4.000 / 1.234.567) se quitan.
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// Monedas frecuentes para una bodega que importa (China/USA/Europa).
export const MONEDAS = [
  { value: 'COP', label: 'COP — Peso colombiano' },
  { value: 'USD', label: 'USD — Dólar (EE.UU.)' },
  { value: 'CNY', label: 'CNY — Yuan (China)' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'MXN', label: 'MXN — Peso mexicano' },
  { value: 'PEN', label: 'PEN — Sol (Perú)' },
  { value: 'OTRA', label: 'Otra…' },
];

/** Formatea un importe en la moneda indicada, con el separador colombiano. */
export function formatMoneda(n, moneda = 'COP', { decimales } = {}) {
  const num = typeof n === 'number' ? n : parseMonto(n);
  const cod = String(moneda || 'COP').toUpperCase();
  const dec = decimales ?? (cod === 'COP' ? 0 : 2);
  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: cod,
      minimumFractionDigits: dec, maximumFractionDigits: dec,
    }).format(num);
  } catch {
    // Código de moneda no estándar (el usuario escribió uno propio en "Otra…").
    return `${num.toLocaleString('es-CO', { maximumFractionDigits: dec })} ${cod}`;
  }
}

/** Igual que parseMonto pero conserva null/'' como null, para campos opcionales. */
export function parseMontoOpcional(v) {
  const s = String(v ?? '').trim();
  return s === '' ? null : parseMonto(s);
}

/** "$1.500.000" — formato de pesos colombianos sin decimales. */
export function formatCOP(n, { decimales = 0 } = {}) {
  const num = typeof n === 'number' ? n : parseMonto(n);
  return '$' + num.toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * "1.500.000" — solo el número, sin símbolo, para inputs formateados.
 * `maxDecimales` permite conservar decimales que existan (pesos: 0; kilos: 2)
 * sin forzar ceros de relleno cuando el valor es entero.
 */
export function formatNumero(n, { decimales = 0, maxDecimales } = {}) {
  const num = typeof n === 'number' ? n : parseMonto(n);
  return num.toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: maxDecimales ?? decimales,
  });
}


// ── Lo que necesita el campo que formatea mientras se escribe ────────────────
//
// Vive aquí y no dentro del componente para poder probarlo sin navegador: es
// aritmética de texto y el 90% de los fallos de un campo así están justo ahí.

const vacio = (v) => String(v ?? '').trim() === '';

/** Mete los puntos de miles en una ristra de digitos: "1500000" -> "1.500.000" */
export const agruparMiles = (digitos) => String(digitos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Lo que se teclea, ya con los puntos puestos.
 *
 * Se queda a medio escribir a proposito: "1.500," es un estado valido mientras
 * se llega a los centavos, y borrar esa coma haria imposible teclear decimales.
 *
 * Los PUNTOS que escriba la persona se ignoran —o los puso el campo, o los esta
 * poniendo a mano y son los mismos—, asi que pegar "1.500.000" copiado de otro
 * lado tambien funciona. La COMA se respeta, que es el decimal en Colombia.
 */
export function formatearTecleado(texto, decimales = 2) {
  let s = String(texto ?? '');
  const negativo = s.trimStart().startsWith('-');

  s = s.replace(/[^0-9,]/g, '');
  // Sin decimales la coma CORTA, no se borra: quitarla pegaria los centavos
  // al entero y "1500,5" acabaria valiendo 15.005, diez veces mas.
  if (decimales <= 0) s = s.split(',')[0];

  const corte = s.indexOf(',');
  let entero  = corte === -1 ? s : s.slice(0, corte);
  let decimal = corte === -1 ? null : s.slice(corte + 1).replace(/,/g, '');

  if (decimal !== null && decimal.length > decimales) decimal = decimal.slice(0, decimales);
  entero = entero.replace(/^0+(?=\d)/, '');   // "007" -> "7", pero un "0" solo se queda

  let salida = agruparMiles(entero);
  if (decimal !== null) salida = (salida === '' ? '0' : salida) + ',' + decimal;
  if (negativo && salida !== '') salida = '-' + salida;
  return salida;
}

/** Lo que llega de fuera (un numero, o texto del servidor) puesto en formato. */
export function textoDesdeValor(valor, decimales = 2) {
  if (vacio(valor)) return '';
  const n = parseMonto(valor);
  if (!Number.isFinite(n)) return '';
  return formatNumero(n, { maxDecimales: decimales });
}

/**
 * De lo que se VE a lo que se GUARDA: "1.500,25" -> "1500.25".
 *
 * Es la pieza que hace que este campo no obligue a tocar el resto del sistema.
 * El campo ensena los puntos de miles, pero hacia fuera entrega el numero de
 * siempre —digitos y punto decimal—, asi que los cien sitios que ya leian ese
 * dato con parseFloat o parseInt siguen leyendolo igual. Guardar el texto
 * formateado habria sido mas facil de escribir y habria roto todos.
 *
 * Conserva el punto final de "1500." mientras se teclean los centavos:
 * parseFloat lo lee como 1500 y no estorba.
 */
export function crudoDesdeTecleado(formateado) {
  const s = String(formateado ?? '');
  if (s === '') return '';
  const negativo = s.startsWith('-');
  const cuerpo = s.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  if (cuerpo === '' || cuerpo === '.') return '';
  return (negativo ? '-' : '') + cuerpo;
}

/** Cuantos caracteres que cuentan (digitos y coma) hay a la izquierda de `pos`. */
export function cuentaUtiles(texto, pos) {
  const s = String(texto ?? '');
  let n = 0;
  for (let i = 0; i < pos && i < s.length; i++) {
    if ((s[i] >= '0' && s[i] <= '9') || s[i] === ',') n++;
  }
  return n;
}

/** Donde cae el cursor para dejar `n` caracteres que cuentan a su izquierda. */
export function posTrasUtiles(texto, n) {
  const s = String(texto ?? '');
  if (n <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < s.length; i++) {
    if ((s[i] >= '0' && s[i] <= '9') || s[i] === ',') {
      vistos++;
      if (vistos === n) return i + 1;
    }
  }
  return s.length;
}
