import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Card, CardBody, Button } from '../components/common';
import { Sparkles, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Registro() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { establecerSesion } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    nombre: '',
    telefono: '',
    ciudad: '',
    tipo_cliente: 'mayorista',
    limite_credito: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await authApi.registro({
        ...formData,
        limite_credito: formData.limite_credito ? parseFloat(formData.limite_credito) : 0
      });

      // El registro ya devuelve token y usuario: se los pasamos al contexto en
      // vez de escribir localStorage a mano y recargar con window.location. Así,
      // si el navegador tiene bloqueado el almacenamiento del sitio (escribir
      // lanza SecurityError), la cuenta recién creada entra igual —la sesión vive
      // en memoria— en lugar de rebotar a /login como si el registro hubiera
      // fallado.
      establecerSesion(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Los campos comparten estilo: superficie y borde del tema, nunca blanco
  // translúcido. Con bg-primary + text-white/70 la pantalla era ilegible en modo
  // oscuro (el fondo se volvía casi blanco y las etiquetas seguían siendo blancas).
  const campo =
    'w-full px-4 py-3 rounded-xl border border-border bg-surface text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary';

  return (
    <div className="min-h-screen bg-cream bg-pattern flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-secondary to-accent mb-4">
            <Sparkles className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary">Comercio Global Logístico</h1>
          <p className="text-muted mt-2">Crear cuenta de cliente</p>
        </div>

        <Card className="animate-fade-in-up">
          <CardBody className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* role="alert" para que el lector de pantalla lo anuncie al aparecer.
                  Fondo y borde por variable CSS y no por clase: `bg-error/10` y
                  `border-error/30` no generan ninguna regla en este proyecto
                  (tailwind.config.js define los colores como 'var(--color-…)' y
                  Tailwind 3 no puede aplicarles alfa), así que el aviso se
                  quedaba otra vez sin fondo. */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 p-3 border text-error rounded-xl text-sm"
                  style={{
                    backgroundColor: 'transparent',
                    background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
                    borderColor: 'var(--color-error)',
                  }}
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="registro-nombre" className="block text-sm font-medium text-primary mb-2">
                  Nombre completo *
                </label>
                <input
                  id="registro-nombre"
                  name="nombre"
                  type="text"
                  autoComplete="name"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className={campo}
                  placeholder="Juan Pérez"
                  required
                />
              </div>

              <div>
                <label htmlFor="registro-usuario" className="block text-sm font-medium text-primary mb-2">
                  Usuario *
                </label>
                <input
                  id="registro-usuario"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className={campo}
                  placeholder="juan123"
                  required
                />
              </div>

              <div>
                <label htmlFor="registro-password" className="block text-sm font-medium text-primary mb-2">
                  Contraseña *
                </label>
                <div className="relative">
                  <input
                    id="registro-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`${campo} pr-12`}
                    placeholder="Mín 8 caracteres"
                    aria-describedby="registro-password-ayuda"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p id="registro-password-ayuda" className="text-xs text-muted mt-1">
                  Mín: 8 caracteres, mayúscula, minúscula, número, especial
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="registro-telefono" className="block text-sm font-medium text-primary mb-2">
                    Teléfono
                  </label>
                  <input
                    id="registro-telefono"
                    name="telefono"
                    type="tel"
                    autoComplete="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    className={campo}
                    placeholder="3001234567"
                  />
                </div>
                <div>
                  <label htmlFor="registro-ciudad" className="block text-sm font-medium text-primary mb-2">
                    Ciudad
                  </label>
                  <input
                    id="registro-ciudad"
                    name="ciudad"
                    type="text"
                    autoComplete="address-level2"
                    value={formData.ciudad}
                    onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
                    className={campo}
                    placeholder="Bogotá"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="registro-tipo-cliente" className="block text-sm font-medium text-primary mb-2">
                  Tipo de cliente
                </label>
                <select
                  id="registro-tipo-cliente"
                  name="tipo_cliente"
                  value={formData.tipo_cliente}
                  onChange={(e) => setFormData({ ...formData, tipo_cliente: e.target.value })}
                  className={campo}
                >
                  <option value="mayorista">Mayorista</option>
                  <option value="minorista">Minorista</option>
                </select>
              </div>

              <Button type="submit" variant="secondary" className="w-full" loading={loading}>
                Crear Cuenta
              </Button>

              <p className="text-center text-muted text-sm">
                ¿Ya tienes cuenta? <Link to="/login" className="text-secondary hover:underline">Iniciar sesión</Link>
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
