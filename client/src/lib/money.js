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
