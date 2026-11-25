import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm, BuscadorLista } from '../components/common';
import { tiposPacaApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { Plus, Trash2, Tag, Layers, Star, Sun, Pencil, Check, X, Boxes, Search } from 'lucide-react';


import { mensajeDeError } from '../lib/errores';
// ─────────────────────────────────────────────────────────────────────────────
// Panel y PanelItem viven FUERA del componente a propósito.
//
// Estaban declarados dentro, y eso los volvía un componente NUEVO en cada
// render: React no los reconocía como el mismo tipo, así que desmontaba el
// panel entero y lo volvía a montar. El efecto visible era que al escribir el
// nombre de una familia se perdía el foco tras la primera letra y parecía que
// la página se recargaba sola.
//
// Como ya no pueden leer el estado por cierre, reciben por props lo que
// necesitan; `edicion` agrupa el estado y los manejadores de editar en línea.
// ─────────────────────────────────────────────────────────────────────────────

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Editar y Eliminar estaban en opacity-0 hasta el hover: en celular y tablet,
// donde no hay puntero, quedaban invisibles y no había forma de llegar a
// ellos; y navegando con Tab el foco caía en un botón que no se veía.
// Ahora solo se ocultan donde SÍ hay hover real, y reaparecen al enfocarlos.
// El color base pasó de text-border (#e2e8f0, casi blanco sobre blanco) a
// text-muted, que sí se distingue.
const BTN_ACCION =
  'p-1.5 rounded-lg text-muted transition-[color,background-color,border-color,box-shadow,opacity,transform] [@media(hover:hover)]:opacity-0 ' +
  'group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-secondary/40';

function PanelItem({ item, table, onDelete, edicion, temporadas, familias }) {
  const { editando, setEditando, saveEdit, cancelEdit, startEdit, guardandoEdit } = edicion;
  const isEditing = editando && editando.id === item.id && editando.table === table;
  return (
    <li className="flex items-center justify-between px-4 py-3 hover:bg-primary/3 transition-colors group">
      <div className="flex-1 min-w-0 mr-2">
        {isEditing ? (
          <div className="space-y-1.5">
            <input
              className="w-full border border-secondary/60 rounded-lg px-2.5 py-1.5 text-sm text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              value={editando.nombre}
              onChange={e => setEditando(prev => ({ ...prev, nombre: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
              autoFocus
            />
            {table === 'categorias' && (
              <BuscadorLista
                value={editando.temporada_id || ''}
                onChange={(valorElegido) => setEditando(prev => ({ ...prev, temporada_id: valorElegido }))}
                opcionVacia="Sin categoría"
                placeholder="Sin categoría"
                opciones={[
                  ...temporadas.map((t) => ({ value: t.id, label: capitalize(t.nombre) })),
                ]}
                className="w-full border border-secondary/60 rounded-lg px-2.5 py-1.5 text-sm text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            )}
            {/* La familia agrupa referencias parecidas: "Chaqueta deportiva" y
                "Chaqueta mixta" bajo "Chaquetas". */}
            {table === 'categorias' && (
              <BuscadorLista
                value={editando.familia_id || ''}
                onChange={(valorElegido) => setEditando(prev => ({ ...prev, familia_id: valorElegido }))}
                opcionVacia="Sin familia"
                placeholder="Sin familia"
                opciones={[
                  ...familias.map((fa) => ({ value: fa.id, label: capitalize(fa.nombre) })),
                ]}
                className="w-full border border-secondary/60 rounded-lg px-2.5 py-1.5 text-sm text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            )}
          </div>
        ) : (
          <div className="min-w-0">
            <p className="font-medium text-sm text-primary">{capitalize(item.nombre)}</p>
            {item.temporada_nombre && (
              <span className="text-xs bg-secondary/10 text-secondary px-1.5 py-0.5 rounded font-medium">{capitalize(item.temporada_nombre)}</span>
            )}
            {item.familia_nombre && (
              <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">{capitalize(item.familia_nombre)}</span>
            )}
            {item.descripcion && <p className="text-xs text-muted truncate mt-0.5">{item.descripcion}</p>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {isEditing ? (
          <>
            <button
              onClick={saveEdit}
              disabled={guardandoEdit}
              className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center rounded-lg text-secondary hover:bg-secondary/10 transition-[color,background-color,border-color,box-shadow,opacity,transform] disabled:opacity-50"
              title="Guardar" aria-label="Guardar"
            >
              <Check size={14} />
            </button>
            <button
              onClick={cancelEdit}
              className="p-2.5 inline-flex min-w-11 min-h-11 items-center justify-center rounded-lg text-muted hover:bg-primary/5 transition-[color,background-color,border-color,box-shadow,opacity,transform]"
              title="Cancelar" aria-label="Cancelar"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => startEdit(table, item)}
              className={`${BTN_ACCION} hover:text-secondary hover:bg-secondary/10`}
              title="Editar"
              aria-label={`Editar ${item.nombre}`}
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => onDelete(item)}
              className={`${BTN_ACCION} hover:text-error hover:bg-error/10`}
              title="Eliminar"
              aria-label={`Eliminar ${item.nombre}`}
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ── EL PANEL DE CADA CATÁLOGO ──────────────────────────────────────────────
//
// Eran listas sin tope: las 74 referencias se iban hacia abajo hasta donde
// hiciera falta, así que para llegar al panel de al lado había que bajar media
// pantalla, y encontrar una referencia concreta era leer 74 nombres de arriba
// abajo. En tableta, que es donde se usa, peor.
//
// Tres cosas, y van DENTRO de este componente porque los cuatro paneles son el
// mismo: buscador, la lista con SU PROPIO scroll —así la página mide lo mismo
// con 4 registros que con 400— y un pie que dice cuántas se están viendo.
function Panel({ title, icon: Icon, count, error, form, loading, items, table, onDelete, onCreate,
                 formState, setFormState, submitting, placeholder, extraFormContent, extraFormContent2,
                 edicion, temporadas, familias }) {
  const [busqueda, setBusqueda] = useState('');
  // «Sin categoría» no es un filtro de adorno: una referencia sin temporada no
  // tiene precio que buscar —el precio se decide por temporada + calidad—, así
  // que son exactamente las que hay que ir a arreglar. Sólo en el panel que
  // tiene temporada.
  const [soloSinTemporada, setSoloSinTemporada] = useState(false);
  const esDeReferencias = table === 'categorias';

  const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();

  const visibles = useMemo(() => {
    let fuera = items || [];
    if (esDeReferencias && soloSinTemporada) fuera = fuera.filter((i) => !i.temporada_nombre);
    const q = norm(busqueda);
    if (!q) return fuera;
    // Palabra por palabra: «mixta inv» encuentra «mixta invierno».
    const palabras = q.split(/\s+/).filter(Boolean);
    return fuera.filter((i) => {
      const heno = norm([i.nombre, i.temporada_nombre, i.familia_nombre, i.descripcion].join(' '));
      return palabras.every((w) => heno.includes(w));
    });
  }, [items, busqueda, soloSinTemporada, esDeReferencias]);

  const sinTemporada = useMemo(
    () => (esDeReferencias ? (items || []).filter((i) => !i.temporada_nombre).length : 0),
    [items, esDeReferencias]
  );
  const filtrado = !!busqueda || soloSinTemporada;

  return (
  <section className="space-y-4">
    <div className="flex items-center gap-2">
      <div className="p-2 bg-primary/5 rounded-xl"><Icon className="w-5 h-5 text-primary" /></div>
      <div>
        <h2 className="font-display text-lg font-semibold text-primary">{title}</h2>
        <p className="text-xs text-muted">{count} registradas</p>
      </div>
    </div>
    <Card>
      <CardBody className="p-4">
        <p className="text-sm font-medium text-primary mb-3 flex items-center gap-1.5"><Plus size={15} /> Nueva {title.slice(0,-1).toLowerCase()}</p>
        {error && <div className="mb-3 px-3 py-2 bg-error/10 text-error text-xs rounded-lg">{error}</div>}
        <form onSubmit={onCreate} className="space-y-3">
          <Input placeholder={placeholder} value={formState.nombre} onChange={e => setFormState({ ...formState, nombre: e.target.value })} />
          <Input placeholder="Descripción (opcional)" value={formState.descripcion} onChange={e => setFormState({ ...formState, descripcion: e.target.value })} />
          {extraFormContent}
          {extraFormContent2}
          <Button type="submit" variant="secondary" className="w-full" loading={submitting}>Agregar</Button>
        </form>
      </CardBody>
    </Card>
    <Card padding={false}>
      {/* El buscador aparece con más de 8 registros: sobre cuatro líneas es un
          campo que estorba. Va pegado a la lista, dentro de la tarjeta, para
          que se vea que filtra ESTA lista y no las cuatro. */}
      {!loading && items.length > 8 && (
        <div className="p-3 border-b border-border/50 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar entre ${items.length} ${title.toLowerCase()}…`}
              aria-label={`Buscar entre las ${title.toLowerCase()}`}
              className="w-full pl-9 pr-9 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')}
                title="Limpiar la búsqueda" aria-label="Limpiar la búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-colors">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
          {/* Sin temporada no hay precio de catálogo que buscar, así que estas
              son las que de verdad hay que ir a completar. Sólo se ofrece si
              hay alguna: un filtro que siempre da cero no sirve de nada. */}
          {esDeReferencias && sinTemporada > 0 && (
            <Button
              variant={soloSinTemporada ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSoloSinTemporada((v) => !v)}
              title="Una referencia sin categoría no tiene precio que buscar: el precio se define por categoría y calidad"
            >
              {soloSinTemporada ? '✓ ' : ''}Sin categoría ({sinTemporada})
            </Button>
          )}
        </div>
      )}
      {loading ? <div className="p-6 text-center text-muted text-sm">Cargando...</div>
        : items.length === 0 ? <div className="p-6 text-center text-muted text-sm">Sin registros</div>
        : visibles.length === 0 ? (
          /* Sin esto la tarjeta se queda en blanco, que se lee como «se
             perdieron los registros» en vez de «el filtro no encontró nada». */
          <div className="p-6 text-center text-sm">
            <p className="text-muted">
              {soloSinTemporada && !busqueda
                ? 'Todas tienen categoría.'
                : <>Nada coincide con «<b className="text-primary">{busqueda}</b>».</>}
            </p>
            <Button variant="ghost" size="sm" className="mt-2"
              onClick={() => { setBusqueda(''); setSoloSinTemporada(false); }}>
              Quitar el filtro
            </Button>
          </div>
        ) : (
          /* LA LISTA TIENE TECHO Y SU PROPIO SCROLL. Es el arreglo de que las
             referencias se fueran hacia abajo sin fin: la página mide lo mismo
             con 4 registros que con 400, y los cuatro paneles se ven a la vez.
             El alto va en `vh` para que en tableta apaisada no se coma la
             pantalla y en escritorio aproveche la que hay. */
          <ul className="divide-y divide-border/50 max-h-[55vh] overflow-y-auto overscroll-contain">
            {visibles.map(item => <PanelItem key={item.id} item={item} table={table} onDelete={onDelete}
                          edicion={edicion} temporadas={temporadas} familias={familias} />)}
          </ul>
        )}
      {/* Cuántas se ven de cuántas hay. Una lista filtrada sin este pie se lee
          como la lista completa. */}
      {!loading && items.length > 0 && visibles.length > 0 && filtrado && (
        <p className="px-4 py-2.5 border-t border-border/50 text-xs text-muted">
          {visibles.length} de {items.length}
        </p>
      )}
    </Card>
  </section>
);
}

export default function TiposPaca() {
  const [tipos, setTipos]           = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades, setCalidades]   = useState([]);
  const [temporadas, setTemporadas] = useState([]);
  const [familias, setFamilias]     = useState([]);
  const [loadingFams, setLoadingFams]     = useState(true);
  const [nuevaFamilia, setNuevaFamilia]   = useState({ nombre: '', descripcion: '' });
  const [guardandoFam, setGuardandoFam]   = useState(false);

  const [loadingTipos, setLoadingTipos]   = useState(true);
  const [loadingCats, setLoadingCats]     = useState(true);
  const [loadingCals, setLoadingCals]     = useState(true);
  const [loadingTemps, setLoadingTemps]   = useState(true);

  const [nuevoTipo,      setNuevoTipo]      = useState({ nombre: '', descripcion: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', descripcion: '', temporada_id: '', familia_id: '' });
  const [nuevaCalidad,   setNuevaCalidad]   = useState({ nombre: '', descripcion: '' });
  const [nuevaTemporada, setNuevaTemporada] = useState({ nombre: '', descripcion: '' });

  const [errorTipo, setErrorTipo] = useState('');
  const [errorCat,  setErrorCat]  = useState('');
  const [errorCal,  setErrorCal]  = useState('');
  const [errorTemp, setErrorTemp] = useState('');

  const [guardandoTipo, setGuardandoTipo]   = useState(false);
  const [guardandoCat,  setGuardandoCat]    = useState(false);
  const [guardandoCal,  setGuardandoCal]    = useState(false);
  const [guardandoTemp, setGuardandoTemp]   = useState(false);

  // { table: 'tipos'|'categorias'|'calidades'|'temporadas', id, nombre }
  const [editando, setEditando] = useState(null);
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();
  const { reload: reloadCatalog } = useCatalog();

  useEffect(() => {
    loadTipos(); loadCategorias(); loadCalidades(); loadTemporadas(); loadFamilias();
  }, []);

  const loadTipos = async () => {
    setLoadingTipos(true);
    try { setTipos(await tiposPacaApi.getTipos()); }
    catch (err) { addToast(mensajeDeError(err), 'error'); }
    finally { setLoadingTipos(false); }
  };
  const loadCategorias = async () => {
    setLoadingCats(true);
    try { setCategorias(await tiposPacaApi.getCategorias()); }
    catch (err) { addToast(mensajeDeError(err), 'error'); }
    finally { setLoadingCats(false); }
  };
  const loadCalidades = async () => {
    setLoadingCals(true);
    try { setCalidades(await tiposPacaApi.getCalidades()); }
    catch (err) { addToast(mensajeDeError(err), 'error'); }
    finally { setLoadingCals(false); }
  };
  const loadTemporadas = async () => {
    setLoadingTemps(true);
    try { setTemporadas(await tiposPacaApi.getTemporadas()); }
    catch (err) { addToast(mensajeDeError(err), 'error'); }
    finally { setLoadingTemps(false); }
  };

  // Familias: agrupan referencias parecidas ("Chaqueta deportiva" y
  // "Chaqueta mixta" bajo "Chaquetas") sin reemplazar a la referencia.
  const loadFamilias = async () => {
    setLoadingFams(true);
    try { setFamilias(await tiposPacaApi.getFamilias()); }
    catch (err) { addToast(mensajeDeError(err), 'error'); }
    finally { setLoadingFams(false); }
  };

  const handleCrearFamilia = async (e) => {
    e.preventDefault();
    if (!nuevaFamilia.nombre.trim()) return;
    try {
      setGuardandoFam(true);
      await tiposPacaApi.createFamilia(nuevaFamilia);
      addToast('Familia "' + nuevaFamilia.nombre + '" creada', 'success');
      setNuevaFamilia({ nombre: '', descripcion: '' });
      loadFamilias();
      reloadCatalog();
    } catch (err) { addToast(mensajeDeError(err), 'error'); }
    finally { setGuardandoFam(false); }
  };

  const handleEliminarFamilia = async (fam) => {
    const ok = await confirm({
      title: '¿Eliminar la familia "' + fam.nombre + '"?',
      message: fam.referencias > 0
        ? 'Sus ' + fam.referencias + ' referencia(s) quedarán sin familia, pero no se borran.'
        : 'No tiene referencias asociadas.',
      confirmText: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteFamilia(fam.id);
      addToast('Familia eliminada', 'success');
      loadFamilias();
      loadCategorias();
      reloadCatalog();
    } catch (err) { addToast(mensajeDeError(err), 'error'); }
  };

  const handleCrearTipo = async (e) => {
    e.preventDefault(); setErrorTipo('');
    if (!nuevoTipo.nombre.trim()) { setErrorTipo('El nombre es requerido'); return; }
    setGuardandoTipo(true);
    try {
      const created = await tiposPacaApi.createTipo(nuevoTipo);
      setTipos(prev => [...prev, created]);
      setNuevoTipo({ nombre: '', descripcion: '' });
      addToast(`Clasificación "${created.nombre}" creada`, 'success');
      reloadCatalog();
    } catch (err) { setErrorTipo(err.message); }
    finally { setGuardandoTipo(false); }
  };
  const handleCrearCategoria = async (e) => {
    e.preventDefault(); setErrorCat('');
    if (!nuevaCategoria.nombre.trim()) { setErrorCat('El nombre es requerido'); return; }
    setGuardandoCat(true);
    try {
      const created = await tiposPacaApi.createCategoria(nuevaCategoria);
      setCategorias(prev => [...prev, created]);
      setNuevaCategoria({ nombre: '', descripcion: '', temporada_id: '', familia_id: '' });
      addToast(`Referencia "${created.nombre}" creada`, 'success');
      reloadCatalog();
    } catch (err) { setErrorCat(err.message); }
    finally { setGuardandoCat(false); }
  };
  const handleCrearCalidad = async (e) => {
    e.preventDefault(); setErrorCal('');
    if (!nuevaCalidad.nombre.trim()) { setErrorCal('El nombre es requerido'); return; }
    setGuardandoCal(true);
    try {
      const created = await tiposPacaApi.createCalidad(nuevaCalidad);
      setCalidades(prev => [...prev, created]);
      setNuevaCalidad({ nombre: '', descripcion: '' });
      addToast(`Calidad "${created.nombre}" creada`, 'success');
      reloadCatalog();
    } catch (err) { setErrorCal(err.message); }
    finally { setGuardandoCal(false); }
  };
  const handleCrearTemporada = async (e) => {
    e.preventDefault(); setErrorTemp('');
    if (!nuevaTemporada.nombre.trim()) { setErrorTemp('El nombre es requerido'); return; }
    setGuardandoTemp(true);
    try {
      const created = await tiposPacaApi.createTemporada(nuevaTemporada);
      setTemporadas(prev => [...prev, created]);
      setNuevaTemporada({ nombre: '', descripcion: '' });
      addToast(`Categoría "${created.nombre}" creada`, 'success');
      reloadCatalog();
    } catch (err) { setErrorTemp(err.message); }
    finally { setGuardandoTemp(false); }
  };

  const handleEliminarTipo = async (tipo) => {
    const ok = await confirm({ title: `¿Eliminar clasificación "${tipo.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteTipo(tipo.id);
      setTipos(prev => prev.filter(t => t.id !== tipo.id));
      addToast(`Clasificación "${tipo.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(mensajeDeError(err), 'error'); }
  };
  const handleEliminarCategoria = async (cat) => {
    const ok = await confirm({ title: `¿Eliminar referencia "${cat.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCategoria(cat.id);
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
      addToast(`Referencia "${cat.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(mensajeDeError(err), 'error'); }
  };
  const handleEliminarCalidad = async (cal) => {
    const ok = await confirm({ title: `¿Eliminar calidad "${cal.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCalidad(cal.id);
      setCalidades(prev => prev.filter(c => c.id !== cal.id));
      addToast(`Calidad "${cal.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(mensajeDeError(err), 'error'); }
  };
  const handleEliminarTemporada = async (temp) => {
    const ok = await confirm({ title: `¿Eliminar categoría "${temp.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteTemporada(temp.id);
      setTemporadas(prev => prev.filter(t => t.id !== temp.id));
      addToast(`Categoría "${temp.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(mensajeDeError(err), 'error'); }
  };

  const startEdit = (table, item) => setEditando({ table, id: item.id, nombre: item.nombre, temporada_id: item.temporada_id || '', familia_id: item.familia_id || '' });
  const cancelEdit = () => setEditando(null);

  const saveEdit = async () => {
    if (!editando || !editando.nombre.trim()) return;
    setGuardandoEdit(true);
    try {
      const data = { nombre: editando.nombre.trim() };
      let updated;
      if (editando.table === 'tipos') {
        updated = await tiposPacaApi.updateTipo(editando.id, data);
        setTipos(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else if (editando.table === 'categorias') {
        updated = await tiposPacaApi.updateCategoria(editando.id, { ...data, temporada_id: editando.temporada_id || null, familia_id: editando.familia_id || null });
        setCategorias(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else if (editando.table === 'calidades') {
        updated = await tiposPacaApi.updateCalidad(editando.id, data);
        setCalidades(prev => prev.map(c => c.id === updated.id ? updated : c));
      } else if (editando.table === 'temporadas') {
        updated = await tiposPacaApi.updateTemporada(editando.id, data);
        setTemporadas(prev => prev.map(t => t.id === updated.id ? updated : t));
      }
      addToast('Nombre actualizado', 'success');
      setEditando(null);
      reloadCatalog();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    } finally {
      setGuardandoEdit(false);
    }
  };

  // Todo lo que Panel y PanelItem necesitan para editar en línea. Va junto para
  // no repetir seis props en cada uno de los cinco paneles.
  const edicion = { editando, setEditando, saveEdit, cancelEdit, startEdit, guardandoEdit };

  return (
    <Layout title="Productos" subtitle="Gestiona categorías, clasificaciones, referencias y calidades del inventario">
      <div className="space-y-6 max-w-6xl">

        <div className="flex items-start gap-4 p-4 bg-secondary/10 border border-secondary/20 rounded-2xl">
          <div className="p-2 bg-secondary/20 rounded-xl mt-0.5"><Tag className="w-5 h-5 text-secondary" /></div>
          <div>
            <p className="font-semibold text-primary text-sm">Catálogo personalizable</p>
            <p className="text-xs text-muted mt-0.5">
              Usa los botones de lápiz y papelera de cada ítem para editar su nombre o eliminarlo. Solo se bloquea eliminar si hay unidades que lo usan activamente.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          <Panel
            edicion={edicion} temporadas={temporadas} familias={familias}
            title="Categorías"
            icon={Sun}
            table="temporadas"
            count={temporadas.length}
            error={errorTemp}
            loading={loadingTemps}
            items={temporadas}
            onDelete={handleEliminarTemporada}
            onCreate={handleCrearTemporada}
            formState={nuevaTemporada}
            setFormState={setNuevaTemporada}
            submitting={guardandoTemp}
            placeholder="ej: verano, invierno..."
          />

          <Panel
            edicion={edicion} temporadas={temporadas} familias={familias}
            title="Clasificaciones"
            icon={Tag}
            table="tipos"
            count={tipos.length}
            error={errorTipo}
            loading={loadingTipos}
            items={tipos}
            onDelete={handleEliminarTipo}
            onCreate={handleCrearTipo}
            formState={nuevoTipo}
            setFormState={setNuevoTipo}
            submitting={guardandoTipo}
            placeholder="ej: mixta, hombre, mujer..."
          />

          <Panel
            edicion={edicion} temporadas={temporadas} familias={familias}
            title="Referencias"
            icon={Layers}
            table="categorias"
            count={categorias.length}
            error={errorCat}
            loading={loadingCats}
            items={categorias}
            onDelete={handleEliminarCategoria}
            onCreate={handleCrearCategoria}
            formState={nuevaCategoria}
            setFormState={setNuevaCategoria}
            submitting={guardandoCat}
            placeholder="ej: chaqueta, shorts..."
            extraFormContent={
              <BuscadorLista
                value={nuevaCategoria.temporada_id}
                onChange={(valorElegido) => setNuevaCategoria(f => ({ ...f, temporada_id: valorElegido }))}
                opcionVacia="Categoría (opcional)"
                placeholder="Categoría (opcional)"
                opciones={[
                  ...temporadas.map((t) => ({ value: t.id, label: capitalize(t.nombre) })),
                ]}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
            }
            extraFormContent2={
              <BuscadorLista
                value={nuevaCategoria.familia_id}
                onChange={(valorElegido) => setNuevaCategoria(f => ({ ...f, familia_id: valorElegido }))}
                opcionVacia="Familia (opcional)"
                placeholder="Familia (opcional)"
                opciones={[
                  ...familias.map((fa) => ({ value: fa.id, label: capitalize(fa.nombre) })),
                ]}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
            }
          />

          <Panel
            edicion={edicion} temporadas={temporadas} familias={familias}
            title="Calidades"
            icon={Star}
            table="calidades"
            count={calidades.length}
            error={errorCal}
            loading={loadingCals}
            items={calidades}
            onDelete={handleEliminarCalidad}
            onCreate={handleCrearCalidad}
            formState={nuevaCalidad}
            setFormState={setNuevaCalidad}
            submitting={guardandoCal}
            placeholder="ej: premium, supreme..."
          />

          <Panel
            edicion={edicion} temporadas={temporadas} familias={familias}
            title="Familias"
            icon={Boxes}
            table="familias"
            count={familias.length}
            loading={loadingFams}
            items={familias}
            onDelete={handleEliminarFamilia}
            onCreate={handleCrearFamilia}
            formState={nuevaFamilia}
            setFormState={setNuevaFamilia}
            submitting={guardandoFam}
            placeholder="ej: chaquetas, pantalones..."
          />

        </div>
      </div>
    </Layout>
  );
}
