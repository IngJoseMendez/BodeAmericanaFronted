// Reproduccion del error que llego a produccion en Ventas.jsx: `totalVenta` se
// calcula en el render y lee `gruposElegidos`, declarado mas abajo. Este archivo
// NO se importa en ninguna parte: existe para que la comprobacion de orden de
// render tenga algo con lo que demostrar que salta.
import { useMemo, useState } from 'react';

export default function PantallaRota() {
  const [grupoSel, setGrupoSel] = useState({});
  const productos = useMemo(() => [], []);

  // ESTO REVIENTA: se evalua ahora y lee un const de 6 lineas mas abajo.
  const totalVenta = gruposElegidos.reduce((s, g) => s + g.cantidad, 0);

  const gruposElegidos = useMemo(
    () => productos.filter((g) => grupoSel[g.clave]),
    [productos, grupoSel],
  );

  return { totalVenta, setGrupoSel };
}
