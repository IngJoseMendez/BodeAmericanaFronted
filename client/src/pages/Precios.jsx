import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Modal, useToast, useConfirm, CampoMonto, BuscadorLista } from '../components/common';
import { preciosApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { Plus, Trash2, Edit2, Tag, Search, X } from 'lucide-react';
import { formatCOP } from '../lib/money';

import { mensajeDeError } from '../lib/errores';
const formatCurrency = formatCOP;

const emptyForm = { categoria: '', calidad: '', precio: '' };

export default function Precios() {
  const [precios, setPrecios] = useState([]);
  const [loading, setLoading] = useState(true);
  const { temporadas, calidades } = useCatalog();
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [busqueda, setBusqueda]     = useState('');

  const { addToast } = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    preciosApi.getAll()
      .then(setPrecios)
      .catch(() => addToast('Error cargando precios', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const reload = async () => {
    const p = await preciosApi.getAll();
    setPrecios(p);
  };

  // Se busca sobre el texto de la fila TAL COMO SE LEE, incluido el precio ya
  // formateado: quien busca «1.430.000» lo escribe con puntos, y quien busca
  // «1430000» no. Las dos formas van al mismo sitio porque se compara contra
  // las dos. Y sin acentos ni mayusculas, que es como se teclea de prisa.
  const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();

  const visibles = useMemo(() => {
    const q = norm(busqueda);
    if (!q) return precios;
    // Cada palabra por separado: «verano prem» encuentra «verano / premium».
    const palabras = q.split(/\s+/).filter(Boolean);
    return precios.filter((p) => {
      const heno = norm([
        p.categoria, p.calidad,
        p.precio,                                  // 1430000
        formatCurrency(p.precio),                   // $ 1.430.000
        String(p.precio ?? '').replace(/\D/g, ''),  // 143000000 (con decimales)
      ].join(' '));
      return palabras.every((w) => heno.includes(w));
    });
  }, [precios, busqueda]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditTarget(p);
    setForm({ categoria: p.categoria, calidad: p.calidad, precio: p.precio });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.categoria || !form.calidad || !form.precio) {
      addToast('Todos los campos son requeridos', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await preciosApi.update(editTarget.id, form);
        addToast('Precio actualizado', 'success');
      } else {
        await preciosApi.create(form);
        addToast('Precio guardado', 'success');
      }
      setModalOpen(false);
      await reload();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p) => {
    const ok = await confirm({ title: 'Eliminar precio', message: `¿Eliminar el precio de ${p.categoria} / ${p.calidad}?` });
    if (!ok) return;
    try {
      await preciosApi.delete(p.id);
      addToast('Precio eliminado', 'success');
      await reload();
    } catch (err) {
      addToast(mensajeDeError(err), 'error');
    }
  };

  return (
    /* El título lo pinta ya la barra superior del Layout; el <h1> propio dejaba
       dos encabezados de nivel 1 en la misma pantalla. */
    <Layout title="Precios Preestablecidos">
      <div className="space-y-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          {/* Lo que de verdad hace esta tabla, dicho entero: es la AUTORIDAD del
              precio, no un autocompletado del contenedor. La Matriz, las
              cotizaciones y el inventario lo sacan de aquí buscando por la
              TEMPORADA de cada referencia: «deportivo» es de verano, así que su
              precio es el de «verano / premium». */}
          <p className="text-sm text-muted max-w-xl">
            Define el precio por <b>temporada y calidad</b>. De aquí lo toman la
            Matriz, las cotizaciones y el inventario: cada referencia cobra el
            precio de su temporada, así que <i>deportivo premium</i> vale lo que
            diga <i>verano premium</i>. Una promoción vigente manda sobre esto.
          </p>
          <Button variant="secondary" icon={Plus} onClick={openCreate}>Agregar Precio</Button>
        </div>

        {/* ── BUSCADOR ─────────────────────────────────────────────────────
            Son 15 filas hoy, pero crecen con cada calidad nueva y la tabla no
            tiene ningún orden que ayude a encontrar algo. Busca por temporada,
            por calidad y por el precio TAL COMO SE VE: «1.430.000» y «1430000»
            encuentran lo mismo, porque nadie escribe los puntos igual.
            Aparece sólo cuando hay filas suficientes para que haga falta: un
            buscador sobre cuatro líneas es un campo más que estorba. */}
        {!loading && precios.length > 6 && (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por temporada, calidad o precio…"
              aria-label="Buscar entre los precios preestablecidos"
              className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')}
                title="Limpiar la búsqueda" aria-label="Limpiar la búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-colors">
                <X size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <Card>
          <CardBody className="p-0">
            {loading ? (
              <p className="text-center text-muted py-10">Cargando...</p>
            ) : precios.length === 0 ? (
              <div className="text-center py-14">
                <Tag size={40} className="mx-auto text-muted/40 mb-3" aria-hidden="true" />
                <p className="text-muted">No hay precios configurados</p>
                <Button variant="ghost" size="sm" className="mt-3" onClick={openCreate}>Agregar el primero</Button>
              </div>
            ) : visibles.length === 0 ? (
              /* Sin esto la tabla se quedaba con la cabecera y ni una fila, que
                 se lee como «se perdieron los precios» en vez de «la búsqueda
                 no encontró nada». Y se ofrece la salida: quitar la búsqueda, o
                 crear justo lo que se estaba buscando. */
              <div className="text-center py-14">
                <Search size={40} className="mx-auto text-muted/40 mb-3" aria-hidden="true" />
                <p className="text-muted">
                  Ningún precio coincide con «<b className="text-primary">{busqueda}</b>»
                </p>
                <p className="text-xs text-muted/80 mt-1">
                  Hay {precios.length} precios configurados.
                </p>
                <div className="flex items-center justify-center gap-2 mt-3">
                  <Button variant="ghost" size="sm" onClick={() => setBusqueda('')}>Quitar la búsqueda</Button>
                  <Button variant="secondary" size="sm" icon={Plus} onClick={openCreate}>Agregar precio</Button>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <caption className="sr-only">Precios preestablecidos por categoría y calidad</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="text-left px-5 py-3 text-muted font-medium">Categoría</th>
                    <th scope="col" className="text-left px-5 py-3 text-muted font-medium">Calidad</th>
                    <th scope="col" className="text-right px-5 py-3 text-muted font-medium">Precio</th>
                    <th scope="col" className="px-5 py-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-primary/3 transition-colors">
                      <td className="px-5 py-3 font-medium capitalize">{p.categoria}</td>
                      <td className="px-5 py-3 capitalize">{p.calidad}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-primary">{formatCurrency(p.precio)}</td>
                      <td className="px-5 py-3">
                        {/* Botones de solo icono: sin aria-label el lector de
                            pantalla decía "botón" en los dos, sin decir de qué
                            precio ni si editaba o borraba. */}
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEdit(p)} className="p-1.5 rounded-lg hover:bg-secondary/10 text-muted hover:text-secondary transition-colors" title="Editar precio" aria-label={`Editar el precio de ${p.categoria} / ${p.calidad}`}>
                            <Edit2 size={15} aria-hidden="true" />
                          </button>
                          <button type="button" onClick={() => handleDelete(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-500 transition-colors" title="Eliminar precio" aria-label={`Eliminar el precio de ${p.categoria} / ${p.calidad}`}>
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Cuántas se están viendo de cuántas hay. Con un filtro puesto, una
                tabla sin este pie se lee como la lista completa. */}
            {!loading && precios.length > 0 && visibles.length > 0 && (
              <p className="px-5 py-3 border-t border-border/50 text-xs text-muted">
                {busqueda
                  ? `${visibles.length} de ${precios.length} precios`
                  : `${precios.length} precio${precios.length !== 1 ? 's' : ''} configurado${precios.length !== 1 ? 's' : ''}`}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Este diálogo estaba hecho a mano con un <div fixed>: no cerraba con
          Escape ni al hacer clic fuera, no atrapaba el foco y no devolvía el foco
          al botón que lo abrió. El componente Modal —el que usa el resto de la
          app— ya resuelve todo eso. */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget ? 'Editar Precio' : 'Nuevo Precio Preestablecido'}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="precio-categoria" className="block text-sm font-medium text-primary mb-1">Categoría *</label>
            {/* La etiqueta dice "Categoría" y la opción vacía decía
                "Seleccionar temporada...": mismo dato con dos nombres dentro
                del mismo formulario. En Productos esta lista se llama
                "Categorías", así que ese es el nombre que se usa. */}
            <BuscadorLista
              id="precio-categoria"
              value={form.categoria}
              onChange={(v) => setForm({ ...form, categoria: v })}
              placeholder="Escribe para buscar la categoría"
              opciones={temporadas.map((t) => ({ value: t.nombre, label: t.nombre }))}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div>
            <label htmlFor="precio-calidad" className="block text-sm font-medium text-primary mb-1">Calidad *</label>
            <BuscadorLista
              value={form.calidad}
              onChange={(valorElegido) => setForm({ ...form, calidad: valorElegido })}
              opcionVacia="Seleccionar calidad..."
              placeholder="Seleccionar calidad..."
              opciones={[
                ...calidades.map((q) => ({ value: q.nombre, label: q.nombre })),
              ]}
              id="precio-calidad"
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div>
            <label htmlFor="precio-valor" className="block text-sm font-medium text-primary mb-1">Precio *</label>
            <CampoMonto
              id="precio-valor"
              decimales={0}
              value={form.precio}
              onChange={(e) => setForm({ ...form, precio: e.target.value })}
              placeholder="Ej: 520.000"
              required
              className="w-full px-4 py-2.5 rounded-xl border border-border tabular-nums focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary" disabled={saving}>
              {saving ? 'Guardando...' : editTarget ? 'Actualizar' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
