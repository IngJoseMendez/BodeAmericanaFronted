// Descarga de archivos generados en el navegador.
//
// El patrón que había repetido en 24 sitios tenía dos defectos que hacían que
// el archivo llegara mal, y de forma intermitente —que es lo peor, porque unas
// veces funciona y otras no—:
//
//   const a = document.createElement('a');
//   a.href = URL.createObjectURL(blob);
//   a.download = 'Bodega.xlsx';
//   a.click();
//   URL.revokeObjectURL(a.href);   // ← todavía no ha empezado a bajar
//
// 1) El enlace nunca se añade al documento. Un <a> suelto en memoria no
//    siempre dispara la descarga: hay navegadores que ignoran el click, y
//    otros que lo atienden pero descartan el atributo `download`, así que el
//    archivo se guarda con el identificador del blob y SIN extensión. Ése es
//    el archivo que "no es un Excel": es el mismo Excel, pero Windows no sabe
//    con qué abrirlo porque perdió el .xlsx.
//
// 2) revokeObjectURL se llama en la línea siguiente al click. La descarga es
//    asíncrona: liberar la URL antes de que arranque la corta.
//
// Aquí el enlace se monta en el documento, se pulsa, se retira, y la URL se
// libera un minuto después, cuando ya no puede haber una descarga en curso.

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Descarga un Blob con el nombre indicado.
 * @param {Blob}   blob
 * @param {string} nombre  nombre completo, con extensión
 */
export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Un minuto es de sobra para cualquier archivo que genere esta aplicación y
  // no deja la memoria retenida indefinidamente.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Descarga un libro de Excel ya escrito a buffer.
 * Añade la extensión si no la trae, para que Windows sepa abrirlo.
 */
export function descargarExcel(buffer, nombre) {
  const archivo = /\.xlsx$/i.test(nombre) ? nombre : `${nombre}.xlsx`;
  descargarBlob(new Blob([buffer], { type: MIME_XLSX }), archivo);
}
