import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardBody, Button } from '../components/common';
import { Package, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream bg-pattern flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary to-accent mb-4">
            <Package className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-3xl text-primary">Bodega</h1>
          <p className="text-muted">Americana</p>
        </div>

        <Card hover className="animate-fade-in-up">
          <CardBody className="p-8">
            <h2 className="font-display text-xl text-center mb-6">Iniciar Sesión</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* role="alert" para que el lector de pantalla anuncie el fallo en
                  cuanto aparece, y colores de error (antes era cian decorativo,
                  el mismo tono que usa la app para adornos).

                  El fondo y el borde van en `style` y NO en clases: en este
                  proyecto tailwind.config.js declara los colores como
                  'var(--color-error)', y Tailwind 3 no sabe aplicar alfa a un
                  var(), así que descarta la utilidad entera — comprobado
                  generando el CSS: `bg-error/10` y `border-error/30` no producen
                  ninguna regla. Con clases, el aviso volvía a quedarse sin fondo
                  y con el borde gris por defecto, que es justo lo que se quería
                  arreglar. Las variables CSS sí funcionan (es lo que hace
                  ConfirmDialog). */}
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
                <label htmlFor="login-usuario" className="block text-sm font-medium text-primary mb-1">
                  Usuario
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" aria-hidden="true" />
                  <input
                    id="login-usuario"
                    name="username"
                    type="text"
                    placeholder="Usuario"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-surface text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-primary mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" aria-hidden="true" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Contraseña"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-12 py-3 rounded-xl border border-border bg-surface text-primary placeholder-muted focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                variant="secondary"
                className="w-full"
                loading={loading}
              >
                Entrar
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border/50">
              <p className="text-xs text-center mt-2">
                ¿No tienes cuenta? <Link to="/registro" className="text-secondary hover:underline">Regístrate aquí</Link>
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}