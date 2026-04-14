import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardBody, Button } from '../components/common';
import { Package, Lock, User, Eye, EyeOff } from 'lucide-react';

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
              {error && (
                <div className="p-3 bg-accent/10 text-accent rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type="text"
                  placeholder="Usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-3 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
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