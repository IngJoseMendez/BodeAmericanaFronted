// ── La aritmética del reparto de la Matriz ──────────────────────────────────
//
// La Fase 2 de la Matriz consiste en una sola pregunta repetida veinte veces:
// «hay 10, me piden 20, ¿a quién le doy cuánto?». Todo lo que hay aquí dentro
// existe para contestarla sin que la dueña tenga que hacer cuentas de cabeza y,
// sobre todo, sin que la pantalla y el servidor puedan contestarla distinto.
//
// Son funciones puras: entran datos, sale un número o un Map. Ni un import de
// React, ni un fetch, ni una fecha, ni un Math.random. Tres razones:
//
//  1. Se pueden probar sin navegador. `node client/src/lib/matriz.test.mjs`
//     compara contra números hechos a mano, que es la única forma de saber que
//     un reparto de 8/7/5 sobre 10 da 4/4/2 y no 4/3/2 con una paca perdida.
//  2. La pantalla las llama EN CADA TECLA. La Matriz pinta cientos de <tbody>
//     y su rendimiento vive de que React.memo aguante; una función que reserve
//     memoria de más o que lance con una entrada a medio escribir se nota.
//  3. Por eso mismo, TODAS aguantan basura sin lanzar: null, undefined, NaN,
//     negativos, strings, un Map donde se esperaba un array. Mientras teclea,
//     la mitad de los valores están a medias por definición, y una excepción
//     aquí no se ve como un error: se ve como que la Matriz se queda en blanco
//     con el trabajo de media mañana dentro.
//
// LA REGLA DE ORO DEL MÓDULO, que está escrita en el propio cotizacion.js
// porque este proyecto YA tuvo el bug: no se escribe una segunda aritmética.
// El dinero de la Fase 2 no se recalcula con fórmulas nuevas — se proyecta el
// mismo estado `filas` de la Fase 1 con las cantidades repartidas y se pasa por
// la `totalesFila` de siempre. Cuando convivían dos fórmulas, una para la fila
// que se veía y otra para el total que se cobraba, el total cobraba menos.
//
// VOCABULARIO. La palabra es FALTANTE, el verbo REPARTIR y el evento REPARTO.
// Y lo que sobra del stock sin repartir se llama «sin repartir», jamás
// «faltante»: son dos cosas opuestas y confundirlas en el código termina
// confundiéndolas en la pantalla.

import { parseMonto } from './money.js';
import { cantidadDe, itemCompleto, totalesFila } from './cotizacion.js';

// Referencias, categorías y calidades viven en tablas distintas y difieren en
// mayúsculas y acentos. Comparar en crudo es el bug por el que en Cotizaciones
// «el precio no se ponía solo». Es la MISMA función que SeparacionMasiva.jsx
// tiene en su cabecera desde siempre; al sacarla aquí, la Fase 1, la Fase 2 y
// el cruce de faltantes comparan igual por construcción y no por disciplina.
// (El rango del replace son las marcas diacríticas combinantes que deja NFD.
// Va copiado tal cual del original para que las dos comparen idéntico: si una
// pantalla normaliza y la otra no, "Mixta Invierno" y "MIXTA INVIERNO" pasan a
// ser dos productos distintos y el reparto se parte en dos sin que nada falle.)
export const normTxt = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * ¿Coincide este texto con lo que se está buscando?
 *
 * TODAS las palabras escritas tienen que aparecer, PERO EN CUALQUIER ORDEN y sin
 * tener que estar seguidas. Es lo que hacía falta y no había: un cliente
 * guardado como «jose alberto mendez» no salía buscando «jose mendez», porque
 * un `includes` de la frase entera exige que las palabras estén pegadas y en
 * ese mismo orden. Y así es justo como se busca a la gente: por el nombre y el
 * apellido que uno recuerda, saltándose el segundo nombre que nunca se sabe.
 *
 * Lo mismo vale para los productos: «invierno mixta» encuentra «mixta invierno
 * dama importada».
 *
 * Una consulta vacía coincide con todo, que es lo que hace que quitar el filtro
 * devuelva la lista entera sin ningún caso especial en quien llama.
 *
 * (Vive en este archivo porque aquí está `normTxt` y las dos tienen que
 * normalizar idéntico; el nombre del archivo es histórico, la función no es
 * exclusiva de la Matriz y la usan también los campos de catálogo.)
 */
export function coincideBusqueda(texto, consulta) {
  const palabras = normTxt(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const donde = normTxt(texto);
  return palabras.every((palabra) => donde.includes(palabra));
}

// La disponibilidad y lo pedido se cruzan por referencia + calidad, que es
// exactamente por lo que el servidor busca las pacas al crear la cotización
// (reservarPacas empareja SOLO por referencia+calidad; el payload de detalles
// no lleva `clasificacion` a propósito). Si esta clave fuera más estricta que
// la del servidor, o al revés, aparecerían faltantes que la pantalla no
// predijo, que es la peor clase de faltante: el que nadie decidió.
export const claveStock = (referencia, calidad) => `${normTxt(referencia)}|${normTxt(calidad)}`;

/**
 * Clave de UNA asignación: un cliente concreto recibiendo un producto concreto.
 *
 * No está en el contrato con este nombre, pero hace falta un sitio único donde
 * se decida cómo se arma `${cliente_id}|${claveStock}`, porque esa cadena la
 * escriben la Fase 2 (al guardar lo que teclea la dueña) y la leen
 * `proyectarFilas` y `reconciliarReparto`. Si cada una la construyera a mano,
 * bastaría un espacio de más en un sitio para que la proyección del dinero
 * dejara de encontrar la mitad de las asignaciones y el pie de página cobrara
 * de menos, en silencio y sin ningún error en consola.
 */
export const claveAsignacion = (clienteId, referencia, calidad) =>
  `${clienteId}|${claveStock(referencia, calidad)}`;

// ── Utilidades internas ─────────────────────────────────────────────────────

/**
 * Unidades: entero, nunca negativo, nunca NaN. Se apoya en `parseMonto` porque
 * buena parte de estos números salen de un <input> que la dueña está tecleando,
 * y en Colombia el punto separa miles: leer "1.234" con parseFloat da 1,234 y
 * destruye el dato sin avisar. Es la misma lectura que hace `cantidadDe`.
 */
const entero = (v) => Math.max(0, Math.round(parseMonto(v)));

const lista = (v) => (Array.isArray(v) ? v : []);

/** Lee de un Map, y también de un objeto plano, sin romperse si llega null. */
function leerMapa(m, k) {
  if (!m) return undefined;
  try {
    if (typeof m.get === 'function') return m.get(k);
    if (typeof m === 'object') return m[k];
  } catch { /* un objeto raro no debe tumbar una tabla entera */ }
  return undefined;
}

/** Pares clave/valor de un Map o de un objeto plano, tolerante a basura. */
function pares(m) {
  if (!m) return [];
  try {
    if (typeof m.entries === 'function') return [...m.entries()];
    if (typeof m === 'object') return Object.entries(m);
  } catch { /* idem */ }
  return [];
}

const sumarEn = (m, k, n) => m.set(k, (m.get(k) || 0) + n);

/**
 * Deja las líneas de un producto en la forma mínima que necesitan los tres
 * criterios de reparto, conservando el ORDEN recibido —que es información: es
 * el orden en que se ven en la pantalla y el que usa «Por orden»—.
 *
 * Se descartan las que no traen `cliente_id`, porque una asignación sin dueño
 * no se puede ni guardar ni pintar. Las que traen `pedida` en 0 SÍ se conservan
 * y reciben 0: la fila existe en la tabla y su celda «Le doy» tiene que leer un
 * número del Map, no un `undefined` que se pinte como hueco. Un hueco y un cero
 * no pueden verse distinto.
 */
function normalizarLineas(lineas) {
  const salida = [];
  lista(lineas).forEach((l, i) => {
    const id = l?.cliente_id;
    if (id === null || id === undefined || id === '') return;
    salida.push({
      cliente_id: id,
      pedida: entero(l?.pedida),
      faltante_abierto: entero(l?.faltante_abierto),
      orden: i,
    });
  });
  return salida;
}

/** Map con una entrada en 0 por cada línea, para que ninguna celda quede muda. */
function mapaEnCero(filas) {
  const m = new Map();
  for (const l of filas) if (!m.has(l.cliente_id)) m.set(l.cliente_id, 0);
  return m;
}

// ── Los tres criterios de reparto ───────────────────────────────────────────
//
// Son tres y no cuatro a propósito. «A partes iguales» con 3 pacas entre 12
// clientes da base = floor(3/12) = 0 y colapsa exactamente en «Por orden»: dos
// botones distintos haciendo lo mismo sin explicación, que es peor que un botón
// de menos. Los tres que quedan responden a tres preguntas de negocio distintas
// y ella elige según a quién quiere cuidar ese día.

/**
 * A PRORRATA — reparte en proporción a lo que pidió cada uno.
 *
 * Es el criterio «justo» y el que se ofrece primero: si hay 10 y entre tres
 * piden 20, cada uno se lleva la mitad de lo suyo. El problema es que la mitad
 * de 7 son 3,5 y las pacas no se parten, así que la parte entera se reparte
 * primero y las SUELTAS van al que más decimal arrastra —que es el reparto de
 * resto por mayor decimal de toda la vida—; los empates los gana el que más
 * pidió, que es literalmente lo que promete el title del botón: «las sueltas
 * van al que más pidió». Sin ese desempate el resultado dependería del orden en
 * que llegara el array y dos rondas iguales darían números distintos.
 *
 * 8/7/5 sobre 10 → 4/4/2. Exactos 4 / 3,5 / 2,5; enteros 4/3/2 = 9; sobra 1 y
 * se la lleva el de 7 por pedir más que el de 5 con el mismo decimal.
 *
 * DOS TOPES INNEGOCIABLES, y por eso están escritos dos veces (en el factor y
 * en el reparto del resto): nunca se reparte más que el disponible —repartir
 * mercancía que no existe es exactamente lo que la Fase 2 vino a impedir— y
 * nunca se le da a nadie más de lo que pidió, porque una cotización con más
 * pacas de las pedidas se despacha y el cliente la devuelve.
 *
 * @param {Array<{cliente_id:*, pedida:number}>} lineas
 * @param {number} disponible
 * @returns {Map<*, number>} cliente_id → cantidad
 */
export function aProrrata(lineas, disponible) {
  const filas = normalizarLineas(lineas);
  const salida = mapaEnCero(filas);

  const hay = entero(disponible);
  const pedidoTotal = filas.reduce((s, l) => s + l.pedida, 0);
  if (hay <= 0 || pedidoTotal <= 0) return salida;

  // Si sobra mercancía, el factor se topa en 1: el reparto se acaba cuando
  // todos tienen lo que pidieron, no cuando se acaba el stock.
  const aRepartir = Math.min(hay, pedidoTotal);
  const factor = aRepartir / pedidoTotal;

  const partes = filas.map((l) => {
    const exacto = l.pedida * factor;
    const entera = Math.floor(exacto);
    return { ...l, base: Math.min(l.pedida, entera), decimal: exacto - entera };
  });

  let resto = aRepartir - partes.reduce((s, p) => s + p.base, 0);

  // Cola de espera de las sueltas: mayor decimal primero, empate al que más
  // pidió, y si aun así empatan, el que llegó antes (o sea, el que está más
  // arriba en la pantalla). Determinista de arriba abajo.
  const cola = [...partes].sort(
    (a, b) => (b.decimal - a.decimal) || (b.pedida - a.pedida) || (a.orden - b.orden)
  );

  // Normalmente basta una vuelta: el resto siempre es menor que el número de
  // líneas con decimal. El bucle con tope existe porque `resto` sale de una
  // división en coma flotante y un caso raro podría dejar una paca colgando;
  // antes dar otra vuelta que devolver un reparto que no suma. El tope evita
  // que un dato imposible congele la pestaña.
  let vueltas = 0;
  while (resto > 0 && vueltas < 4) {
    let dio = false;
    for (const p of cola) {
      if (resto <= 0) break;
      if (p.base >= p.pedida) continue;   // ya tiene todo lo que pidió
      p.base += 1;
      resto -= 1;
      dio = true;
    }
    if (!dio) break;   // nadie puede recibir más: sobra stock, y sobrar es legal
    vueltas += 1;
  }

  for (const p of partes) sumarEn(salida, p.cliente_id, p.base);
  return salida;
}

/**
 * POR ORDEN — de arriba abajo hasta que se acaben.
 *
 * Es el criterio menos «justo» y el más honesto: es exactamente lo que hace el
 * servidor cuando reserva pacas, así que si ella reparte así, lo que ve es lo
 * que va a pasar. Sirve para el caso real de «a estos dos les cumplo completo y
 * el resto que espere», que en una bodega es una decisión comercial legítima:
 * media docena de clientes con pedidos completos vale más que veinte con
 * pedidos partidos.
 *
 * @param {Array<{cliente_id:*, pedida:number}>} lineas
 * @param {number} disponible
 * @returns {Map<*, number>} cliente_id → cantidad
 */
export function porOrden(lineas, disponible) {
  const filas = normalizarLineas(lineas);
  const salida = mapaEnCero(filas);

  let libre = entero(disponible);
  for (const l of filas) {
    if (libre <= 0) break;
    const dar = Math.min(l.pedida, libre);
    sumarEn(salida, l.cliente_id, dar);
    libre -= dar;
  }
  return salida;
}

/**
 * CUBRIR LO QUE FALTÓ — primero se le repone a quien ya se le venía debiendo.
 *
 * Es la razón de ser del módulo entero, y la frase literal del encargo: que la
 * memoria de lo que faltó sirva para «la próxima poder distribuírselo bien».
 * Sin este criterio, guardar faltantes es decorativo: se anota un faltante que
 * nadie usa para decidir nada y que envejece hasta que el cliente se cansa.
 *
 * Dos pasadas, en este orden y no en otro:
 *  1. EL FALTANTE VIEJO de ESE producto, topado por lo que el cliente pide hoy.
 *     Se topa porque no se le puede meter en la cotización mercancía que no ha
 *     pedido en esta ronda, ni aunque se la debamos: el faltante se abona cuando
 *     él la vuelve a pedir, y para eso está el botón que carga el faltante al
 *     pedido en la Fase 1.
 *  2. Lo que sobre, POR ORDEN, para el pedido nuevo de todos. Aquí ya no hay
 *     nada que compensar, y usar prorrata en la segunda pasada mezclaría dos
 *     criterios en un botón que promete uno.
 *
 * El caso que lo justifica: dos clientes piden 5 cada uno y hay 5. Por orden,
 * el primero se lleva las 5 y el segundo —al que ya le faltaron 4 la ronda
 * pasada— se va otra vez con las manos vacías, que es cómo se pierde un
 * cliente. Con este criterio se lleva sus 4 y el primero se lleva 1.
 *
 * @param {Array<{cliente_id:*, pedida:number, faltante_abierto:number}>} lineas
 * @param {number} disponible
 * @returns {Map<*, number>} cliente_id → cantidad
 */
export function cubrirFaltante(lineas, disponible) {
  const filas = normalizarLineas(lineas);
  const salida = mapaEnCero(filas);

  let libre = entero(disponible);
  const dado = filas.map(() => 0);

  // 1ª pasada — lo que ya se le venía debiendo de ESTE producto.
  filas.forEach((l, i) => {
    if (libre <= 0) return;
    const debido = Math.min(l.faltante_abierto, l.pedida);
    const dar = Math.min(debido, libre);
    dado[i] = dar;
    libre -= dar;
  });

  // 2ª pasada — el resto del pedido, por orden, hasta agotar.
  filas.forEach((l, i) => {
    if (libre <= 0) return;
    const dar = Math.min(l.pedida - dado[i], libre);
    dado[i] += dar;
    libre -= dar;
  });

  filas.forEach((l, i) => sumarEn(salida, l.cliente_id, dado[i]));
  return salida;
}

// ── Reconciliación ──────────────────────────────────────────────────────────

/**
 * Ajusta un reparto YA HECHO a unos pedidos y un disponible que cambiaron.
 *
 * Pasa cada vez que ella vuelve a la Fase 1, toca algo y cruza otra vez, y cada
 * vez que se relee el inventario porque otra persona apartó pacas. El reparto
 * que tenía delante puede haberse quedado imposible: le estaba dando 6 de algo
 * de lo que ahora solo hay 4, o le estaba dando 3 a un cliente que borró la
 * línea.
 *
 * CUATRO REGLAS, EN ESTE ORDEN Y NINGUNA EN SILENCIO:
 *  1. Producto + cliente que no cambió → su asignación se conserva EXACTA. Es
 *     el caso normal, es la inmensa mayoría, y no debe costar ni un número.
 *  2. El cliente bajó su pedido por debajo de lo asignado → se recorta al
 *     pedido nuevo. Lo que ella acaba de escribir manda sobre lo que había.
 *  3. El cliente borró la línea, o el producto ya no lo pide nadie → se
 *     descarta. Una asignación a una línea que ya no existe no se puede pintar
 *     y arrastrarla acabaría creando una cotización fantasma.
 *  4. El disponible bajó por debajo de lo ya repartido → se recorta A PRORRATA.
 *     Está escrito en el diseño con todas las letras («no de abajo arriba, que
 *     son dos algoritmos distintos y quien lo implemente elegiría uno al azar»):
 *     si hay que quitarle a alguien sin que ella lo decida, se le quita a todos
 *     en proporción, que es lo único que no parece un castigo arbitrario.
 *
 * Y LO QUE DEVUELVE ES LA MITAD DEL PUNTO. `ajustados` es la lista de lo que
 * esta función tocó, para que la barra pueda decir «Reajusté el reparto de 2
 * productos porque cambió lo disponible» y marcarlos con el chip «cambió».
 * Cambiarle un número a la callada a alguien que lleva media hora repartiendo a
 * dedo es exactamente lo que hace que la dueña deje de confiar en la pantalla,
 * y una pantalla en la que no se confía se sustituye por un Excel — que es de
 * donde venimos.
 *
 * NOTA SOBRE LO QUE ESTA FUNCIÓN NO HACE, para que no lo añada nadie de paso:
 * si el disponible SUBIÓ (llegó un contenedor, se rechazó una cotización y se
 * liberaron pacas), aquí NO se vuelve a disparar el autorreparto. Primero
 * porque con esta firma no se sabe cuál era el disponible anterior, así que
 * «volvió a alcanzar» no es una pregunta que se pueda contestar; y segundo
 * porque repartir de más solo, sin que se le pida, pisaría en silencio una
 * decisión legítima: dejar pacas sin repartir para guardárselas. Esa decisión
 * es de la pantalla, que sí sabe qué leyó antes, y no de esta función.
 *
 * @param {Map<string, number>|object} asignaciones  claveAsignacion → cantidad
 * @param {Array<{referencia, calidad, disponibles, clientes:Array<{cliente_id, pedida}>}>} productos
 * @returns {{ asignaciones: Map<string, number>,
 *             ajustados: Array<{referencia, calidad, antes, ahora, descartado?:boolean}> }}
 */
export function reconciliarReparto(asignaciones, productos) {
  // Índice inverso: claveStock → { claveAsignacion → cantidad }. Se construye
  // de una pasada, y no buscando por producto dentro del Map, porque una ronda
  // grande tiene veinte productos por cientos de clientes y esto se ejecuta
  // cada vez que ella cruza de fase. Además es lo que permite descubrir las
  // asignaciones HUÉRFANAS —las de productos que ya no aparecen en la tabla—,
  // que de otra forma se perderían sin que nadie contara nada.
  const previos = new Map();
  for (const [k, v] of pares(asignaciones)) {
    const clave = String(k);
    const corte = clave.indexOf('|');
    if (corte < 0) continue;   // clave con otra forma: no es nuestra, se ignora
    const cs = clave.slice(corte + 1);
    if (!previos.has(cs)) previos.set(cs, new Map());
    previos.get(cs).set(clave, entero(v));
  }

  const salida = new Map();
  const ajustados = [];

  for (const p of lista(productos)) {
    const cs = claveStock(p?.referencia, p?.calidad);
    const grupo = previos.get(cs) || new Map();
    previos.delete(cs);   // lo que quede sin visitar al final son los huérfanos

    const antes = [...grupo.values()].reduce((s, n) => s + n, 0);
    const disponible = entero(p?.disponibles);

    // Reglas 1, 2 y 3: se recorre lo que HOY pide la tabla. Lo que no esté en
    // esta lista, no existe.
    const vivos = [];
    for (const c of lista(p?.clientes)) {
      const id = c?.cliente_id;
      if (id === null || id === undefined || id === '') continue;
      const clave = claveAsignacion(id, p?.referencia, p?.calidad);
      const pedida = entero(c?.pedida);
      vivos.push({ clave, cliente_id: id, pedida, asignada: Math.min(entero(grupo.get(clave)), pedida) });
    }

    let ahora = vivos.reduce((s, v) => s + v.asignada, 0);

    // Regla 4: ya no cabe. Se recorta a prorrata sobre lo ASIGNADO (no sobre lo
    // pedido): el recorte tiene que repartir el daño entre los que iban a
    // recibir, no volver a repartir desde cero y desmontarle el trabajo hecho.
    if (ahora > disponible) {
      const recorte = aProrrata(vivos.map((v) => ({ cliente_id: v.cliente_id, pedida: v.asignada })), disponible);
      // El Map del recorte va por cliente, y un cliente podría traer dos líneas
      // del mismo producto (dos precios distintos no se funden). Se va gastando
      // su cupo línea a línea, de arriba abajo, para no darle dos veces lo
      // mismo — que es cómo un recorte acabaría repartiendo MÁS que antes.
      const cupo = new Map(recorte);
      for (const v of vivos) {
        const queda = entero(cupo.get(v.cliente_id));
        const dar = Math.min(queda, v.asignada);
        v.asignada = dar;
        cupo.set(v.cliente_id, queda - dar);
      }
      ahora = vivos.reduce((s, v) => s + v.asignada, 0);
    }

    for (const v of vivos) if (v.asignada > 0) salida.set(v.clave, v.asignada);

    if (ahora !== antes) {
      ajustados.push({ referencia: p?.referencia ?? '', calidad: p?.calidad ?? '', antes, ahora });
    }
  }

  // Huérfanos: productos que tenían reparto y ya no los pide nadie (regla 3 a
  // nivel de producto). Se cuentan igualmente, porque son pacas que ella había
  // repartido y que ya no están repartidas; que desaparezcan sin línea en el
  // aviso es justo el silencio que esta función existe para evitar. Van con
  // `descartado: true` y con la referencia NORMALIZADA —en minúsculas y sin
  // acentos—, porque el texto bonito venía de la tabla y la tabla ya no lo
  // trae: se prefiere decirlo feo a no decirlo.
  for (const [cs, grupo] of previos) {
    const antes = [...grupo.values()].reduce((s, n) => s + n, 0);
    if (antes <= 0) continue;
    const corte = cs.indexOf('|');
    ajustados.push({
      referencia: corte < 0 ? cs : cs.slice(0, corte),
      calidad: corte < 0 ? '' : cs.slice(corte + 1),
      antes,
      ahora: 0,
      descartado: true,
    });
  }

  return { asignaciones: salida, ajustados };
}

// ── El dinero ───────────────────────────────────────────────────────────────

/**
 * Copia de `filas` (el estado de la Fase 1) con cada cantidad sustituida por lo
 * que de verdad se le reparte, descartando las líneas que quedan en cero.
 *
 * ESTA FUNCIÓN ES LA QUE EVITA EL BUG QUE ESTE REPO YA TUVO. La Fase 2 no
 * vuelve a calcular dinero: proyecta y pasa el resultado por la `totalesFila`
 * de cotizacion.js, que es la misma que usan la cotización normal y la Fase 1.
 * Replicarla aquí obligaría a reproducir tres reglas sutiles —el descuento como
 * monto por paca multiplicado por unidades y topado por ítem, el transporte de
 * fila que pisa al global solo si el string no está vacío, y los ítems con
 * `esPromocion` excluidos del descuento— y la primera que se olvidara cobraría
 * distinto en la fila y en el total. Ya pasó una vez y el total cobraba de
 * menos; el propio cotizacion.js lo documenta en su cabecera.
 *
 * Se descartan las líneas en cero porque una cotización sale SOLO con lo que se
 * le repartió: una línea de 0 pacas no es una línea, es ruido en un documento
 * que el cliente lee. Lo que se le quedó debiendo no va en la cotización, va al
 * libro de faltantes, que es otro sitio a propósito.
 *
 * El CLIENTE, en cambio, se conserva aunque se quede sin ninguna línea. Su
 * tarjeta en la cinta tiene que poder pintarse en gris con el chip «sin nada» y
 * su nombre tiene que salir en el pie («ANDREA no recibe nada: le quedan
 * faltando 5»). Un cliente al que no le tocó nada es información, no un hueco.
 *
 * @param {object} filas     cliente_id → { items:[…], descuento, tipo_descuento, transporte_unitario }
 * @param {Map<string, number>|object} asignado  claveAsignacion → cantidad
 * @returns {object} la misma forma que `filas`, con las cantidades repartidas
 */
/**
 * Recorre las líneas completas de un cliente gastando el cupo asignado de
 * arriba abajo, y devuelve por cada una qué pidió y qué le tocó.
 *
 * Vive aparte porque lo necesitan DOS funciones —`proyectarFilas`, que arma el
 * dinero, y `totalesDeReparto`, que cuenta lo que queda faltando— y el día que
 * cada una recorriera las líneas por su cuenta, el dinero y las pacas dejarían
 * de salir del mismo reparto sin que nada fallara.
 *
 * El cupo importa: un cliente puede tener DOS líneas del mismo producto cuando
 * los precios difieren (el diseño lo permite a propósito: promediar un precio
 * que ella escribió distinto le movería el descuento sin que nada fallara). Sin
 * cupo, las dos líneas leerían la misma clave y cada una se llevaría la
 * asignación entera: el cliente pagaría el doble de pacas de las que se le
 * apartaron, y cuadraría con todo menos con la bodega.
 */
function lineasRepartidas(clienteId, fila, asignado) {
  const cupo = new Map();
  const salida = [];

  for (const it of lista(fila?.items)) {
    // Mismo criterio que la Fase 1: una línea a medias no se envía, así que
    // tampoco se reparte ni se cobra.
    if (!itemCompleto(it)) continue;
    const clave = claveAsignacion(clienteId, it?.referencia, it?.calidad);
    const queda = cupo.has(clave) ? cupo.get(clave) : entero(leerMapa(asignado, clave));
    const pedida = cantidadDe(it);
    const dada = Math.min(queda, pedida);
    cupo.set(clave, queda - dada);
    salida.push({ item: it, clave, pedida, dada });
  }

  return salida;
}

/** ¿Está esta línea marcada como «esto no queda debiendo»? */
const descartada = (conjunto, clave) => {
  if (!conjunto) return false;
  if (typeof conjunto.has === 'function') return Boolean(conjunto.has(clave));
  if (Array.isArray(conjunto)) return conjunto.includes(clave);
  return Boolean(conjunto[clave]);
};

export function proyectarFilas(filas, asignado) {
  const fuente = filas && typeof filas === 'object' ? filas : {};
  const salida = {};

  for (const [clienteId, fila] of Object.entries(fuente)) {
    const items = lineasRepartidas(clienteId, fila, asignado)
      .filter((l) => l.dada > 0)
      .map((l) => ({ ...l.item, cantidad: l.dada }));

    salida[clienteId] = { ...fila, items };
  }

  return salida;
}

/**
 * Las cuentas de toda la ronda, cliente por cliente y en total.
 *
 * Es lo que alimenta la cinta de clientes («MARIA · 11/18 · ●7 · $17.935.000»,
 * que es literalmente la fila 2 de su Excel) y el pie pegajoso de la Fase 2
 * («8 cliente(s) · 78 paca(s) repartidas · $131.280.000»). Vive aquí y no en la
 * pantalla por la misma razón que todo lo demás: la cinta y el pie tienen que
 * salir del mismo cálculo, o el día que no cuadren nadie sabrá cuál miente.
 *
 * Ojo con la diferencia entre los dos pies de la aplicación, que NO es un error
 * y hay que dejar que se vea: el de la Fase 1 suma lo PEDIDO y el de la Fase 2
 * suma lo REPARTIDO. Son dos números distintos a propósito y el microcopy de la
 * Fase 1 lo dice con todas las letras.
 *
 * @param {object} filas   el estado de la Fase 1
 * @param {Map<string, number>|object} asignado  claveAsignacion → cantidad
 * @param {number|string} transporteGlobal  el de la barra, que la fila puede pisar
 * @param {Set<string>} [sinFaltante]  las líneas apagadas con «esto no queda debiendo»
 * @returns {{ clientes: Map<*, object>, numClientes:number, unidades:number,
 *             pedidas:number, faltando:number, clientesConFaltante:number,
 *             clientesSinNada:number, total:number }}
 */
export function totalesDeReparto(filas, asignado, transporteGlobal, sinFaltante) {
  const fuente = filas && typeof filas === 'object' ? filas : {};
  const proyeccion = proyectarFilas(fuente, asignado);

  const clientes = new Map();
  let numClientes = 0;
  let unidades = 0;
  let pedidas = 0;
  let faltando = 0;
  let total = 0;
  let clientesConFaltante = 0;
  let clientesSinNada = 0;

  for (const [clienteId, fila] of Object.entries(fuente)) {
    const lineas = lineasRepartidas(clienteId, fila, asignado);
    const pedidasCliente = lineas.reduce((s, l) => s + l.pedida, 0);
    const t = totalesFila(proyeccion[clienteId] || { items: [] }, transporteGlobal);

    // El faltante se cuenta LÍNEA A LÍNEA y no como resta del total del cliente,
    // porque ella puede apagar el de una línea suelta con la casilla «esto no
    // queda debiendo» (el caso del cliente que pide 50 sabiendo que hay 10).
    // Restando totales, esa línea seguiría contando: el botón prometería anotar
    // más faltantes de los que el servidor va a escribir, y ese desajuste no
    // rompe nada — sólo hace que la pantalla y el libro dejen de cuadrar.
    const faltandoCliente = lineas.reduce(
      (s, l) => (descartada(sinFaltante, l.clave) ? s : s + Math.max(0, l.pedida - l.dada)),
      0,
    );

    // La clave del Map se devuelve como número cuando lo es, porque las claves
    // de un objeto de JavaScript siempre son strings y quien consuma esto va a
    // cruzarlas contra `cliente.id`, que llega del servidor como número. Ese
    // desajuste no lanza: simplemente no encuentra nada, y la cinta saldría
    // vacía sin ningún error. De todas formas el `cliente_id` va también dentro
    // del valor, para que nadie dependa del tipo de la clave.
    const idNum = Number(clienteId);
    const clave = Number.isFinite(idNum) ? idNum : clienteId;

    clientes.set(clave, {
      cliente_id: clave,
      pedidas: pedidasCliente,
      repartidas: t.unidades,
      faltando: faltandoCliente,
      subtotal: t.subtotal,
      descuento: t.descuento,
      transporteUnitario: t.transporteUnitario,
      transporteTotal: t.transporteTotal,
      total: t.total,
    });

    pedidas += pedidasCliente;
    unidades += t.unidades;
    faltando += faltandoCliente;
    total += t.total;
    if (t.unidades > 0) {
      numClientes += 1;
    } else if (pedidasCliente > 0) {
      // Pidió y no le tocó nada. No suma dinero —`totalesFila` de una fila sin
      // ítems válidos devuelve 0 en todo, transporte incluido, porque el flete
      // se cobra por paca—, pero sí sale con nombre y apellido en el pie: es la
      // línea que evita que se entere el cliente antes que ella.
      clientesSinNada += 1;
    }
    if (faltandoCliente > 0) clientesConFaltante += 1;
  }

  return {
    clientes, numClientes, unidades, pedidas, faltando,
    clientesConFaltante, clientesSinNada, total,
  };
}

// ── Lo que queda de cada calidad ────────────────────────────────────────────
//
// EL CASO QUE LO MOTIVÓ: una referencia como «Mixta Invierno» llega en tres
// calidades —12 de Primera, 10 de Segunda, 8 de Tercera— y la lista de
// referencias decía «Mixta Invierno · 30 disp». Treinta no existen para ningún
// cliente: el servidor aparta por referencia Y calidad, y a quien pide Primera
// le caben 12 como mucho. La suma no fallaba en ningún sitio; se leía como un
// dato, que es la forma cara de mentir.
//
// Así que la cuenta se hace SIEMPRE por calidad, y siempre descontando lo que ya
// se pidió en la ronda: si tres clientes ya se llevaron 8 de las 12 de Primera,
// al cuarto le quedan 4, no 12.

/**
 * Lo que queda de cada calidad de UNA referencia, ya descontado lo pedido en la
 * ronda.
 *
 * `propia` es la línea que hace la pregunta. Lo suyo NO se descuenta: si esta
 * línea ya pide 5 de Primera y vuelve a abrir la lista, lo que tiene que leer es
 * cuántas le caben a ella, y restarle sus propias 5 le enseñaría menos de las
 * que de verdad puede llevarse.
 *
 * `quedan` puede salir negativo —se pidió más de lo que hay— y se devuelve tal
 * cual: cómo decirlo es cosa de quien lo pinta, y recortarlo a cero aquí
 * borraría justo el dato de cuánto no alcanza.
 *
 * @param {string} referencia
 * @param {string[]} calidades  las calidades a contar, en el orden en que se enseñan
 * @param {Map|object} stock    claveStock → { disponibles }
 * @param {Map|object} pedidos  claveStock → { pedido }
 * @param {{clave:string, cantidad:number}|null} [propia]
 * @returns {Array<{ calidad:string, clave:string, hay:number, pedido:number, quedan:number }>}
 */
export function quedanPorCalidad(referencia, calidades, stock, pedidos, propia = null) {
  const vistas = new Set();
  const salida = [];
  for (const calidad of lista(calidades)) {
    if (!normTxt(calidad)) continue;
    const clave = claveStock(referencia, calidad);
    // «Primera» y «PRIMERA» son la misma calidad: contarla dos veces pintaría
    // dos botones que hacen lo mismo y dos cifras que parecen distintas.
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const hay = entero(leerMapa(stock, clave)?.disponibles);
    const todo = entero(leerMapa(pedidos, clave)?.pedido);
    const suyo = propia && propia.clave === clave ? entero(propia.cantidad) : 0;
    const pedido = Math.max(0, todo - suyo);
    salida.push({ calidad: String(calidad), clave, hay, pedido, quedan: hay - pedido });
  }
  return salida;
}

/**
 * Lo que dice la lista de calidades al lado de cada una.
 *
 * Cuatro casos y ni uno más, con la gramática que ya usa el chip de la línea
 * («hay 10 · piden 20», «quedan 3»), para que la lista y el chip se lean como
 * la misma cuenta vista antes y después de escoger:
 *   · nada en bodega      → «sin existencias»
 *   · nadie más la pidió  → «hay 12»
 *   · cabe algo todavía   → «quedan 4 de 12»
 *   · ya se la pidieron   → «hay 8 · ya piden 11»
 * Sin la palabra FALTANTE: en esta fase todavía no le falta nada a nadie, sólo
 * hay menos mercancía que demanda.
 */
export function textoExistencia(q) {
  const hay = entero(q?.hay);
  const pedido = entero(q?.pedido);
  if (hay === 0) return 'sin existencias';
  if (pedido === 0) return `hay ${hay}`;
  if (pedido < hay) return `quedan ${hay - pedido} de ${hay}`;
  return `hay ${hay} · ya piden ${pedido}`;
}

/**
 * El desglose que acompaña a una referencia en su lista: «quedan: Primera 4 ·
 * Segunda 10 · Tercera 0». Sustituye al «· 30 disp» que sumaba calidades.
 *
 * Aquí sí se recorta a cero, y es a propósito: la frase dice cuántas QUEDAN sin
 * pedir, y de Tercera no queda ninguna. El «−3» vive en el panel de
 * existencias, que es una tabla con columnas de hay y piden al lado; en una
 * frase suelta un número negativo no se sabe de qué es.
 */
export function textoQuedanReferencia(filas) {
  const conPacas = lista(filas).filter((q) => entero(q?.hay) > 0);
  if (!conPacas.length) return 'sin existencias';
  return 'quedan: ' + conPacas.map((q) => `${q.calidad} ${entero(q.quedan)}`).join(' · ');
}

/**
 * El panel de existencias de la Fase 1: por referencia, cada calidad con lo que
 * hay, lo que se pide en la ronda y lo que queda, y quién lo pidió.
 *
 * Entra lo que tiene pacas Y lo que se pidió sin tener ninguna: el cliente que
 * pide lo que se voló es media razón de ser del módulo, y un panel que sólo
 * enseñara lo que hay escondería justo esa demanda.
 *
 * Sin totales por referencia, a propósito: sumar calidades es el error que este
 * panel viene a corregir.
 *
 * @param {Map|object} stock    claveStock → { referencia, calidad, disponibles }
 * @param {Map|object} pedidos  claveStock → { referencia, calidad, pedido, clientes: Map<id, cantidad> }
 * @param {Map|object} nombres  cliente_id (string) → nombre
 * @returns {Array<{ referencia:string, calidades: Array<{ clave, calidad, hay, piden, quedan,
 *                   clientes: Array<{ id:string, nombre:string, cantidad:number }> }> }>}
 */
export function resumenExistencias(stock, pedidos, nombres) {
  const porRef = new Map();
  const filaDe = (referencia, calidad) => {
    const kRef = normTxt(referencia);
    if (!kRef || !normTxt(calidad)) return null;
    const clave = claveStock(referencia, calidad);
    if (!porRef.has(kRef)) porRef.set(kRef, { referencia: String(referencia), calidades: new Map() });
    const grupo = porRef.get(kRef);
    if (!grupo.calidades.has(clave)) {
      grupo.calidades.set(clave, { clave, calidad: String(calidad), hay: 0, piden: 0, quedan: 0, clientes: [] });
    }
    return grupo.calidades.get(clave);
  };

  for (const [, s] of pares(stock)) {
    const f = filaDe(s?.referencia, s?.calidad);
    if (f) f.hay += entero(s?.disponibles);
  }
  for (const [, p] of pares(pedidos)) {
    const f = filaDe(p?.referencia, p?.calidad);
    if (!f) continue;
    f.piden += entero(p?.pedido);
    for (const [id, cantidad] of pares(p?.clientes)) {
      const n = entero(cantidad);
      if (n <= 0) continue;
      // Sin nombre se enseña el número de cliente, no un «Cliente» genérico:
      // dos genéricos seguidos no se pueden distinguir y el botón llevaría a
      // uno que no es.
      const nombre = leerMapa(nombres, String(id));
      f.clientes.push({ id: String(id), nombre: nombre ? String(nombre) : `cliente ${id}`, cantidad: n });
    }
  }

  const alfabetico = (a, b) => String(a).localeCompare(String(b), 'es');
  return [...porRef.values()]
    .map((g) => ({
      referencia: g.referencia,
      calidades: [...g.calidades.values()]
        .map((f) => ({
          ...f,
          quedan: f.hay - f.piden,
          // El que más pide primero: es a quien más le afecta que no alcance.
          clientes: f.clientes.sort((a, b) => b.cantidad - a.cantidad || alfabetico(a.nombre, b.nombre)),
        }))
        .sort((a, b) => alfabetico(a.calidad, b.calidad)),
    }))
    .sort((a, b) => alfabetico(a.referencia, b.referencia));
}

/**
 * Las calidades hermanas de una referencia, para la franja que las agrupa en la
 * Fase 2.
 *
 * La pregunta que contesta: «a tres clientes les falta Primera, ¿hay de otra
 * calidad sin repartir?». Mira las calidades de la ronda —con lo que ya se
 * repartió, que cambia mientras ella teclea— y también las que tienen pacas y
 * NADIE pidió, que es justo el caso que no se veía: esas no son un producto de
 * la Fase 2 y por tanto no tenían ni una fila.
 *
 * `libreOtras` suma sólo lo libre de las calidades que alcanzan. Lo que sobra
 * en la misma calidad que no alcanza no es «de otra calidad»: eso ya lo dice su
 * propio contador en ámbar.
 *
 * NO propone cambiar a nadie de calidad: cambiarla cambia el precio, y eso se
 * habla con el cliente. Sólo cuenta.
 *
 * @param {Array<{calidad, pedido, disponibles, repartido}>} enRonda
 * @param {Array<{calidad, disponibles}>} enBodega
 * @returns {{ calidades: Array<{ calidad, enRonda:boolean, pedido, disponibles, libre, falta }>,
 *             cortas: string[], libreOtras: number }}
 */
export function hermanasDeReferencia(enRonda, enBodega) {
  const m = new Map();
  for (const p of lista(enRonda)) {
    const k = normTxt(p?.calidad);
    if (!k || m.has(k)) continue;
    const pedido = entero(p?.pedido);
    const disponibles = entero(p?.disponibles);
    const repartido = entero(p?.repartido);
    m.set(k, {
      calidad: String(p.calidad),
      enRonda: true,
      pedido,
      disponibles,
      libre: Math.max(0, disponibles - repartido),
      falta: Math.max(0, pedido - disponibles),
    });
  }
  for (const s of lista(enBodega)) {
    const k = normTxt(s?.calidad);
    if (!k || m.has(k)) continue;
    const disponibles = entero(s?.disponibles);
    if (disponibles <= 0) continue;
    m.set(k, { calidad: String(s.calidad), enRonda: false, pedido: 0, disponibles, libre: disponibles, falta: 0 });
  }
  const calidades = [...m.values()].sort((a, b) => a.calidad.localeCompare(b.calidad, 'es'));
  return {
    calidades,
    cortas: calidades.filter((c) => c.falta > 0).map((c) => c.calidad),
    libreOtras: calidades.filter((c) => c.falta === 0).reduce((s, c) => s + c.libre, 0),
  };
}
