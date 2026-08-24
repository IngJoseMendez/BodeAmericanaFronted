import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { transportesApi } from '../../services/api';
import { useToast } from './Toast';

// Selector del catálogo de tipos de transporte, con creación en línea.
//
// Antes cada pantalla resolvía esto a su manera: en Cotizaciones era un campo de
// texto libre (lo que se escribía NO quedaba en el catálogo y volvía a faltar en
// la siguiente cotización) y en Separación masiva un <select> sin forma de
// agregar el que faltaba, así que había que irse a Despachos y se perdía lo que
// se estuviera capturando. Aquí se elige del catálogo y, si falta uno, se crea
// sin salir de la pantalla.

// Valor reservado de la opción "+ Crear uno nuevo…". Lleva guiones bajos al
// principio para que no pueda chocar con el nombre real de un transporte.
const OPCION_CREAR = '__crear_transporte__';

// Los nombres los teclea la gente y llegan con mayúsculas y acentos distintos
// ("Envia" contra "Envía"): comparar en crudo es justo lo que llenaría el
// catálogo de duplicados de la misma transportadora.
const normNombre = (s) => String(s ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

// Hasta hoy esto era texto libre y hay cotizaciones guardadas con valores tipo
// "recoge_cliente". Se muestran legibles, pero OJO: sólo se cambia la ETIQUETA,
// nunca el value de la opción, que tiene que seguir siendo el dato guardado.
const etiquetaLibre = (v) => String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Props:
 *  · id           id del <select>, para que el <label htmlFor> de la pantalla siga funcionando.
 *  · value        nombre del transporte elegido (texto, tal cual se guarda).
 *  · onChange     recibe el NOMBRE ya elegido (texto), no el evento.
 *  · transportes  catálogo ya cargado por la pantalla. Si no se pasa, se pide solo.
 *  · onCatalogo   se llama con la lista completa cuando aquí se crea uno nuevo,
 *                 para que la pantalla que ya tenía el catálogo lo mantenga al día.
 */
export function SelectorTransporte({
  id,
  value = '',
  onChange,
  transportes,
  onCatalogo,
  disabled = false,
  className = '',
  placeholder = 'Sin transporte…',
  'aria-label': ariaLabel,
  title,
}) {
  const { addToast } = useToast();
  const autoId = useId();
  const selectId = id || autoId;

  // Si quien lo usa ya tiene el catálogo cargado (Separación masiva lo pide
  // junto con clientes y precios) se reutiliza: pedirlo otra vez sería traer los
  // mismos datos dos veces, y en esa pantalla hay un selector en cada fila.
  const controlado = Array.isArray(transportes);

  const [propios, setPropios] = useState([]);
  const [creados, setCreados] = useState([]);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const campoRef = useRef(null);
  const selectRef = useRef(null);

  useEffect(() => {
    if (controlado) return undefined;
    let vivo = true;
    (async () => {
      try {
        const lista = await transportesApi.getAll();
        if (vivo) setPropios(Array.isArray(lista) ? lista : []);
      } catch {
        // Sin catálogo el selector queda corto, pero NO se rompe: el valor que
        // ya traía se sigue pintando como opción y no se pierde al guardar.
        if (vivo) setPropios([]);
      }
    })();
    return () => { vivo = false; };
  }, [controlado]);

  // El campo de creación se abre listo para escribir; si no, hay que ir a
  // buscarlo con el ratón después de haberlo pedido desde el propio selector.
  useEffect(() => {
    if (creando) campoRef.current?.focus();
  }, [creando]);

  const base = controlado ? transportes : propios;

  // Lo recién creado se guarda también aquí, para que siga apareciendo aunque la
  // pantalla no recoja `onCatalogo`.
  const catalogo = useMemo(() => {
    const vistos = new Set();
    const salida = [];
    for (const t of [...base, ...creados]) {
      const registro = t && typeof t === 'object' ? t : {};
      const nom = String(registro.nombre ?? '').trim();
      if (!nom) continue;
      const clave = normNombre(nom);
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      // Se conserva el registro entero tal cual llegó del servidor: esta misma
      // lista es la que se le devuelve a la pantalla por `onCatalogo`, y
      // recortarla a id y nombre le borraría campos que ella sí puede usar.
      salida.push(registro.nombre === nom ? registro : { ...registro, nombre: nom });
    }
    return salida;
  }, [base, creados]);

  const opciones = useMemo(() => {
    const salida = catalogo.map((t) => ({ value: t.nombre, label: t.nombre }));
    const actual = value == null ? '' : String(value);
    // INNEGOCIABLE: un <select> cuyo value no está entre sus <option> se pinta
    // VACÍO, y al guardar el formulario se llevaría por delante el transporte
    // que la cotización ya tenía. Como esto fue texto libre hasta hoy, hay
    // valores guardados que no están en el catálogo: se agregan como opción.
    // La comparación es exacta a propósito: al navegador le da igual que dos
    // textos "signifiquen lo mismo", si no coinciden letra por letra no casan.
    if (actual !== '' && !salida.some((o) => o.value === actual)) {
      salida.push({ value: actual, label: `${etiquetaLibre(actual)} (fuera del catálogo)` });
    }
    return salida;
  }, [catalogo, value]);

  const emitir = (v) => { if (onChange) onChange(v); };

  // Al cerrar el campito hay que devolver el foco al <select> a mano. El input
  // que lo tenía desaparece del DOM y el navegador manda el foco a <body>: en
  // Cotizaciones eso cae fuera de la trampa de foco del modal, así que el
  // siguiente Tab vuelve a empezar por el título del modal y quien navega con
  // teclado o lector de pantalla pierde el sitio en mitad del formulario.
  const cerrarCreacion = () => {
    setCreando(false);
    setNombre('');
    selectRef.current?.focus();
  };

  const alCambiar = (e) => {
    const v = e.target.value;
    if (v === OPCION_CREAR) {
      // El valor elegido no se toca: el <select> es controlado y vuelve a pintar
      // el que ya había en cuanto React repinta por este setCreando.
      setCreando(true);
      return;
    }
    emitir(v);
  };

  const crear = async () => {
    const limpio = nombre.trim();
    // `disabled` también cuenta aquí: en Separación masiva la fila se deshabilita
    // mientras se guarda la matriz, pero el campito ya abierto seguía aceptando
    // Enter y mandando el POST igual.
    if (!limpio || guardando || disabled) return;

    // Si ya existe uno que se llama igual (sin distinguir mayúsculas ni
    // acentos) se elige ese: dos "Envía" en la lista no le sirven a nadie.
    const yaEsta = catalogo.find((t) => normNombre(t.nombre) === normNombre(limpio));
    if (yaEsta) {
      emitir(yaEsta.nombre);
      cerrarCreacion();
      addToast(`"${yaEsta.nombre}" ya estaba en la lista`, 'info');
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await transportesApi.create({ nombre: limpio });
      // El servidor puede devolver el registro creado o no devolver nada: si no
      // lo devuelve se usa el nombre tecleado, para no dejar el selector vacío.
      const devuelto = respuesta && typeof respuesta === 'object' ? respuesta : {};
      const creado = String(devuelto.nombre ?? '').trim()
        ? { ...devuelto, nombre: String(devuelto.nombre).trim() }
        : { ...devuelto, nombre: limpio };

      setCreados((prev) => [...prev, creado]);
      // A la pantalla se le devuelve SU lista tal cual venía, con el nuevo al
      // final. Devolverle `catalogo` le colaba la deduplicación de aquí, que
      // ignora acentos y mayúsculas: si en el catálogo de verdad conviven
      // "Envia" y "Envía" —el CRUD de Despachos deja crear los dos— crear un
      // transporte desde una fila borraba uno de los dos del estado del padre y
      // desaparecía del desplegable de TODAS las demás filas hasta recargar.
      if (onCatalogo) onCatalogo([...base, creado]);
      emitir(creado.nombre);
      cerrarCreacion();
      addToast(`"${creado.nombre}" agregado`, 'success');
    } catch (err) {
      // Sin permiso o sin red no hay nada que elegir: se avisa y el campo se
      // queda abierto con lo escrito para reintentar. El transporte que ya tenía
      // el selector no se toca, así que no queda nada a medio camino.
      addToast(err?.message || 'No se pudo crear el transporte.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const alTeclear = (e) => {
    // Este selector vive DENTRO del <form> del modal de cotizaciones: sin el
    // preventDefault, Enter guardaría la cotización entera en vez de crear el
    // transporte. Por lo mismo los dos botones de abajo son type="button".
    //
    // El stopPropagation NO es adorno y va aparte del preventDefault: Modal.jsx
    // escucha Escape en `document`, y React 18 cuelga sus manejadores del nodo
    // raíz de la aplicación, que está DENTRO de document. Es decir, este
    // manejador corre primero y el del modal después. preventDefault sólo anula
    // la acción por defecto del navegador, no la propagación: sin cortarla aquí,
    // pulsar Escape para descartar el nombre del transporte cerraba el modal
    // entero de "Nueva cotización" y se perdía todo lo capturado.
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      crear();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarCreacion();
    }
  };

  return (
    <div className="min-w-0">
      <select
        ref={selectRef}
        id={selectId}
        value={value ?? ''}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        onChange={alCambiar}
        className={className}
      >
        <option value="">{placeholder}</option>
        {opciones.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value={OPCION_CREAR}>+ Crear uno nuevo…</option>
      </select>

      {creando && (
        <div className="mt-1 flex items-center gap-1">
          <input
            ref={campoRef}
            type="text"
            value={nombre}
            disabled={guardando || disabled}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Ej: Envía, Coordinadora…"
            aria-label="Nombre del transporte nuevo"
            autoComplete="off"
            className="min-w-0 flex-1 h-8 px-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={crear}
            disabled={guardando || disabled || !nombre.trim()}
            title="Guardar el transporte nuevo"
            className="h-8 w-8 flex items-center justify-center rounded-lg bg-secondary text-white disabled:opacity-40"
          >
            <Check size={14} aria-hidden="true" />
            <span className="sr-only">Guardar el transporte nuevo</span>
          </button>
          <button
            type="button"
            onClick={cerrarCreacion}
            disabled={guardando}
            title="Cancelar"
            className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted disabled:opacity-40"
          >
            <X size={14} aria-hidden="true" />
            <span className="sr-only">Cancelar la creación</span>
          </button>
        </div>
      )}
    </div>
  );
}
