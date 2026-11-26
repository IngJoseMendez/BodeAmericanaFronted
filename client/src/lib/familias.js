// ── LA FAMILIA DE UNA REFERENCIA, DEDUCIDA DE SU NOMBRE ─────────────────────
//
// POR QUÉ SE DEDUCE Y NO SE LEE DE UNA TABLA. Existe `paca_familias`, y existe
// `paca_categorias.familia_id` para asignarla a mano. En producción hay UNA
// familia creada y UNA referencia asignada, de 112. Las otras 111 no tienen
// ninguna. Una vista que agrupara por ese campo saldría con un solo grupo y un
// montón de «sin familia», que es exactamente la nada.
//
// Y no hace falta, porque el nombre ya lo dice: las referencias de esta bodega
// se escriben empezando por la prenda y luego la variación —«blusa», «blusa
// camiseta», «blusa falda», «blusa jeans», «blusa pantalón», «blusa short»,
// «blusa vestido»—. La primera palabra ES la familia. Medido sobre las 112 del
// catálogo: polo 12, pantalón 11, mixta 10, blusa 7, buzo 7, chaqueta 7,
// falda 6, deportivo 3…
//
// El día que las familias se asignen a mano, esto se puede cambiar por una
// lectura de `familia_id` sin tocar la vista: la vista sólo llama a
// `construirFamilias`.
//
// ── LAS TRES TRAMPAS QUE LA MEDICIÓN DESTAPÓ ────────────────────────────────
//
// 1. EL SINGULAR Y EL PLURAL SON LA MISMA FAMILIA. En el catálogo están
//    «abrigo» y «abrigos», y «falda» y «faldas largas»: partir eso en cuatro
//    grupos es la mitad del valor de la vista.
//
//    Pero NO se depluraliza a ciegas. Quitarle la «s» a todo convierte «jeans»
//    en «jean» —una familia que nadie llama así— y «pantalones» en
//    «pantalone», que no es «pantalón». Así que se juntan sólo cuando las DOS
//    formas están de verdad en los datos: «abrigos» cae en «abrigo» porque
//    «abrigo» existe; «jeans» se queda «jeans» porque «jean» no existe. La
//    regla la deciden los datos, no una gramática inventada.
//
// 2. LA PRIMERA PALABRA NO SIEMPRE ACABA EN UN ESPACIO. Están
//    «buzo/joggers» y «falda/blusa/vestido»: cortando sólo por espacios serían
//    familias propias de una sola referencia, al lado de los 7 «buzo» y los 6
//    «falda» a los que pertenecen. Se corta por lo primero que no sea letra o
//    número.
//
// 3. LAS REFERENCIAS VIENEN EN CAJAS DISTINTAS. En `pacas` conviven «buzo con
//    capota» y «BUZO CON CAPOTA CON ZIPPER», y «SHORT MIXTO» con «short
//    mixto». Todo se compara en minúsculas y sin tildes.
//
// La ETIQUETA que se lee es la forma que más veces aparece en los datos, no la
// clave: la clave de «jeans» es «jean», pero en pantalla dice «jeans», porque
// es como se llama.

/** Minúsculas, sin tildes y sin espacios de sobra. */
export const normalizar = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

/**
 * La primera palabra de una referencia: lo que va antes del primer carácter que
 * no es letra ni número. Devuelve '' si no hay nada que leer, que es la
 * respuesta correcta cuando la referencia viene vacía.
 */
export function primeraPalabra(referencia) {
  const limpio = normalizar(referencia);
  if (!limpio) return '';
  const m = limpio.match(/^[a-z0-9]+/);
  return m ? m[0] : '';
}

/**
 * Agrupa una lista de referencias en familias.
 *
 * `referencias` es cualquier arreglo de cadenas; se pueden repetir, y repetirse
 * CUENTA: la etiqueta de cada familia es la forma más frecuente, así que pasar
 * la referencia de cada fila (y no la lista de referencias distintas) hace que
 * gane la que de verdad se usa más.
 *
 * Devuelve:
 *   · `claveDe(referencia)`   → la clave de su familia ('' si no se sabe)
 *   · `etiquetaDe(clave)`     → cómo se escribe en pantalla
 *   · `familias`             → [{ clave, etiqueta, referencias: [...] }]
 */
export function construirFamilias(referencias) {
  const lista = Array.isArray(referencias) ? referencias : [];

  // 1) Cuántas veces aparece cada primera palabra, y con qué referencias.
  const vistas = new Map(); // palabra -> { veces, referencias:Set }
  for (const ref of lista) {
    const palabra = primeraPalabra(ref);
    if (!palabra) continue;
    let fila = vistas.get(palabra);
    if (!fila) { fila = { veces: 0, referencias: new Set() }; vistas.set(palabra, fila); }
    fila.veces += 1;
    fila.referencias.add(normalizar(ref));
  }

  // 2) Canonizar plurales CONTRA LOS DATOS. «abrigos» cae en «abrigo» sólo si
  //    «abrigo» también está; «jeans» se queda como está porque «jean» no.
  //    Se prueba primero «-es» y luego «-s»: en español el plural de «pantalón»
  //    es «pantalones», y quitarle sólo la «s» daría «pantalone».
  const canonica = (palabra) => {
    for (const sufijo of ['es', 's']) {
      if (palabra.length > sufijo.length + 2 && palabra.endsWith(sufijo)) {
        const corta = palabra.slice(0, -sufijo.length);
        if (vistas.has(corta)) return corta;
      }
    }
    return palabra;
  };

  // 3) Juntar por clave y elegir la etiqueta más frecuente.
  const porClave = new Map();
  for (const [palabra, fila] of vistas) {
    const clave = canonica(palabra);
    let grupo = porClave.get(clave);
    if (!grupo) { grupo = { clave, formas: new Map(), referencias: new Set() }; porClave.set(clave, grupo); }
    grupo.formas.set(palabra, (grupo.formas.get(palabra) || 0) + fila.veces);
    for (const r of fila.referencias) grupo.referencias.add(r);
  }

  const familias = [...porClave.values()].map((g) => {
    // La forma más usada. A igualdad, la más corta —«abrigo» antes que
    // «abrigos»—, y a igualdad de las dos, alfabética: sin un tercer criterio
    // la etiqueta podría cambiar entre dos cargas de la misma pantalla.
    const etiqueta = [...g.formas.entries()].sort((a, b) =>
      b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0], 'es')
    )[0][0];
    return {
      clave: g.clave,
      etiqueta,
      referencias: [...g.referencias].sort((a, b) => a.localeCompare(b, 'es')),
    };
  }).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const etiquetas = new Map(familias.map((f) => [f.clave, f.etiqueta]));

  return {
    familias,
    claveDe: (referencia) => {
      const palabra = primeraPalabra(referencia);
      return palabra ? canonica(palabra) : '';
    },
    etiquetaDe: (clave) => etiquetas.get(clave) || clave || '',
  };
}
