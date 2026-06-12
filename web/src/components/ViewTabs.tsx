'use client';

import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { isValidViewName } from '@/lib/saved-views';
import type { SavedView } from '@/lib/saved-views';

interface ViewTabsProps {
  views: readonly SavedView[];
  activeViewId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onSave: (name: string) => void;
}

export default function ViewTabs({
  views,
  activeViewId,
  onSelect,
  onDelete,
  onSave,
}: ViewTabsProps) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const closeForm = () => {
    setSaving(false);
    setName('');
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setError('Enter a name');
      return;
    }
    if (!isValidViewName(views, name)) {
      setError('Name already in use');
      return;
    }
    onSave(name);
    closeForm();
  };

  const onFormKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Close the popover ourselves; the global Escape handler would only
    // blur the input and leave it open.
    event.stopPropagation();
    closeForm();
  };

  return (
    <div
      role="tablist"
      aria-label="Saved views"
      className="flex items-center gap-1 overflow-x-auto border-b border-edge bg-panel px-3 py-1.5"
    >
      {views.map((view, index) => {
        const active = view.id === activeViewId;
        return (
          <div
            key={view.id}
            role="tab"
            aria-selected={active}
            className={`flex h-7 shrink-0 items-center rounded-sm border transition-colors ${
              active
                ? 'border-accent/60 bg-accent/15'
                : 'border-edge bg-panel-2 hover:border-edge-2'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(view.id)}
              className={`flex h-full items-center gap-1.5 px-2 font-mono text-[11px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70 ${
                active ? 'text-fore' : 'text-faint hover:text-fore'
              }`}
            >
              {index < 9 && (
                <span aria-hidden className="text-dim">
                  {index + 1}
                </span>
              )}
              {view.name}
            </button>
            {!view.builtIn && (
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                onClick={() => onDelete(view.id)}
                className="h-full pl-0.5 pr-1.5 font-mono text-[11px] text-dim transition-colors hover:text-amber-300 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70"
              >
                ×
              </button>
            )}
          </div>
        );
      })}

      <div className="relative shrink-0">
        <button
          type="button"
          aria-label="Save current view"
          aria-expanded={saving}
          onClick={() => (saving ? closeForm() : setSaving(true))}
          className="h-7 rounded-sm border border-edge bg-panel-2 px-2 font-mono text-[11px] text-faint transition-colors hover:border-edge-2 hover:text-fore focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70"
        >
          +
        </button>
        {saving && (
          <form
            onSubmit={submit}
            onKeyDown={onFormKeyDown}
            className="absolute left-0 top-full z-20 mt-1 flex w-64 flex-col gap-1.5 rounded-sm border border-edge bg-panel-2 p-2 shadow-lg"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
              Save current view
            </span>
            <input
              autoFocus
              type="text"
              aria-label="View name"
              placeholder="view name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              className="h-7 rounded-sm border border-edge bg-panel px-2 font-mono text-[11px] text-fore placeholder:text-dim outline-none transition-colors focus:border-accent/60"
            />
            {error !== null && (
              <span role="alert" className="text-[11px] text-amber-300">
                {error}
              </span>
            )}
            <button
              type="submit"
              className="h-7 rounded-sm border border-accent/60 bg-accent/15 px-2 font-mono text-[11px] text-fore transition-colors hover:bg-accent/25 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent/70"
            >
              Save
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
