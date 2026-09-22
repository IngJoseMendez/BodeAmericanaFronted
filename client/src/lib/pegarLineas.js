// ── PEGAR LAS LÍNEAS DE UN CONTENEDOR DESDE UNA HOJA DE CÁLCULO ───
//
// La factura del proveedor YA existe en Excel: es de donde se copia línea a
// línea. Pegarla entera es lo único que hace que capturar aquí sea más rápido
// que capturar allí, en vez de sólo igual de rápido.
//
// TODO LO DELICADO DE ESA IDEA VIVE EN ESTE ARCHIVO, y por eso está aparte de
// la pantalla: lo que se copia son NOMBRES sueltos, y en este sistema todo se
// cruza por nombre. Una referencia que no casa con el catálogo nace sin
// familia, se queda sin precio en cotizaciones, y eso no se descubre hasta tres
// semanas después al abrir el Excel de matriz. Aquí se decide qué casa y qué
// no; la pantalla sólo lo enseña antes de aplicarlo.
//
// NINGUNA DE ESTAS FUNCIONES INVENTA UN DATO. Lo que no casa se devuelve tal
// como venía y marcado, nunca sustituido por lo más parecido ni por un valor
// por defecto: pegar 61 líneas con una referencia cambiada a espaldas de quien
// pega es peor que no poder pegar.

/** Sin tildes, sin mayúsculas y sin espacios de sobra. */
export const normPegado = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase().replace(/\s+/g, ' ');

// Los campos de una línea y por qué nombres los llama una hoja de cálculo. Los
// alias son los que de verdad aparecen en las facturas de esta operación
// ("PROVEEDOR" en la columna de referencia incluido, que es como viene la hoja
// de PROVEEDORES MERCANCIA).
export const CAMPOS_PEGADO = [
  { campo: 'categoria',      rotulo: 'Categoría',      alias: ['categoria', 'temporada'] },
  { campo: 'clasificacion',  rotulo: 'Clasificación',  alias: ['clasificacion', 'tipo'] },
  { campo: 'referencia',     rotulo: 'Referencia',     alias: ['referencia', 'producto', 'descripcion'] },
  { campo: 'calidad',        rotulo: 'Calidad',        alias: ['calidad'] },
  { campo: 'cantidad',       rotulo: 'Cantidad',       alias: ['cantidad', 'cant', 'unidades', 'pacas'] },
  { campo: 'costo_unitario', rotulo: 'Costo unitario', alias: ['costo unitario', 'precio unitario', 'costo', 'precio', 'valor'] },
];

// El orden en el que se asignan las columnas cuando la hoja NO trae rótulos: el
// mismo que tienen las columnas de la tabla, para que copiar de la pantalla y
// pegar en la pantalla dé la vuelta completa sin tocar nada.
const ORDEN_POR_POSICION = ['categoria', 'clasificacion', 'referencia', 'calidad', 'cantidad', 'costo_unitario'];

const campoDelRotulo = (celda) => {
  const t = normPegado(celda);
  if (!t) return '';
  // Primero igualdad exacta: "costo" y "costo unitario" comparten trozo, y por
  // inclusión ganaría el alias más corto que se mirara antes.
  const exacto = CAMPOS_PEGADO.find((c) => c.alias.includes(t));
  if (exacto) return exacto.campo;
  return CAMPOS_PEGADO.find((c) => c.alias.some((a) => t.includes(a)))?.campo || '';
};

/**
 * Lee lo que hay en el portapapeles.
 *
 * Devuelve `null` cuando NO es un bloque —una sola celda, o texto sin
 * tabuladores—, porque eso es alguien pegando una palabra en un campo y tiene
 * que seguir funcionando como siempre.
 *
 * @param {string} texto lo que entrega `clipboardData.getData('text/plain')`
 * @returns {{columnas: string[], cuerpo: string[][], cabeceraDetectada: boolean}|null}
 */
export function leerBloquePegado(texto) {
  const crudo = String(texto ?? '');
  if (!crudo.includes('\t') && !crudo.includes('\n')) return null;

  const filas = crudo.replace(/\r\n?/g, '\n').split('\n')
    .map((l) => l.split('\t'))
    .filter((celdas) => celdas.some((v) => String(v).trim() !== ''));
  if (!filas.length) return null;

  // ¿La primera fila son rótulos? Hacen falta DOS aciertos: con uno solo, una
  // fila de datos cuyo primer valor fuera "verano" se tragaría como cabecera y
  // se perdería una línea entera sin que nadie lo notara.
  const rotulos = filas[0].map(campoDelRotulo);
  const cabeceraDetectada = rotulos.filter(Boolean).length >= 2;
  const cuerpo = cabeceraDetectada ? filas.slice(1) : filas;
  if (!cuerpo.length) return null;

  const ancho = Math.max(...cuerpo.map((f) => f.length));
  const columnas = Array.from({ length: ancho }, (_, i) => (
    cabeceraDetectada ? (rotulos[i] || '') : (ORDEN_POR_POSICION[i] || '')
  ));

  return { columnas, cuerpo, cabeceraDetectada };
}

/**
 * Un número como lo escribe una hoja de cálculo.
 *
 * EL PUNTO ES AMBIGUO Y AQUÍ VALE DINERO. En español "1.500" son mil
 * quinientos; en la notación inglesa son uno y medio. Leerlo mal por mil en un
 * costo unitario se propaga al costo del contenedor, al precio mínimo y al
 * precio de venta de cada paca, y nadie lo ve hasta que el margen sale absurdo.
 *
 * Las reglas, en orden:
 *   · Si hay coma, la coma es el decimal y el punto separa miles: 1.234,56.
 *   · Sin coma y con varios puntos, todos separan miles: 1.234.567.
 *   · Sin coma y con UN punto, es separador de miles sólo si tiene entre una y
 *     tres cifras delante y exactamente tres detrás ("1.500"): nadie escribe
 *     "1234.567" como mil doscientos treinta y cuatro mil quinientos sesenta y
 *     siete, lo escribiría "1.234.567".
 *   · En cualquier otro caso el punto es decimal: 1234.56, 1.5, 0.75.
 *
 * Y lo que quede se ENSEÑA en la previsualización antes de aplicarse, que es
 * la red de seguridad de esta ambigüedad.
 *
 * Devuelve '' cuando no hay número: vacío antes que un 0, que se leería como
 * "esta línea no cuesta nada" y así quedaría guardado.
 */
export function numeroPegado(bruto) {
  const limpio = String(bruto ?? '').replace(/[^\d,.-]/g, '');
  if (!limpio) return '';

  let texto;
  if (limpio.includes(',')) {
    texto = limpio.replace(/\./g, '').replace(',', '.');
  } else {
    const puntos = (limpio.match(/\./g) || []).length;
    const milesSueltos = /^-?\d{1,3}\.\d{3}$/.test(limpio);
    texto = (puntos > 1 || milesSueltos) ? limpio.replace(/\./g, '') : limpio;
  }
  return texto === '' || Number.isNaN(Number(texto)) ? '' : texto;
}

/**
 * Cruza el bloque leído contra el catálogo y devuelve las líneas tal como
 * quedarían, con la lista de campos que NO casaron.
 *
 * @param {{columnas: string[], cuerpo: string[][]}} bloque
 * @param {{categoria: string[], clasificacion: string[], referencia: string[], calidad: string[]}} catalogos
 * @param {(referencia: string) => string} categoriaDeReferencia
 */
export function cruzarConCatalogo(bloque, catalogos, categoriaDeReferencia = () => '') {
  const indices = [...bloque.columnas.entries()].filter(([, campo]) => campo);

  const casar = (campo, valor) => {
    const bruto = String(valor ?? '').trim();
    if (!bruto) return { valor: '', casado: true };
    const t = normPegado(bruto);
    const hallado = (catalogos[campo] || []).find((o) => normPegado(o) === t);
    // Lo que no casa se conserva TAL CUAL. Sustituirlo por lo más parecido es
    // exactamente el error que esta previsualización existe para evitar.
    return { valor: hallado || bruto, casado: Boolean(hallado) };
  };

  const lineas = bloque.cuerpo.map((celdas) => {
    const linea = { categoria: '', clasificacion: '', referencia: '', calidad: '', cantidad: '', costo_unitario: '' };
    const avisos = [];
    for (const [i, campo] of indices) {
      if (campo === 'cantidad' || campo === 'costo_unitario') {
        linea[campo] = numeroPegado(celdas[i]);
      } else {
        const { valor, casado } = casar(campo, celdas[i]);
        linea[campo] = valor;
        if (!casado) avisos.push(campo);
      }
    }
    // LA CATEGORÍA LA MANDA EL CATÁLOGO, SIEMPRE que sepa cuál es.
    //
    // Cada referencia ya sabe a qué categoría pertenece, y de que referencia y
    // categoría concuerden dependen el precio y la familia río abajo. Si la
    // hoja trae "invierno" para una referencia que el catálogo tiene como
    // "verano", la hoja está equivocada: dejarlo pasar guardaría una línea
    // incoherente que no fallaría hoy y saldría mal en la matriz.
    //
    // Es exactamente lo que hace el formulario al elegir la referencia a mano
    // (ver `updateDetalle`), y no es silencioso: la previsualización enseña la
    // categoría ya corregida antes de aplicar nada.
    //
    // Si el catálogo NO sabe la categoría de esa referencia, se respeta la que
    // venía pegada: quitarla sería perder un dato a cambio de nada.
    if (linea.referencia) {
      const delCatalogo = categoriaDeReferencia(linea.referencia);
      if (delCatalogo) {
        linea.categoria = delCatalogo;
        const i = avisos.indexOf('categoria');
        if (i >= 0) avisos.splice(i, 1);
      }
    }
    return { linea, avisos };
  });

  return { lineas, sinCasar: lineas.filter((l) => l.avisos.length).length };
}
