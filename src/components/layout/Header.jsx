export function Header({ title, subtitle, children }) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-surface border-b border-gray-100">
      <div>
        <h1 className="text-2xl font-display text-primary">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}