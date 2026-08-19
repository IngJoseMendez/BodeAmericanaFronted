import { useState, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, Badge, useToast, useConfirm } from '../components/common';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, UserX, UserCheck, User, Shield, Users, Eye, EyeOff } from 'lucide-react';

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { usuario: usuarioActual } = useAuth();

  const [formData, setFormData] = useState({
    usuario: '',
    password: '',
    passwordActual: '',
    nombre: '',
    rol: 'vendedor'
  });
  const [mostrarPassword, setMostrarPassword] = useState(false);

  // El servidor sólo deja cambiar la contraseña de la persona que tiene la
  // sesión abierta (POST /auth/cambiar-password, con la contraseña actual como
  // prueba). Para el resto de usuarios no existe endpoint de cambio.
  const esMiCuenta = !!editando && !!usuarioActual && editando.id === usuarioActual.id;

  useEffect(() => {
    loadUsuarios();
  }, []);

  const loadUsuarios = async () => {
    try {
      setLoading(true);
      const data = await authApi.getUsers();
      setUsuarios(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditando(null);
    setFormData({ usuario: '', password: '', passwordActual: '', nombre: '', rol: 'vendedor' });
    setModalOpen(true);
  };

  const openEditModal = (user) => {
    setEditando(user);
    setFormData({
      usuario: user.username,
      password: '',
      passwordActual: '',
      nombre: user.nombre,
      rol: user.rol
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.usuario || !formData.nombre || !formData.rol) {
      addToast('Todos los campos son requeridos', 'error');
      return;
    }

    if (!editando && !formData.password) {
      addToast('Contraseña requerida', 'error');
      return;
    }

    if (formData.password && formData.password.length < 8) {
      addToast('Mínimo 8 caracteres en contraseña', 'error');
      return;
    }

    // El servidor exige la contraseña actual para aceptar el cambio; sin ella la
    // petición se rechazaba con un mensaje genérico.
    if (esMiCuenta && formData.password && !formData.passwordActual) {
      addToast('Escribe tu contraseña actual para poder cambiarla', 'error');
      return;
    }

    try {
      if (editando && esMiCuenta) {
        // Sobre la propia cuenta rol y estado están bloqueados, así que el PATCH
        // enviaría exactamente los mismos valores que ya tiene el servidor: no
        // cambia nada, ensucia la auditoría y —si el backend prohíbe que un
        // administrador se modifique a sí mismo— haría fallar el envío ANTES de
        // llegar al cambio de contraseña, que es lo único que esta pantalla
        // puede hacer aquí. Se va directo al endpoint de contraseña.
        if (!formData.password) {
          addToast('Escribe una contraseña nueva: es lo único que puedes cambiar de tu propia cuenta', 'info');
          return;
        }
        await authApi.cambiarPassword({
          passwordActual: formData.passwordActual,
          passwordNueva: formData.password,
        });
        addToast('Contraseña cambiada', 'success');
      } else if (editando) {
        // La contraseña NO viaja en este PATCH: el servidor sólo acepta ahí rol y
        // estado, así que lo escrito en el formulario se perdía en silencio y el
        // aviso decía igualmente "Usuario actualizado". Va por su propio endpoint.
        await authApi.updateUser(editando.id, {
          rol: formData.rol,
          estado: formData.estado || editando.estado
        });
        addToast('Usuario actualizado', 'success');
      } else {
        await authApi.createUser({
          usuario: formData.usuario,
          password: formData.password,
          nombre: formData.nombre,
          rol: formData.rol,
        });
        addToast('Usuario creado', 'success');
      }
      setModalOpen(false);
      loadUsuarios();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // No existe borrado de usuarios: esto activa o desactiva el acceso. El diálogo
  // anterior decía "se eliminará … no se puede deshacer" y, sobre alguien ya
  // desactivado, aceptarlo le DEVOLVÍA el acceso al sistema.
  const handleToggleEstado = async (user) => {
    const activo = user.estado === 'activo';
    const ok = await confirm({
      title: activo ? '¿Desactivar usuario?' : '¿Reactivar usuario?',
      message: activo
        ? `${user.nombre} (@${user.username}) no podrá volver a entrar al sistema hasta que lo reactives. No se borra ninguna información suya.`
        : `${user.nombre} (@${user.username}) volverá a tener acceso al sistema con su contraseña de siempre.`,
      confirmText: activo ? 'Desactivar' : 'Reactivar',
      variant: activo ? 'warning' : 'info',
    });
    if (!ok) return;
    try {
      await authApi.updateUser(user.id, { estado: activo ? 'inactivo' : 'activo' });
      addToast(activo ? 'Usuario desactivado' : 'Usuario reactivado', 'success');
      loadUsuarios();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getRolBadge = (rol) => {
    if (rol === 'admin') {
      return <Badge variant="primary"><Shield size={12} className="mr-1" />Admin</Badge>;
    }
    return <Badge variant="secondary"><User size={12} className="mr-1" />Vendedor</Badge>;
  };

  const getEstadoBadge = (estado) => {
    if (estado === 'activo') {
      return <Badge variant="success">Activo</Badge>;
    }
    return <Badge variant="error">Inactivo</Badge>;
  };

  return (
    <Layout title="Gestión de Usuarios" subtitle="Administrar usuarios del sistema" actions={
      <Button onClick={openCreateModal}>
        <Plus size={18} className="mr-1" /> Nuevo Usuario
      </Button>
    }>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Users size={48} className="mx-auto mb-2 opacity-50" />
          <p>No hay usuarios del sistema</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {usuarios.map((user) => (
            <Card key={user.id} hover>
              <CardBody className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User size={24} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-primary">{user.nombre}</h3>
                    <p className="text-sm text-gray-500">@{user.username}</p>
                    <div className="flex gap-2 mt-1">
                      {getRolBadge(user.rol)}
                      {getEstadoBadge(user.estado)}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(user)}
                    title={`Editar ${user.nombre}`}
                    aria-label={`Editar ${user.nombre}`}
                  >
                    <Edit2 size={16} />
                  </Button>
                  {/* El icono cambia con el estado: con una papelera igual para
                      todos no había forma de anticipar si se iba a quitar o a
                      devolver el acceso. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleEstado(user)}
                    disabled={user.id === usuarioActual?.id}
                    title={
                      user.id === usuarioActual?.id
                        ? 'No puedes desactivar tu propia cuenta'
                        : user.estado === 'activo'
                          ? `Desactivar a ${user.nombre}`
                          : `Reactivar a ${user.nombre}`
                    }
                    aria-label={
                      user.estado === 'activo'
                        ? `Desactivar a ${user.nombre}`
                        : `Reactivar a ${user.nombre}`
                    }
                  >
                    {user.estado === 'activo' ? <UserX size={16} /> : <UserCheck size={16} />}
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Usuario' : 'Nuevo Usuario'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            {/* Etiquetas en text-primary y no text-gray-700: el gris fijo se
                quedaba oscuro en modo oscuro sobre la superficie oscura del
                modal y las etiquetas desaparecían. */}
            <label htmlFor="usuario-username" className="block text-sm font-medium text-primary mb-1">Usuario</label>
            <Input
              id="usuario-username"
              value={formData.usuario}
              onChange={(e) => setFormData({...formData, usuario: e.target.value})}
              placeholder="usuario"
              autoComplete="username"
              disabled={!!editando}
              required
            />
          </div>

          {!editando && (
            <div>
              <label htmlFor="usuario-password" className="block text-sm font-medium text-primary mb-1">Contraseña</label>
              <div className="relative">
                <Input
                  id="usuario-password"
                  type={mostrarPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  required={!editando}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                >
                  {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-muted mt-1">
                Mínimo 8 caracteres, mayúscula, minúscula, número y carácter especial
              </p>
            </div>
          )}

          {/* Sólo se ofrece el cambio de contraseña sobre la propia cuenta: es lo
              único que el servidor permite. Antes se mostraba para cualquiera y
              el valor nunca llegaba a guardarse. */}
          {editando && esMiCuenta && (
            <>
              <div>
                <label htmlFor="usuario-password-actual" className="block text-sm font-medium text-primary mb-1">Tu contraseña actual</label>
                <Input
                  id="usuario-password-actual"
                  type={mostrarPassword ? "text" : "password"}
                  value={formData.passwordActual}
                  onChange={(e) => setFormData({...formData, passwordActual: e.target.value})}
                  placeholder="Sólo si vas a cambiarla"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label htmlFor="usuario-password-nueva" className="block text-sm font-medium text-primary mb-1">Nueva contraseña (opcional)</label>
                <div className="relative">
                  <Input
                    id="usuario-password-nueva"
                    type={mostrarPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="Dejar vacío para mantener la actual"
                    autoComplete="new-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  >
                    {mostrarPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="text-xs text-muted mt-1">
                  Mínimo 8 caracteres, mayúscula, minúscula, número y carácter especial
                </p>
              </div>
            </>
          )}

          {editando && !esMiCuenta && (
            <p className="text-xs text-muted bg-cream border border-border rounded-lg p-3">
              De esta persona sólo puedes cambiar el rol y el estado. La contraseña
              y el nombre no se pueden modificar desde esta pantalla.
            </p>
          )}

          <div>
            <label htmlFor="usuario-nombre" className="block text-sm font-medium text-primary mb-1">Nombre completo</label>
            {/* En edición el servidor ignora el nombre (sólo acepta rol y estado):
                se deshabilita para no prometer un cambio que no ocurre. */}
            <Input
              id="usuario-nombre"
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
              placeholder="Nombre completo"
              autoComplete="name"
              disabled={!!editando}
              required
            />
          </div>

          {/* Sobre la propia cuenta, rol y estado quedan bloqueados: el botón de
              la lista ya impide autodesactivarse, pero desde aquí se podía hacer
              igual (o bajarse a vendedor) y quedarse fuera de esta pantalla sin
              nadie que lo deshiciera. */}
          <div>
            <label htmlFor="usuario-rol" className="block text-sm font-medium text-primary mb-1">Rol</label>
            <select
              id="usuario-rol"
              value={formData.rol}
              onChange={(e) => setFormData({...formData, rol: e.target.value})}
              disabled={esMiCuenta}
              className="w-full px-3 py-2 border border-border bg-surface text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="vendedor">Vendedor</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {editando && (
            <div>
              <label htmlFor="usuario-estado" className="block text-sm font-medium text-primary mb-1">Estado</label>
              <select
                id="usuario-estado"
                value={formData.estado || editando.estado}
                onChange={(e) => setFormData({...formData, estado: e.target.value})}
                disabled={esMiCuenta}
                className="w-full px-3 py-2 border border-border bg-surface text-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          )}

          {esMiCuenta && (
            <p className="text-xs text-muted">
              Es tu propia cuenta: aquí sólo puedes cambiar tu contraseña. Tu rol y tu estado
              los tiene que cambiar otro administrador.
            </p>
          )}
          
          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1">
              {editando ? 'Guardar Cambios' : 'Crear Usuario'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}