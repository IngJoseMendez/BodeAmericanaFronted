import { useState } from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children, title, subtitle, actions }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream bg-pattern flex">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-border/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl text-primary">{title}</h1>
              {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-3">
              {actions}
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}