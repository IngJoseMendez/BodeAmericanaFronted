import { Component } from 'react';

// Sin esto, cualquier excepción durante el render deja la pantalla COMPLETAMENTE
// en blanco y sin pista de qué pasó: React desmonta todo el árbol. Con el límite
// de error, el fallo queda acotado y la persona ve qué ocurrió y cómo salir.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-cream p-6">
        <div className="max-w-lg w-full bg-surface border border-border rounded-2xl shadow-lg p-6 space-y-4">
          <div>
            <h1 className="text-xl font-display font-bold text-primary">
              Se rompió esta pantalla
            </h1>
            <p className="text-sm text-muted mt-1">
              El resto del sistema sigue funcionando. Vuelve al inicio o recarga la página.
            </p>
          </div>

          <pre className="text-xs bg-primary/5 border border-border rounded-xl p-3 overflow-x-auto text-error">
            {String(this.state.error?.message || this.state.error)}
          </pre>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:opacity-90"
            >
              Ir al inicio
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-primary hover:bg-primary/5"
            >
              Recargar
            </button>
          </div>

          <p className="text-xs text-muted">
            Si vuelve a pasar, toma una captura de este mensaje: dice exactamente qué falló.
          </p>
        </div>
      </div>
    );
  }
}
