import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '../common';
import { authApi } from '../../services/api';

export function Layout({ children, title, subtitle, actions }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-cream bg-pattern flex">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-border/50 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-xl bg-surface shadow-md hover:shadow-lg transition-all text-primary"
            >
              <Menu size={20} />
            </button>
            
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl sm:text-2xl text-primary truncate">{title}</h1>
              {subtitle && <p className="text-sm text-muted mt-0.5 hidden sm:block">{subtitle}</p>}
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {actions}
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                icon={LogOut}
                className="text-muted hover:text-accent"
              >
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}