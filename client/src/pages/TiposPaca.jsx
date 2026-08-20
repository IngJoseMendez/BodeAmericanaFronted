import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm } from '../components/common';
import { tiposPacaApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { Plus, Trash2, Tag, Layers, Star, Sun, Pencil, Check, X, Boxes } from 'lucide-react';


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
  'p-1.5 rounded-lg text-muted transition-all [@media(hover:hover)]:opacity-0 ' +
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
              <select
                value={editando.temporada_id || ''}
                onChange={e => setEditando(prev => ({ ...prev, temporada_id: e.target.value }))}
                className="w-full border border-secondary/60 rounded-lg px-2.5 py-1.5 text-sm text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              >
                <option value="">Sin categoría</option>
                {temporadas.map(t => (
                  <option key={t.id} value={t.id}>{capitalize(t.nombre)}</option>
                ))}
              </select>
            )}
            {/* La familia agrupa referencias parecidas: "Chaqueta deportiva" y
                "Chaqueta mixta" bajo "Chaquetas". */}
            {table === 'categorias' && (
              <select
                value={editando.familia_id || ''}
                onChange={e => setEditando(prev => ({ ...prev, familia_id: e.target.value }))}
                className="w-full border border-secondary/60 rounded-lg px-2.5 py-1.5 text-sm text-primary bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              >
                <option value="">Sin familia</option>
                {familias.map(fa => (
                  <option key={fa.id} value={fa.id}>{capitalize(fa.nombre)}</option>
                ))}
              </select>
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
              className="p-1.5 rounded-lg text-secondary hover:bg-secondary/10 transition-all disabled:opacity-50"
              title="Guardar"
            >
              <Check size={14} />
            </button>
            <button
              onClick={cancelEdit}
              className="p-1.5 rounded-lg text-muted hover:bg-primary/5 transition-all"
              title="Cancelar"
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

function Panel({ title, icon: Icon, count, error, form, loading, items, table, onDelete, onCreate,
                 formState, setFormState, submitting, placeholder, extraFormContent, extraFormContent2,
                 edicion, temporadas, familias }) {

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
      {loading ? <div className="p-6 text-center text-muted text-sm">Cargando...</div>
        : items.length === 0 ? <div className="p-6 text-center text-muted text-sm">Sin registros</div>
        : <ul className="divide-y divide-border/50">{items.map(item => <PanelItem key={item.id} item={item} table={table} onDelete={onDelete}
                          edicion={edicion} temporadas={temporadas} familias={familias} />)}</ul>}
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
    catch (err) { addToast(err.message, 'error'); }
    finally { setLoadingTipos(false); }
  };
  const loadCategorias = async () => {
    setLoadingCats(true);
    try { setCategorias(await tiposPacaApi.getCategorias()); }
    catch (err) { addToast(err.message, 'error'); }
    finally { setLoadingCats(false); }
  };
  const loadCalidades = async () => {
    setLoadingCals(true);
    try { setCalidades(await tiposPacaApi.getCalidades()); }
    catch (err) { addToast(err.message, 'error'); }
    finally { setLoadingCals(false); }
  };
  const loadTemporadas = async () => {
    setLoadingTemps(true);
    try { setTemporadas(await tiposPacaApi.getTemporadas()); }
    catch (err) { addToast(err.message, 'error'); }
    finally { setLoadingTemps(false); }
  };

  // Familias: agrupan referencias parecidas ("Chaqueta deportiva" y
  // "Chaqueta mixta" bajo "Chaquetas") sin reemplazar a la referencia.
  const loadFamilias = async () => {
    setLoadingFams(true);
    try { setFamilias(await tiposPacaApi.getFamilias()); }
    catch (err) { addToast(err.message, 'error'); }
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
    } catch (err) { addToast(err.message, 'error'); }
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
    } catch (err) { addToast(err.message, 'error'); }
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
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEliminarCategoria = async (cat) => {
    const ok = await confirm({ title: `¿Eliminar referencia "${cat.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCategoria(cat.id);
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
      addToast(`Referencia "${cat.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEliminarCalidad = async (cal) => {
    const ok = await confirm({ title: `¿Eliminar calidad "${cal.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCalidad(cal.id);
      setCalidades(prev => prev.filter(c => c.id !== cal.id));
      addToast(`Calidad "${cal.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEliminarTemporada = async (temp) => {
    const ok = await confirm({ title: `¿Eliminar categoría "${temp.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteTemporada(temp.id);
      setTemporadas(prev => prev.filter(t => t.id !== temp.id));
      addToast(`Categoría "${temp.nombre}" eliminada`, 'success');
      reloadCatalog();
    } catch (err) { addToast(err.message, 'error'); }
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
      addToast(err.message, 'error');
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
              <select
                value={nuevaCategoria.temporada_id}
                onChange={e => setNuevaCategoria(f => ({ ...f, temporada_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                <option value="">Categoría (opcional)</option>
                {temporadas.map(t => (
                  <option key={t.id} value={t.id}>{capitalize(t.nombre)}</option>
                ))}
              </select>
            }
            extraFormContent2={
              <select
                value={nuevaCategoria.familia_id}
                onChange={e => setNuevaCategoria(f => ({ ...f, familia_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                <option value="">Familia (opcional)</option>
                {familias.map(fa => (
                  <option key={fa.id} value={fa.id}>{capitalize(fa.nombre)}</option>
                ))}
              </select>
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
