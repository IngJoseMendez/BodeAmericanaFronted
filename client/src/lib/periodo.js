// ── EL PERIODO DE UN REPORTE, EN LA URL ───────────────────────────
//
// `mes` en null significa EL AÑO ENTERO. Esa es la única regla que hay que
// tener en la cabeza para leer este archivo.
//
// POR QUÉ `mes=todo` Y NO DEJAR EL PARÁMETRO FUERA. Si el año entero se
// escribiera como `?anio=2026` a secas, ese enlace sería ambiguo: no se sabría
// si pide el año completo o septiembre de 2026, y la pantalla tendría que
// adivinar. Con `mes=todo` escrito, lo que dice la URL es lo que se mira, y la
// ida y vuelta (escribir y volver a leer) devuelve siempre el mismo periodo —
// que es justo lo que comprueba la prueba de este archivo.
//
// Y POR QUÉ UN MES IMPOSIBLE NO REVIENTA. La URL la puede escribir una persona
// a mano, o puede venir de un enlace viejo. `?mes=19` o `?mes=abril` no pueden
// dejar la pantalla en blanco ni pedirle al servidor un mes que no existe: se
// cae en el mes de hoy, que siempre es un periodo válido. No se inventa un dato
// ni se finge que el 19 era otra cosa: se usa un periodo que la persona puede
// ver y cambiar.

/** El mes de hoy, que es el periodo por defecto de toda la vida. */
export function periodoDeHoy(ahora = new Date()) {
  return { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 };
}

/**
 * Lee el periodo de los parámetros de la URL.
 * @param params  un URLSearchParams (o cualquier cosa con .get)
 * @param ahora   inyectable para poder probarlo sin depender del día
 */
export function leerPeriodoDeUrl(params, ahora = new Date()) {
  const hoy = periodoDeHoy(ahora);
  const anioCrudo = params?.get ? params.get('anio') : null;
  const mesCrudo = params?.get ? params.get('mes') : null;

  // Sin nada en la URL: el mes de hoy, como hacía la pantalla desde siempre.
  if (anioCrudo === null && mesCrudo === null) return hoy;

  const anio = Number(anioCrudo) || hoy.anio;
  if (mesCrudo === 'todo') return { anio, mes: null };

  const mes = Number(mesCrudo);
  return { anio, mes: mes >= 1 && mes <= 12 ? mes : hoy.mes };
}

/** Cómo se escribe un periodo en la URL. Lo inverso de leerPeriodoDeUrl. */
export function periodoAParams(periodo) {
  return {
    anio: String(periodo.anio),
    mes: periodo.mes == null ? 'todo' : String(periodo.mes),
  };
}

/**
 * Mueve el periodo `paso` meses (o años, si se está mirando el año entero).
 * Cruza el cambio de año sin que haya que pensarlo.
 */
export function moverPeriodo(periodo, paso) {
  if (periodo.mes == null) return { anio: periodo.anio + paso, mes: null };
  const total = (periodo.anio * 12) + (periodo.mes - 1) + paso;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}
