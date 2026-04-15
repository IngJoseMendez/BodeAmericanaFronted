import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, useToast, useConfirm, Badge } from '../components/common';
import { tiposPacaApi } from '../services/api';
import { Plus, Trash2, Tag, Layers, Lock, CheckCircle2, Sparkles } from 'lucide-react';

export default function TiposPaca() {
  const [tipos, setTipos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loadingTipos, setLoadingTipos] = useState(true);
  const [loadingCats, setLoadingCats] = useState(true);

  // Formularios
  const [nuevoTipo, setNuevoTipo] = useState({ nombre: '', descripcion: '' });
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', descripcion: '' });
  const [errorTipo, setErrorTipo] = useState('');
  const [errorCat, setErrorCat] = useState('');
  const [guardandoTipo, setGuardandoTipo] = useState(false);
  const [guardandoCat, setGuardandoCat] = useState(false);

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    loadTipos();
    loadCategorias();
  }, []);

  const loadTipos = async () => {
    setLoadingTipos(true);
    try {
      const data = await tiposPacaApi.getTipos();
      setTipos(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingTipos(false);
    }
  };

  const loadCategorias = async () => {
    setLoadingCats(true);
    try {
      const data = await tiposPacaApi.getCategorias();
      setCategorias(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoadingCats(false);
    }
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
    } catch (err) {
      setErrorTipo(err.message);
    } finally {
      setGuardandoTipo(false);
    }
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
    } catch (err) {
      setErrorCat(err.message);
    } finally {
      setGuardandoCat(false);
    }
  };

  const handleEliminarTipo = async (tipo) => {
    const ok = await confirm({
      title: `¿Eliminar tipo "${tipo.nombre}"?`,
      message: 'Solo se puede eliminar si no hay pacas que lo usen.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteTipo(tipo.id);
      setTipos(prev => prev.filter(t => t.id !== tipo.id));
      addToast(`Tipo "${tipo.nombre}" eliminado`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEliminarCategoria = async (cat) => {
    const ok = await confirm({
      title: `¿Eliminar categoría "${cat.nombre}"?`,
      message: 'Solo se puede eliminar si no hay pacas que la usen.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await tiposPacaApi.deleteCategoria(cat.id);
      setCategorias(prev => prev.filter(c => c.id !== cat.id));
      addToast(`Categoría "${cat.nombre}" eliminada`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <Layout title="Tipos de Paca" subtitle="Gestiona los tipos y categorías del inventario">
      <div className="space-y-6 max-w-4xl">

        {/* Banner informativo */}
        <div className="flex items-start gap-4 p-4 bg-secondary/10 border border-secondary/20 rounded-2xl">
          <div className="p-2 bg-secondary/20 rounded-xl mt-0.5">
            <Sparkles className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-primary text-sm">Catálogo personalizable</p>
            <p className="text-xs text-muted mt-0.5">
              Los tipos y categorías predefinidos (<Lock className="inline w-3 h-3" />) no se pueden eliminar. 
              Puedes agregar cualquier tipo personalizado que necesites y estará disponible en todos los formularios de pacas.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── TIPOS ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/5 rounded-xl">
                <Tag className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-primary">Tipos de Paca</h2>
                <p className="text-xs text-muted">{tipos.length} tipos registrados</p>
              </div>
            </div>

            {/* Formulario nuevo tipo */}
            <Card>
              <CardBody className="p-4">
                <p className="text-sm font-medium text-primary mb-3 flex items-center gap-1.5">
                  <Plus size={15} /> Agregar nuevo tipo
                </p>
                {errorTipo && (
                  <div className="mb-3 px-3 py-2 bg-error/10 text-error text-xs rounded-lg">{errorTipo}</div>
                )}
                <form onSubmit={handleCrearTipo} className="space-y-3">
                  <Input
                    placeholder="Nombre del tipo (ej: invierno, kids, ejecutiva...)"
                    value={nuevoTipo.nombre}
                    onChange={e => setNuevoTipo({ ...nuevoTipo, nombre: e.target.value })}
                  />
                  <Input
                    placeholder="Descripción (opcional)"
                    value={nuevoTipo.descripcion}
                    onChange={e => setNuevoTipo({ ...nuevoTipo, descripcion: e.target.value })}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    disabled={guardandoTipo}
                  >
                    {guardandoTipo ? 'Guardando...' : 'Agregar Tipo'}
                  </Button>
                </form>
              </CardBody>
            </Card>

            {/* Lista de tipos */}
            <Card padding={false}>
              {loadingTipos ? (
                <div className="p-6 text-center text-muted text-sm">Cargando...</div>
              ) : tipos.length === 0 ? (
                <div className="p-6 text-center text-muted text-sm">Sin tipos registrados</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {tipos.map(t => (
                    <li key={t.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        {t.predefinido ? (
                          <div className="p-1.5 bg-gray-100 rounded-lg" title="Predefinido">
                            <Lock size={13} className="text-gray-400" />
                          </div>
                        ) : (
                          <div className="p-1.5 bg-secondary/10 rounded-lg">
                            <CheckCircle2 size={13} className="text-secondary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-primary">{capitalize(t.nombre)}</p>
                          {t.descripcion && (
                            <p className="text-xs text-muted truncate">{t.descripcion}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.predefinido ? (
                          <Badge variant="default" className="text-xs">sistema</Badge>
                        ) : (
                          <button
                            onClick={() => handleEliminarTipo(t)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* ── CATEGORÍAS ── */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/5 rounded-xl">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold text-primary">Categorías</h2>
                <p className="text-xs text-muted">{categorias.length} categorías registradas</p>
              </div>
            </div>

            {/* Formulario nueva categoría */}
            <Card>
              <CardBody className="p-4">
                <p className="text-sm font-medium text-primary mb-3 flex items-center gap-1.5">
                  <Plus size={15} /> Agregar nueva categoría
                </p>
                {errorCat && (
                  <div className="mb-3 px-3 py-2 bg-error/10 text-error text-xs rounded-lg">{errorCat}</div>
                )}
                <form onSubmit={handleCrearCategoria} className="space-y-3">
                  <Input
                    placeholder="Nombre de categoría (ej: juvenil, talla grande...)"
                    value={nuevaCategoria.nombre}
                    onChange={e => setNuevaCategoria({ ...nuevaCategoria, nombre: e.target.value })}
                  />
                  <Input
                    placeholder="Descripción (opcional)"
                    value={nuevaCategoria.descripcion}
                    onChange={e => setNuevaCategoria({ ...nuevaCategoria, descripcion: e.target.value })}
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="w-full"
                    disabled={guardandoCat}
                  >
                    {guardandoCat ? 'Guardando...' : 'Agregar Categoría'}
                  </Button>
                </form>
              </CardBody>
            </Card>

            {/* Lista de categorías */}
            <Card padding={false}>
              {loadingCats ? (
                <div className="p-6 text-center text-muted text-sm">Cargando...</div>
              ) : categorias.length === 0 ? (
                <div className="p-6 text-center text-muted text-sm">Sin categorías registradas</div>
              ) : (
                <ul className="divide-y divide-border/50">
                  {categorias.map(c => (
                    <li key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-3 min-w-0">
                        {c.predefinido ? (
                          <div className="p-1.5 bg-gray-100 rounded-lg" title="Predefinido">
                            <Lock size={13} className="text-gray-400" />
                          </div>
                        ) : (
                          <div className="p-1.5 bg-secondary/10 rounded-lg">
                            <CheckCircle2 size={13} className="text-secondary" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-primary">{capitalize(c.nombre)}</p>
                          {c.descripcion && (
                            <p className="text-xs text-muted truncate">{c.descripcion}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.predefinido ? (
                          <Badge variant="default" className="text-xs">sistema</Badge>
                        ) : (
                          <button
                            onClick={() => handleEliminarCategoria(c)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

        </div>
      </div>
    </Layout>
  );
}
