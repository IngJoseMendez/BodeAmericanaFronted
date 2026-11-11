// ── LO QUE SE LEE AL RENDERIZAR TIENE QUE ESTAR DECLARADO ANTES ───
//
// Esta comprobación existe por un error concreto que llegó a producción: en
// Ventas.jsx, `totalVenta` se calculaba durante el render leyendo
// `gruposElegidos`, que al partir unos parches quedó declarado 150 líneas más
// abajo. Un `const` está en zona muerta hasta su declaración, así que la
// pantalla reventaba con «Cannot access 'te' before initialization» antes de
// pintar una sola fila.
//
// POR QUÉ NO LO CUBRE EL LINTER
//
// `no-use-before-define` lo ve, pero también ve otras noventa referencias que
// NO rompen nada: en este código los efectos van arriba y las funciones de
// carga abajo, así que `useEffect(() => loadVentas())` referencia un `const`
// declarado después y es perfectamente seguro -el callback corre cuando ya
// existe-. Con noventa avisos, el que importa no se ve. Por eso allí está en
// aviso y aquí se mira sólo el subconjunto mortal:
//
//   un `const` del primer nivel del componente cuyo INICIALIZADOR -lo que se
//   evalúa en el momento de declararlo- lee otro `const` de más abajo.
//
// Se mira SÓLO dentro del componente exportado por defecto, que es donde vive
// el render. Los componentes auxiliares del mismo archivo tienen sus propios
// nombres y parámetros, y mezclarlos daba falsos positivos.
import fs from 'node:fs';
import path from 'node:path';

const PALABRAS = new Set([
  'useMemo', 'useCallback', 'useEffect', 'useState', 'useRef', 'useId', 'useContext',
  'true', 'false', 'null', 'undefined', 'new', 'typeof', 'return', 'await', 'async',
  'const', 'let', 'var', 'if', 'else', 'for', 'of', 'in', 'function', 'class',
  'Math', 'Number', 'String', 'Array', 'Object', 'Set', 'Map', 'JSON', 'Date',
  'Boolean', 'Promise', 'parseInt', 'parseFloat', 'isNaN', 'document', 'window',
  'console', 'localStorage', 'sessionStorage',
]);

/** El cuerpo del componente exportado por defecto, con su desplazamiento. */
function cuerpoDelComponente(texto) {
  const m = /export default function\s+\w*\s*\([^)]*\)\s*\{/.exec(texto);
  if (!m) return null;
  const desde = m.index + m[0].length;
  // Cierra en la primera `}` a columna cero: es como está escrito todo este
  // código y no hace falta un analizador para eso.
  const hasta = texto.indexOf('\n}', desde);
  return { texto: texto.slice(desde, hasta < 0 ? texto.length : hasta), desde };
}

/**
 * Los archivos a mirar. Sin argumentos, los busca solo: un glob en un script de
 * npm no lo expande el shell de Windows, y una lista escrita a mano se queda
 * vieja en cuanto alguien añade una pantalla.
 */
function archivos() {
  const dados = process.argv.slice(2);
  if (dados.length) return dados;
  const raiz = path.join(import.meta.dirname, '..', 'src');
  const salida = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(completo);
      else if (e.name.endsWith('.jsx')) salida.push(completo);
    }
  };
  recorrer(raiz);
  return salida;
}

const fallos = [];
const mirados = archivos();

for (const ruta of mirados) {
  const completo = fs.readFileSync(ruta, 'utf8');
  const comp = cuerpoDelComponente(completo);
  if (!comp) continue;

  const lineaDe = (i) => completo.slice(0, comp.desde + i).split('\n').length;
  const lineas = comp.texto.split('\n');

  // Dónde se declara cada nombre del primer nivel del componente.
  const declarado = new Map();
  lineas.forEach((l, n) => {
    const m = /^ {2}const (?:\{ ([^}]+) \}|\[([^\]]+)\]|(\w+))\s*=/.exec(l);
    if (!m) return;
    for (const bruto of (m[1] || m[2] || m[3] || '').split(',')) {
      const nom = bruto.trim().split(':').pop().trim();
      if (nom && !declarado.has(nom)) declarado.set(nom, n);
    }
  });

  lineas.forEach((l, n) => {
    const m = /^ {2}const (\w+)\s*=\s*(.*)$/.exec(l);
    if (!m) return;
    const [, nombre, resto] = m;
    // Una función no se ejecuta al declararla: su cuerpo puede mirar lo que sea.
    if (/^(\(|async\b|function\b|\w+\s*=>)/.test(resto)) return;

    // El inicializador, hasta donde acaba la declaración.
    let texto = resto;
    for (let i = n + 1; i < lineas.length; i++) {
      if (/^ {2}\S/.test(lineas[i])) break;
      texto += '\n' + lineas[i];
      if (/;\s*$/.test(lineas[i]) || /^ {0,4}\);?\s*$/.test(lineas[i])) break;
    }

    // De un useMemo/useCallback sólo se evalúa YA el arreglo de dependencias;
    // el callback corre después. De lo demás, todo.
    const esHook = /^use(Memo|Callback)\s*\(/.test(texto.trim());
    let aMirar = texto;
    if (esHook) {
      const deps = /\[([^\]]*)\]\s*\)?;?\s*$/.exec(texto);
      aMirar = deps ? deps[1] : '';
    }

    for (const id of new Set(aMirar.match(/\b[A-Za-z_$][\w$]*\b/g) || [])) {
      if (PALABRAS.has(id) || id === nombre) continue;
      const donde = declarado.get(id);
      if (donde !== undefined && donde > n) {
        fallos.push(`${path.basename(ruta)}:${lineaDe(texto.length && 0)} `
          + `«${nombre}» (línea ${lineaDe(0) + n}) lee «${id}», declarado en la ${lineaDe(0) + donde}`
          + (esHook ? ' (en las dependencias)' : ''));
      }
    }
  });
}

// ── Y LO QUE SE LEE EN EL RENDER NO PUEDE DAR POR HECHO QUE HAY DATOS ──
//
// Segunda pasada, misma familia y mismo aislamiento del componente. Existe por
// otro error que llegó a producción, y éste con el agravante de PARECER
// defendido. En Entregables.jsx hay veinte lecturas de `datos.algo` y todas
// eran seguras porque viven en generadores y manejadores de clic: sólo corren
// cuando la carga terminó. Al añadir el desplegable de contenedores se escribió
// una más, pero en el CUERPO DEL RENDER:
//
//     const contenedoresCerrados = (datos.contenedores || [])
//
// `datos` arranca en null, así que el `|| []` NUNCA llega a evaluarse: revienta
// antes con «Cannot read properties of null (reading 'contenedores')» y el
// ErrorBoundary se come la pantalla entera. Ese `|| []` de detrás es justo lo
// que lo volvió invisible al revisarlo.
//
// No lo ve el linter —no sabe que `useState(null)` empieza en null— ni la
// pasada de arriba, que mira el ORDEN: aquí el orden está bien, lo que falla es
// el VALOR en el primer render.
//
// LO QUE SE DEJA PASAR, A PROPÓSITO, porque la primera versión de esto sacó
// siete avisos y seis eran mentira:
//   · Lo que esté fuera del componente exportado por defecto. Un ayudante de
//     módulo con un PARÁMETRO que se llama igual que un estado no tiene nada
//     que ver — es la trampa que ya avisa la cabecera de este archivo.
//   · Una lectura con cortocircuito delante: `x && x.id`, `!!x && … x.id`,
//     `x ? x.id : …`. Eso ya está defendido.
//   · La sentencia `return` del JSX, que se alcanza después de los retornos
//     tempranos.
//   · `x?.campo`, que es la forma correcta.
const nulos = [];
for (const ruta of mirados) {
  const texto = fs.readFileSync(ruta, 'utf8');
  const cuerpo = cuerpoDelComponente(texto);
  if (!cuerpo) continue;
  const estados = new Set();
  for (const m of cuerpo.texto.matchAll(
    /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*set[\w$]*\s*\]\s*=\s*useState\(\s*(?:null|undefined)?\s*\)/g)) {
    estados.add(m[1]);
  }
  if (!estados.size) continue;

  const base = texto.slice(0, cuerpo.desde).split('\n').length;
  const lineas = cuerpo.texto.split('\n');
  const ARRANQUE = /^ {2}(?!\s)(?!\/\/)(?!\*)/;
  let i = 0;
  while (i < lineas.length) {
    if (!ARRANQUE.test(lineas[i])) { i++; continue; }
    const desde = i;
    let j = i + 1;
    while (j < lineas.length && !ARRANQUE.test(lineas[j]) && lineas[j].trim() !== '') j++;
    const trozo = lineas.slice(desde, j).join('\n');
    i = j;
    if (/^\s*return\b/.test(trozo)) continue;

    // Sólo lo que se evalúa al renderizar: lo de antes del primer `=>` o
    // `function`. Lo de después es cuerpo de función y corre cuando se llama.
    const corte = trozo.search(/=>|\bfunction\b/);
    const enElRender = (corte === -1 ? trozo : trozo.slice(0, corte))
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

    for (const nombre of estados) {
      if (!new RegExp(`(?<!\\?)\\b${nombre}\\s*\\.`).test(enElRender)) continue;
      const guarda = new RegExp(
        `(?:!!\\s*)?\\b${nombre}\\b\\s*(?:&&|\\?|!==?\\s*null|===?\\s*null)`).test(enElRender);
      if (guarda) continue;
      nulos.push(`${path.basename(ruta)}:${base + desde} «${nombre}» empieza en null y se `
        + `lee al renderizar — ${lineas[desde].trim().slice(0, 70)}`);
    }
  }
}

if (fallos.length) {
  console.log('\nLEE ANTES DE DECLARAR — la pantalla reventaría al renderizar:');
  for (const f of fallos) console.log('  ✗ ' + f.replace(/^(\S+):\d+ /, '$1 '));
  console.log('\nUn const en zona muerta tira ReferenceError antes de pintar nada.');
  console.log('Mueve la declaración por encima de donde se lee.\n');
  process.exit(1);
}
if (nulos.length) {
  console.log('\nLEE UN ESTADO NULO AL RENDERIZAR — la pantalla no llega a pintarse:');
  for (const n of nulos) console.log('  ✗ ' + n);
  console.log('\nUsa «?.». Un «|| []» detrás NO defiende: no se llega a evaluar.\n');
  process.exit(1);
}
console.log('orden-de-render: nada se lee antes de declararse, ni con los datos '
  + `sin cargar (${mirados.length} archivo(s))`);
