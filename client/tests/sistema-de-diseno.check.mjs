// ── EL TRINQUETE DEL SISTEMA DE DISEÑO ────────────────────────────
//
// Medido hoy: en src/pages hay 232 `<button>` a pelo frente a 149 `<Button>`,
// y 116 `<input>` frente a 54 `<Input>`. Dos de cada tres controles se saltan
// el sistema de diseño.
//
// ESO ES LA CAUSA RAÍZ, NO UN DETALLE DE ESTILO. Por ahí entraron, uno por uno,
// los 48 botones de 24 a 32 píxeles, los 41 botones de icono sin nombre para un
// lector de pantalla y los dos `focus:outline-none` sin anillo que sustituyera
// al que quitaban. Cada uno se escribió a mano, y a mano es donde se olvidan
// esas tres cosas; `<Button>` las trae puestas.
//
// POR QUÉ ESTO NO ES UNA REGLA DEL LINTER. eslint.config.js de este proyecto
// tiene una calibración escrita y deliberada: sólo es ERROR lo que rompe la
// pantalla, y todo lo estilístico está apagado porque un linter que escupe
// doscientos avisos sobre código que ya existe se aprende a ignorar, y entonces
// deja de avisar también de lo que importa. Un `<button>` a pelo no rompe nada,
// así que como error sería mentira; y como aviso añadiría 265 líneas de ruido a
// un archivo cuyo texto dice justamente que eso inutiliza la herramienta.
//
// Así que no se arreglan los 265 que ya hay ni se avisa de ellos: se impide que
// crezcan. Si el número sube, esto falla y dice en qué archivo. Si baja, pide
// que se baje la línea base, para que el trinquete no se quede flojo.
//
// REESCRIBIR LOS 265 NO ES EL TRABAJO. Sería tocar cada pantalla del sistema la
// semana antes de arrancar en producción, a cambio de cero cambio visible. El
// camino es el contrario: que `Button` e `Input` acepten todo lo que hoy obliga
// a bajar a HTML plano, y que lo nuevo nazca usándolos. Esta comprobación sólo
// sostiene el suelo mientras eso pasa.
import fs from 'node:fs';
import path from 'node:path';

// La línea base del 2026-10-29, contando sólo código y no comentarios. Estos
// números SOLO pueden bajar.
//
// 2026-11-20 · +2 button y +1 input en src/pages (228→230, 111→112), los tres
// en Contenedores.jsx y los tres con su motivo:
//
//   · el INTERRUPTOR de «Contenedor de legado» es un `role="switch"` con su
//     perilla deslizante. `Button` no tiene ese papel —es un botón, no un
//     estado de encendido y apagado— así que usarlo mentiría al lector de
//     pantalla. Lleva a mano lo que `Button` traería: zona tocable de 44 px
//     (esto se usa en tableta sin ratón), anillo de foco y `aria-checked`.
//   · «Editar contenedor de legado», en la barra del detalle, es el cuarto
//     hermano de tres botones que ya son HTML plano con esas mismas clases.
//     Uno solo hecho con `Button` se vería distinto de los de al lado: la
//     incoherencia se ve, la deuda no.
//   · el campo de MOTIVO de la revisión va dentro de una fila de tabla densa,
//     pegado a la casilla de notas que ya es HTML plano. `Input` envuelve en un
//     div con su etiqueta y su `px-4 py-3`: en esa fila rompe la rejilla.
//
// Los tres son de los que el comentario de arriba llama «lo que hoy obliga a
// bajar a HTML plano»: el camino sigue siendo que Button e Input los acepten,
// no reescribir la pantalla.
//
// 2026-11-24 · +2 button en src/pages (230→232), los dos en Contenedores.jsx y
// por el mismo motivo que «Editar contenedor de legado» de arriba: son HERMANOS
// en la misma barra de acciones del detalle, donde los otros tres o cuatro
// botones ya son HTML plano con esas mismas clases largas.
//
//   · «Aprobar Contenedor» en un borrador, al lado de «Editar» y «Revisar
//     (opcional)». Ahora se aprueba primero y la revisión es posterior, así que
//     este botón tenía que existir en borrador y ser el principal de la fila.
//   · «Revisar Contenedor» en un contenedor YA APROBADO, que es la mitad nueva
//     del flujo invertido: antes no había nada que ofrecer en ese estado.
//
// Hacerlos con `Button` dejando los de al lado a pelo daría una fila con dos
// estilos de botón. La incoherencia se ve; la deuda no.
//
// 2026-11-25 · +1 button y +1 input en src/pages (232→233, 112→113): la BARRA
// DE BÚSQUEDA de Precios. Es el mismo patrón, clase por clase, que las barras
// que ya existen en Cartera.jsx y Pacas.jsx: un `<input>` con la lupa colocada
// encima en `absolute` y una `<button>` de limpiar dentro del mismo campo.
//
// `Input` no puede hacerlo: envuelve el campo en un div con su etiqueta y su
// propio relleno, así que no hay dónde posicionar la lupa dentro del borde, y
// el aspa de limpiar quedaría fuera de la caja. El camino bueno sigue siendo
// que `Input` acepte un adorno a izquierda y derecha —y entonces se arreglan
// las tres barras de golpe—, no que esta se haga distinta de las otras dos.
// 2026-11-25 (2) · +1 button y +1 input más (233→234, 113→114): el BUSCADOR DE
// LOS PANELES DE PRODUCTOS. Mismo caso que el de Precios, y el mismo patrón que
// Cartera.jsx y Pacas.jsx: `<input>` con la lupa en `absolute` dentro del borde
// y el aspa de limpiar dentro del campo. Cuenta UNA vez aunque se pinte cuatro,
// porque el componente `Panel` es compartido por los cuatro catálogos — que es
// justo lo que hay que premiar, no penalizar.
//
// Ya van cuatro barras de búsqueda con este patrón copiado. El arreglo de
// verdad es que `Input` acepte un adorno a izquierda y derecha; el día que lo
// haga, estas cuatro bajan de golpe y el techo con ellas.
//
// 2026-11-26 · +5 input en src/pages (114→119) y CERO button, los cinco en
// CuentasPagar.jsx: los dos formularios nuevos para poder CORREGIR una cuenta
// por pagar y un abono ya registrado (proveedor, notas; y el código de moneda,
// la fecha y las notas del abono).
//
// Son HERMANOS del formulario de «Nueva Cuenta por Pagar», que está en el mismo
// archivo y a cuarenta líneas: las mismas clases `inp` y `lbl`, el mismo
// `<label>` encima y el mismo ancho. `Input` envuelve el campo en un div con su
// propia etiqueta y su `px-4 py-3`, así que el de editar saldría con otro
// relleno y otro redondeo que el de crear, y son la MISMA cuenta vista dos
// veces: tenían que verse igual. Es el caso que este archivo ya llama «la
// incoherencia se ve, la deuda no».
//
// Y los BOTONES no subieron, que es lo que de verdad mide esto: los cuatro
// nuevos —editar la cuenta en la fila, editar la cuenta en el historial, y
// corregir y borrar cada abono— se hicieron con `Button size="icono"`, que trae
// los 44 px tocables y el anillo de foco puestos. Dos de ellos van al lado de
// `<button>` a pelo y se ven igual con un `className` de tres clases. O sea que
// el camino que pide el comentario de arriba —que lo nuevo nazca usando
// Button— sí funciona para los botones de icono desde que existe `size="icono"`;
// lo que sigue sin tener salida es el campo de texto.
// 2026-11-26 (2) · +5 input en src/pages (119→124) y otra vez CERO button: el
// gestor de los MÉTODOS DE PAGO en Cuentas.jsx. Son el campo del método nuevo,
// el de renombrarlo, y las tres casillas de «lleva entidad y cuenta», «para
// cobrar» y «para pagar».
//
// Es un CLON del gestor de entidades que está cien líneas más arriba en el
// mismo archivo —mismo modal, mismo `<form>` de una línea con su botón
// «Agregar», misma lista con renombrado en el sitio— y usa sus mismas clases
// escritas a mano. `Input` envuelve el campo en un div con su etiqueta y su
// `px-4 py-3`: el campo de agregar un método saldría más alto y más redondeado
// que el de agregar una entidad, en la misma pantalla y haciendo lo mismo.
//
// Las TRES CASILLAS no tienen alternativa en el sistema de diseño: `Input` no
// hace un checkbox. Van dentro de un `<label>` con `min-h-11`, que es la zona
// tocable que `Input` traería puesta.
//
// Y los cuatro botones de cada fila (guardar, cancelar, editar, quitar o
// reactivar) se hicieron con `Button size="icono"` aunque sus hermanos de
// arriba sean HTML plano: con tres clases de `className` se ven igual, así que
// aquí el argumento de «la incoherencia se ve» no aplica y no hay motivo para
// bajar a HTML plano. Van dos tandas seguidas en las que el techo de botones no
// se mueve; el de campos de texto sigue siendo el único sin salida.
// 2026-11-26 (3) · +3 button y +3 input en src/pages (234→237, 124→127): la
// pantalla NUEVA de «Lo repartido», la matriz de lo que ya salió por familia y
// calidad. Es un archivo nuevo entero, así que seis controles es poco; cada uno
// con su motivo:
//
//   · LAS DOS FLECHITAS de desplegar (la familia y la referencia) van dentro de
//     filas de tabla densas, con `p-1` y un icono de 13-15 px. `Button
//     size="icono"` obliga a 44×44, que es lo correcto cuando el botón es la
//     única forma de hacer algo — y aquí no lo es: LA FILA ENTERA abre y cierra,
//     y mide de sobra. La flecha es la señal de que hay algo debajo y el asa
//     para el teclado; hacerla de 44 px triplicaría el alto de cada fila de una
//     tabla que puede tener cuarenta. Llevan `aria-expanded` y su nombre
//     accesible con la familia dentro.
//   · EL ASPA DE LIMPIAR del buscador: el quinto caso del mismo patrón que ya
//     explican las dos notas de arriba (Cartera, Pacas, Precios, Productos).
//   · LOS TRES CAMPOS son ese mismo buscador —con la lupa en `absolute` dentro
//     del borde, que es lo que `Input` no deja hacer— y las DOS FECHAS del
//     rango, que van en línea dentro de una barra de herramientas junto a los
//     botones de «Este mes / Mes pasado / …». `Input` las envolvería en un div
//     con su etiqueta encima y rompería esa barra.
//
// Y los seis botones de rango SÍ son `Button`, con `aria-pressed`.
//
// Van tres tandas seguidas con la misma conclusión, así que ya no es una
// impresión: lo que falta en el sistema de diseño es un `Input` que acepte
// adornos a los lados, y un botón de icono DENSO (sin el mínimo de 44 px) para
// dentro de una fila de tabla cuyo área pulsable es la fila. Con esas dos
// piezas, estas cinco barras de búsqueda y estas flechitas bajan de golpe.
const TECHO = {
  'src/pages':      { button: 237, input: 127 },
  'src/components': { button: 33,  input: 8   },
};

// Los comentarios no son código. Esta comprobación saltó la primera vez por un
// comentario que EXPLICABA el problema y escribía `<button>` dentro: contar
// prosa como deuda hace que la única salida sea no poder hablar del tema en un
// comentario, que es justo lo contrario de lo que se busca. (Es la segunda vez
// en este proyecto que un contador lee un comentario y se cree lo que ve.)
function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // bloque
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // línea, sin tragarse el // de una URL
}

function jsxDe(dir) {
  const salida = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name.endsWith('.jsx')) salida.push(p);
    }
  };
  recorrer(dir);
  return salida;
}

let fallos = 0;
console.log('El trinquete del sistema de diseño');

for (const [dir, techo] of Object.entries(TECHO)) {
  const porArchivo = { button: {}, input: {} };
  let total = { button: 0, input: 0 };

  for (const f of jsxDe(path.join(process.cwd(), ...dir.split('/')))) {
    const texto = sinComentarios(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
    for (const etiqueta of ['button', 'input']) {
      // `<button` en minúscula es el elemento HTML; `<Button` es el componente.
      // La distinción es la mayúscula, así que la búsqueda es sensible a ella.
      const n = (texto.match(new RegExp('<' + etiqueta + '(?![A-Za-z])', 'g')) || []).length;
      if (n) {
        porArchivo[etiqueta][rel] = n;
        total[etiqueta] += n;
      }
    }
  }

  for (const etiqueta of ['button', 'input']) {
    const hay = total[etiqueta];
    const max = techo[etiqueta];
    if (hay > max) {
      fallos++;
      console.log('  ✗ ' + dir + ': ' + hay + ' <' + etiqueta + '> a pelo, el techo es ' + max);
      console.log('      Hay ' + (hay - max) + ' nuevo(s). Usa <'
        + etiqueta[0].toUpperCase() + etiqueta.slice(1)
        + '> de components/common, que ya trae el tamaño táctil, el anillo de');
      console.log('      foco y el nombre accesible. Si de verdad hace falta HTML plano,');
      console.log('      sube el techo en este archivo Y explica por qué en el commit.');
      const peores = Object.entries(porArchivo[etiqueta]).sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log('      Los que más tienen: ' + peores.map(([f, n]) => f + ' (' + n + ')').join(', '));
    } else if (hay < max) {
      console.log('  ✓ ' + dir + ': ' + hay + ' <' + etiqueta + '> a pelo (bajó de ' + max + ')');
      console.log('      Baja el techo a ' + hay + ' en este archivo para que el trinquete no quede flojo.');
    } else {
      console.log('  ✓ ' + dir + ': ' + hay + ' <' + etiqueta + '> a pelo, igual que el techo');
    }
  }
}

console.log('');
if (fallos) {
  console.error('El sistema de diseño se está saltando más que antes: ' + fallos + ' caso(s)');
  process.exit(1);
}
console.log('La deuda del sistema de diseño no ha crecido');
