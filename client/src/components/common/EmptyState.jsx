import { Inbox } from 'lucide-react';

export function EmptyState({ icon: Icon = Inbox, title = 'Sin resultados', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
      <div className="p-4 bg-primary/5 rounded-2xl mb-4">
        <Icon className="w-8 h-8 text-muted/60" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-primary mb-1">{title}</p>
      {description && <p className="text-xs text-muted max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 text-xs font-semibold bg-secondary text-white rounded-xl hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
