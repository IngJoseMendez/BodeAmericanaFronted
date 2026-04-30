import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm, Badge } from '../components/common';
import { tiposPacaApi } from '../services/api';
import { Plus, Trash2, Tag, Layers, Lock, CheckCircle2, Sparkles, Star } from 'lucide-react';

export default function TiposPaca() {
  const [tipos, setTipos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [calidades, setCalidades] = useState([]);
  const [loadingTipos, setLoadingTipos] = useState(true);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingCals, setLoadingCals] = useState(true);

  const [nuevoTipo, setNuevoTipo] = useState({ nombre: '', descripcion: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', descripcion: '' });
  const [nuevaCalidad, setNuevaCalidad] = useState({ nombre: '', descripcion: '' });
  const [errorTipo, setErrorTipo] = useState('');
  const [errorCat, setErrorCat] = useState('');
  const [errorCal, setErrorCal] = useState('');
  const [guardandoTipo, setGuardandoTipo] = useState(false);
  const [guardandoCat, setGuardandoCat] = useState(false);
  const [guardandoCal, setGuardandoCal] = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadTipos();
    loadCategorias();
    loadCalidades();
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

  const handleCrearTipo = async (e) => {
    e.preventDefault();
    setErrorTipo('');
    if (!nuevoTipo.nombre.trim()) { setErrorTipo('El nombre es requerido'); return; }
    setGuardandoTipo(true);
    try {
      const created = await tiposPacaApi.createTipo(nuevoTipo);
      setTipos(prev => [...prev, created]);
      setNuevoTipo({ nombre: '', descripcion: '' });
      addToast(`Tipo "${created.nombre}" creado`, 'success');
    } catch (err) { setErrorTipo(err.message); }
    finally { setGuardandoTipo(false); }
  };

  const handleCrearCategoria = async (e) => {
    e.preventDefault();
    setErrorCat('');
    if (!nuevaCategoria.nombre.trim()) { setErrorCat('El nombre es requerido'); return; }
    setGuardandoCat(true);
    try {
      const created = await tiposPacaApi.createCategoria(nuevaCategoria);
      setCategorias(prev => [...prev, created]);
      setNuevaCategoria({ nombre: '', descripcion: '' });
      addToast(`Categoría "${created.nombre}" creada`, 'success');
    } catch (err) { setErrorCat(err.message); }
    finally { setGuardandoCat(false); }
  };

  const handleCrearCalidad = async (e) => {
    e.preventDefault();
    setErrorCal('');
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

  const handleEliminarTipo = async (tipo) => {
    const ok = await confirm({ title: `¿Eliminar tipo "${tipo.nombre}"?`, message: 'Solo se puede eliminar si no hay pacas que lo usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteTipo(tipo.id);
      setTipos(prev => prev.filter(t => t.id !== tipo.id));
      addToast(`Tipo "${tipo.nombre}" eliminado`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleEliminarCategoria = async (cat) => {
    const ok = await confirm({ title: `¿Eliminar categoría "${cat.nombre}"?`, message: 'Solo se puede eliminar si no hay pacas que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCategoria(cat.id);
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
      addToast(`Categoría "${cat.nombre}" eliminada`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleEliminarCalidad = async (cal) => {
    const ok = await confirm({ title: `¿Eliminar calidad "${cal.nombre}"?`, message: 'Solo se puede eliminar si no hay pacas que la usen.', confirmText: 'Sí, eliminar', variant: 'danger' });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCalidad(cal.id);
      setCalidades(prev => prev.filter(c => c.id !== cal.id));
      addToast(`Calidad "${cal.nombre}" eliminada`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const PanelItem = ({ item, onDelete }) => (
    <li className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className="flex items-center gap-3 min-w-0">
        {item.predefinido ? (
          <div className="p-1.5 bg-gray-100 rounded-lg" title="Predefinido"><Lock size={13} className="text-gray-400" /></div>
        ) : (
          <div className="p-1.5 bg-secondary/10 rounded-lg"><CheckCircle2 size={13} className="text-secondary" /></div>
        )}
        <div className="min-w-0">
          <p className="font-medium text-sm text-primary">{capitalize(item.nombre)}</p>
          {item.descripcion && <p className="text-xs text-muted truncate">{item.descripcion}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.predefinido ? (
          <Badge variant="default" className="text-xs">sistema</Badge>
        ) : (
          <button onClick={() => onDelete(item)} className="p-1.5 rounded-lg text-gray-300 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all" title="Eliminar">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );

  return (
    <Layout title="Tipos de Paca" subtitle="Gestiona clasificaciones, referencias y calidades del inventario">
      <div className="space-y-6 max-w-5xl">

        <div className="flex items-start gap-4 p-4 bg-secondary/10 border border-secondary/20 rounded-2xl">
          <div className="p-2 bg-secondary/20 rounded-xl mt-0.5"><Sparkles className="w-5 h-5 text-secondary" /></div>
          <div>
            <p className="font-semibold text-primary text-sm">Catálogo personalizable</p>
            <p className="text-xs text-muted mt-0.5">
              Los ítems predefinidos (<Lock className="inline w-3 h-3" />) no se pueden eliminar.
              Los personalizados estarán disponibles en todos los formularios de contenedores y pacas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* ── CLASIFICACIONES (ex Tipos) ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/5 rounded-xl"><Tag className="w-5 h-5 text-primary" /></div>
              <div>
                <h2 className="font-display text-lg font-semibold text-primary">Clasificaciones</h2>
                <p className="text-xs text-muted">{tipos.length} registradas</p>
              </div>
            </div>
            <Card>
              <CardBody className="p-4">
                <p className="text-sm font-medium text-primary mb-3 flex items-center gap-1.5"><Plus size={15} /> Nueva clasificación</p>
                {errorTipo && <div className="mb-3 px-3 py-2 bg-error/10 text-error text-xs rounded-lg">{errorTipo}</div>}
                <form onSubmit={handleCrearTipo} className="space-y-3">
                  <Input placeholder="ej: invierno, kids, ejecutiva..." value={nuevoTipo.nombre} onChange={e => setNuevoTipo({ ...nuevoTipo, nombre: e.target.value })} />
                  <Input placeholder="Descripción (opcional)" value={nuevoTipo.descripcion} onChange={e => setNuevoTipo({ ...nuevoTipo, descripcion: e.target.value })} />
                  <Button type="submit" variant="secondary" className="w-full" disabled={guardandoTipo}>{guardandoTipo ? 'Guardando...' : 'Agregar'}</Button>
                </form>
              </CardBody>
            </Card>
            <Card padding={false}>
              {loadingTipos ? <div className="p-6 text-center text-muted text-sm">Cargando...</div>
                : tipos.length === 0 ? <div className="p-6 text-center text-muted text-sm">Sin clasificaciones</div>
                : <ul className="divide-y divide-border/50">{tipos.map(t => <PanelItem key={t.id} item={t} onDelete={handleEliminarTipo} />)}</ul>}
            </Card>
          </section>

          {/* ── REFERENCIAS (ex Categorías) ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/5 rounded-xl"><Layers className="w-5 h-5 text-primary" /></div>
              <div>
                <h2 className="font-display text-lg font-semibold text-primary">Referencias</h2>
                <p className="text-xs text-muted">{categorias.length} registradas</p>
              </div>
            </div>
            <Card>
              <CardBody className="p-4">
                <p className="text-sm font-medium text-primary mb-3 flex items-center gap-1.5"><Plus size={15} /> Nueva referencia</p>
                {errorCat && <div className="mb-3 px-3 py-2 bg-error/10 text-error text-xs rounded-lg">{errorCat}</div>}
                <form onSubmit={handleCrearCategoria} className="space-y-3">
                  <Input placeholder="ej: juvenil, talla grande..." value={nuevaCategoria.nombre} onChange={e => setNuevaCategoria({ ...nuevaCategoria, nombre: e.target.value })} />
                  <Input placeholder="Descripción (opcional)" value={nuevaCategoria.descripcion} onChange={e => setNuevaCategoria({ ...nuevaCategoria, descripcion: e.target.value })} />
                  <Button type="submit" variant="secondary" className="w-full" disabled={guardandoCat}>{guardandoCat ? 'Guardando...' : 'Agregar'}</Button>
                </form>
              </CardBody>
            </Card>
            <Card padding={false}>
              {loadingCats ? <div className="p-6 text-center text-muted text-sm">Cargando...</div>
                : categorias.length === 0 ? <div className="p-6 text-center text-muted text-sm">Sin referencias</div>
                : <ul className="divide-y divide-border/50">{categorias.map(c => <PanelItem key={c.id} item={c} onDelete={handleEliminarCategoria} />)}</ul>}
            </Card>
          </section>

          {/* ── CALIDADES ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/5 rounded-xl"><Star className="w-5 h-5 text-primary" /></div>
              <div>
                <h2 className="font-display text-lg font-semibold text-primary">Calidades</h2>
                <p className="text-xs text-muted">{calidades.length} registradas</p>
              </div>
            </div>
            <Card>
              <CardBody className="p-4">
                <p className="text-sm font-medium text-primary mb-3 flex items-center gap-1.5"><Plus size={15} /> Nueva calidad</p>
                {errorCal && <div className="mb-3 px-3 py-2 bg-error/10 text-error text-xs rounded-lg">{errorCal}</div>}
                <form onSubmit={handleCrearCalidad} className="space-y-3">
                  <Input placeholder="ej: premium, outlet, segunda..." value={nuevaCalidad.nombre} onChange={e => setNuevaCalidad({ ...nuevaCalidad, nombre: e.target.value })} />
                  <Input placeholder="Descripción (opcional)" value={nuevaCalidad.descripcion} onChange={e => setNuevaCalidad({ ...nuevaCalidad, descripcion: e.target.value })} />
                  <Button type="submit" variant="secondary" className="w-full" disabled={guardandoCal}>{guardandoCal ? 'Guardando...' : 'Agregar'}</Button>
                </form>
              </CardBody>
            </Card>
            <Card padding={false}>
              {loadingCals ? <div className="p-6 text-center text-muted text-sm">Cargando...</div>
                : calidades.length === 0 ? <div className="p-6 text-center text-muted text-sm">Sin calidades</div>
                : <ul className="divide-y divide-border/50">{calidades.map(c => <PanelItem key={c.id} item={c} onDelete={handleEliminarCalidad} />)}</ul>}
            </Card>
          </section>

        </div>
      </div>
    </Layout>
  );
}
