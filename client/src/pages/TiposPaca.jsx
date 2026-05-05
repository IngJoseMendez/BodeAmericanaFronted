import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm, Badge } from '../components/common';
import { tiposPacaApi } from '../services/api';
import { Plus, Trash2, Tag, Layers, Star, Sun } from 'lucide-react';

export default function TiposPaca() {
  const [tipos, setTipos]           = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades, setCalidades]   = useState([]);
  const [temporadas, setTemporadas] = useState([]);

  const [loadingTipos, setLoadingTipos]   = useState(true);
  const [loadingCats, setLoadingCats]     = useState(true);
  const [loadingCals, setLoadingCals]     = useState(true);
  const [loadingTemps, setLoadingTemps]   = useState(true);

  const [nuevoTipo,      setNuevoTipo]      = useState({ nombre: '', descripcion: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', descripcion: '' });
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

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadTipos(); loadCategorias(); loadCalidades(); loadTemporadas();
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

  const handleCrearTipo = async (e) => {
    e.preventDefault(); setErrorTipo('');
    if (!nuevoTipo.nombre.trim()) { setErrorTipo('El nombre es requerido'); return; }
    setGuardandoTipo(true);
    try {
      const created = await tiposPacaApi.createTipo(nuevoTipo);
      setTipos(prev => [...prev, created]);
      setNuevoTipo({ nombre: '', descripcion: '' });
      addToast(`Clasificación "${created.nombre}" creada`, 'success');
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
      setNuevaCategoria({ nombre: '', descripcion: '' });
      addToast(`Referencia "${created.nombre}" creada`, 'success');
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
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEliminarCategoria = async (cat) => {
    const ok = await confirm({ title: `¿Eliminar referencia "${cat.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCategoria(cat.id);
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
      addToast(`Referencia "${cat.nombre}" eliminada`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEliminarCalidad = async (cal) => {
    const ok = await confirm({ title: `¿Eliminar calidad "${cal.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCalidad(cal.id);
      setCalidades(prev => prev.filter(c => c.id !== cal.id));
      addToast(`Calidad "${cal.nombre}" eliminada`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };
  const handleEliminarTemporada = async (temp) => {
    const ok = await confirm({ title: `¿Eliminar categoría "${temp.nombre}"?`, message: 'Solo se puede eliminar si no hay unidades que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteTemporada(temp.id);
      setTemporadas(prev => prev.filter(t => t.id !== temp.id));
      addToast(`Categoría "${temp.nombre}" eliminada`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const PanelItem = ({ item, onDelete }) => (
    <li className="flex items-center justify-between px-4 py-3 hover:bg-primary/3 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        <div className="min-w-0">
          <p className="font-medium text-sm text-primary">{capitalize(item.nombre)}</p>
          {item.descripcion && <p className="text-xs text-muted truncate">{item.descripcion}</p>}
        </div>
      </div>
      <button onClick={() => onDelete(item)}
        className="p-1.5 rounded-lg text-border hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
        title="Eliminar">
        <Trash2 size={14} />
      </button>
    </li>
  );

  const Panel = ({ title, icon: Icon, count, error, form, loading, items, onDelete, onCreate, formState, setFormState, submitting, placeholder }) => (
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
            <Button type="submit" variant="secondary" className="w-full" disabled={submitting}>{submitting ? 'Guardando...' : 'Agregar'}</Button>
          </form>
        </CardBody>
      </Card>
      <Card padding={false}>
        {loading ? <div className="p-6 text-center text-muted text-sm">Cargando...</div>
          : items.length === 0 ? <div className="p-6 text-center text-muted text-sm">Sin registros</div>
          : <ul className="divide-y divide-border/50">{items.map(item => <PanelItem key={item.id} item={item} onDelete={onDelete} />)}</ul>}
      </Card>
    </section>
  );

  return (
    <Layout title="Tipos de Paca" subtitle="Gestiona categorías, clasificaciones, referencias y calidades del inventario">
      <div className="space-y-6 max-w-6xl">

        <div className="flex items-start gap-4 p-4 bg-secondary/10 border border-secondary/20 rounded-2xl">
          <div className="p-2 bg-secondary/20 rounded-xl mt-0.5"><Tag className="w-5 h-5 text-secondary" /></div>
          <div>
            <p className="font-semibold text-primary text-sm">Catálogo personalizable</p>
            <p className="text-xs text-muted mt-0.5">
              Todos los ítems son editables. Solo se bloquea eliminar si hay unidades que los usan activamente.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

          <Panel
            title="Categorías"
            icon={Sun}
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
            title="Clasificaciones"
            icon={Tag}
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
            title="Referencias"
            icon={Layers}
            count={categorias.length}
            error={errorCat}
            loading={loadingCats}
            items={categorias}
            onDelete={handleEliminarCategoria}
            onCreate={handleCrearCategoria}
            formState={nuevaCategoria}
            setFormState={setNuevaCategoria}
            submitting={guardandoCat}
            placeholder="ej: chaqueta, pantalón, blusa..."
          />

          <Panel
            title="Calidades"
            icon={Star}
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

        </div>
      </div>
    </Layout>
  );
}
