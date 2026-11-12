// ── LOS TIPOS DE SERVICIO, EDITABLES DESDE DONDE SE USAN ───────────
//
// Los seis tipos —transporte, aduana, cargue, descargue, almacenaje, otro—
// estaban escritos a mano en Contenedores.jsx, y el desplegable que los enseña
// no deja inventar valores a propósito, así que para añadir uno había que tocar
// el código y volver a desplegar.
//
// Va AQUÍ, junto al desplegable, y no en una pantalla de ajustes aparte, por lo
// mismo que los catálogos de abono fueron a Cuentas: dos sitios donde mantener
// la misma lista son dos listas que algún día dejarán de coincidir.
//
// DOS COSAS QUE DICE EN VOZ ALTA, porque son la clase de detalle que sorprende
// después:
//   · Quitar un tipo NO toca los servicios ya guardados. Es una baja blanda:
//     `contenedor_servicios.tipo_servicio` guarda el TEXTO, no un id, igual que
//     un despacho guarda el nombre de su transportadora. Lo único que pasa es
//     que deja de ofrecerse al crear uno nuevo.
//   · Renombrar tampoco los renombra. El servidor devuelve cuántos servicios
//     conservan el nombre viejo y aquí se dice.
import { useEffect, useState } from 'react';
import { Plus, Pencil, X, Check, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { Button, Input, useToast } from './common';
import { tiposServicioApi } from '../services/api';
import { mensajeDeError } from '../lib/errores';

export function GestorTiposServicio({ abierto, onCerrar, onCambio }) {
  const { addToast } = useToast();
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState(null);   // { id, nombre }
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      // `todos` incluye los quitados: sin ellos no habría forma de volver a
      // activar uno desde aquí, y la pantalla de Cuentas ya tuvo ese hueco.
      setTipos(await tiposServicioApi.getAll({ todos: true }));
    } catch (err) {
      addToast(mensajeDeError(err, 'leer los tipos de servicio'), 'error');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { if (abierto) cargar(); /* eslint-disable-next-line */ }, [abierto]);

  if (!abierto) return null;

  const tras = (mensaje) => {
    addToast(mensaje, 'success');
    cargar();
    onCambio?.();
  };

  const agregar = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    setGuardando(true);
    try {
      const r = await tiposServicioApi.create({ nombre });
      setNuevo('');
      tras(r.activo === true && r.id
        ? `«${r.nombre}» queda en la lista`
        : `«${nombre}» agregado`);
    } catch (err) {
      addToast(mensajeDeError(err, 'agregar el tipo de servicio'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const renombrar = async () => {
    const nombre = (editando?.nombre || '').trim();
    if (!nombre) return;
    setGuardando(true);
    try {
      const r = await tiposServicioApi.update(editando.id, { nombre });
      setEditando(null);
      const n = r.historicos_con_nombre_viejo || 0;
      tras(n
        ? `Ahora se llama «${r.nombre}». Ojo: ${n} servicio(s) ya guardados conservan el nombre anterior.`
        : `Ahora se llama «${r.nombre}»`);
    } catch (err) {
      addToast(mensajeDeError(err, 'renombrar el tipo de servicio'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (t) => {
    setGuardando(true);
    try {
      const r = await tiposServicioApi.remove(t.id);
      const n = r.servicios_que_lo_usan || 0;
      tras(n
        ? `«${t.nombre}» ya no se ofrece. Los ${n} servicio(s) que lo usan se quedan como están.`
        : `«${t.nombre}» quitado de la lista`);
    } catch (err) {
      addToast(mensajeDeError(err, 'quitar el tipo de servicio'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  const reactivar = async (t) => {
    setGuardando(true);
    try {
      await tiposServicioApi.update(t.id, { activo: true });
      tras(`«${t.nombre}» vuelve a la lista`);
    } catch (err) {
      addToast(mensajeDeError(err, 'volver a activar el tipo de servicio'), 'error');
    } finally {
      setGuardando(false);
    }
  };

  // Los quitados al final, como en Cuentas: la lista se lee de arriba abajo y
  // lo que no se usa no debe estorbar a lo que sí.
  const ordenados = [...tipos].sort((a, b) => {
    if (Boolean(a.activo) !== Boolean(b.activo)) return a.activo ? -1 : 1;
    return String(a.nombre).localeCompare(String(b.nombre), 'es');
  });
  const quitados = ordenados.filter((t) => !t.activo).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
         role="dialog" aria-modal="true" aria-labelledby="gts-titulo">
      <div className="w-full max-w-lg rounded-2xl bg-surface border border-border shadow-xl
                      max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h2 id="gts-titulo" className="font-display font-bold text-primary">Tipos de servicio</h2>
            <p className="text-[11px] text-muted mt-0.5">
              Los que se ofrecen al registrar un servicio del contenedor
            </p>
          </div>
          <Button variant="ghost" size="icono" icon={X} onClick={onCerrar} aria-label="Cerrar" />
        </div>

        <div className="px-5 py-3 border-b border-border flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <Input
              id="gts-nuevo"
              label="Agregar uno"
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
              placeholder="Ej: bodegaje, seguro, inspección…"
            />
          </div>
          <Button onClick={agregar} icon={Plus} disabled={!nuevo.trim() || guardando}>
            Agregar
          </Button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-border/40">
          {cargando && (
            <p className="px-5 py-6 text-center text-sm text-muted">
              <Loader2 size={16} className="inline animate-spin mr-2" />Cargando…
            </p>
          )}
          {!cargando && ordenados.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-muted">Todavía no hay ningún tipo.</p>
          )}
          {ordenados.map((t) => (
            <div key={t.id} className="px-5 py-2.5 flex items-center gap-2">
              {editando?.id === t.id ? (
                <>
                  <div className="flex-1 min-w-0">
                    <Input
                      value={editando.nombre}
                      onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); renombrar(); }
                        if (e.key === 'Escape') setEditando(null);
                      }}
                      autoFocus
                      aria-label={`Nuevo nombre para ${t.nombre}`}
                    />
                  </div>
                  <Button variant="ghost" size="icono" icon={Check} onClick={renombrar}
                          disabled={guardando} aria-label="Guardar el nombre" />
                  <Button variant="ghost" size="icono" icon={X} onClick={() => setEditando(null)}
                          aria-label="Cancelar" />
                </>
              ) : (
                <>
                  <span className={`flex-1 min-w-0 text-sm truncate ${t.activo ? 'text-primary' : 'text-muted'}`}>
                    {t.nombre}
                    {!t.activo && (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted/15 align-middle">
                        quitado
                      </span>
                    )}
                  </span>
                  <Button variant="ghost" size="icono" icon={Pencil} disabled={guardando}
                          onClick={() => setEditando({ id: t.id, nombre: t.nombre })}
                          aria-label={`Renombrar ${t.nombre}`} />
                  {t.activo ? (
                    <Button variant="ghost" size="icono" icon={Trash2} disabled={guardando}
                            onClick={() => quitar(t)}
                            aria-label={`Quitar ${t.nombre} de la lista`} />
                  ) : (
                    <Button variant="ghost" size="icono" icon={RotateCcw} disabled={guardando}
                            onClick={() => reactivar(t)}
                            aria-label={`Volver a poner ${t.nombre} en la lista`} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border">
          <p className="text-[11px] text-muted">
            Quitar un tipo <b>no cambia los servicios ya guardados</b>: sólo deja de ofrecerse
            al registrar uno nuevo. Renombrarlo tampoco los renombra.
            {quitados > 0 && ` Hay ${quitados} quitado${quitados === 1 ? '' : 's'} al final de la lista.`}
          </p>
        </div>
      </div>
    </div>
  );
}
