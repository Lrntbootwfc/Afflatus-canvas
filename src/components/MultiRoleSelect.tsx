import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Plus, ChevronDown } from 'lucide-react';
import { ROLE_CATEGORIES, ALL_ROLES } from '../constants/roles';

interface MultiRoleSelectProps {
  label: string;
  hint?: string;
  selected: string[];
  onChange: (roles: string[]) => void;
  required?: boolean;
  id?: string;
}

/**
 * Compact searchable multi-select for roles (chips + dropdown).
 * Reuses ROLE_CATEGORIES / ALL_ROLES from constants.
 */
export const MultiRoleSelect: React.FC<MultiRoleSelectProps> = ({
  label,
  hint,
  selected,
  onChange,
  required,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ROLE_CATEGORIES;
    return ROLE_CATEGORIES.map((cat) => ({
      category: cat.category,
      roles: cat.roles.filter(
        (r) => r.toLowerCase().includes(q) && !selected.includes(r)
      ),
    })).filter((c) => c.roles.length > 0);
  }, [query, selected]);

  const add = (role: string) => {
    if (!selected.includes(role)) onChange([...selected, role]);
    setQuery('');
  };

  const remove = (role: string) => {
    onChange(selected.filter((r) => r !== role));
  };

  const availableCount = ALL_ROLES.filter((r) => !selected.includes(r)).length;

  return (
    <div ref={rootRef} className="relative" id={id}>
      <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
        {label}
        {required ? ' *' : ''}
      </label>
      {hint && (
        <p className="text-[10px] text-[var(--text-muted)] mb-2 leading-relaxed">{hint}</p>
      )}

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {selected.length === 0 ? (
          <span className="text-[11px] text-[var(--text-muted)] italic">No roles selected</span>
        ) : (
          selected.map((role) => (
            <span
              key={role}
              className="inline-flex items-center gap-1 max-w-full px-2.5 py-1 rounded-full text-[10px] font-medium bg-[var(--tag-bg)] text-[var(--text-primary)] border border-[var(--tag-border)]"
            >
              <span className="truncate">{role}</span>
              <button
                type="button"
                onClick={() => remove(role)}
                className="shrink-0 p-0.5 rounded-full hover:bg-[var(--card-inner-bg)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={`Remove ${role}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-[var(--input-bg)] border border-[var(--input-border)] rounded-2xl px-3.5 py-2.5 text-xs text-[var(--input-text)] hover:border-[var(--accent-amber)] transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <Plus className="w-3.5 h-3.5" />
          {selected.length === 0 ? 'Add role' : 'Add another role'}
          {availableCount > 0 && (
            <span className="text-[10px] opacity-70">({availableCount} available)</span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[var(--card-border)] flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles…"
              className="w-full bg-transparent text-xs text-[var(--input-text)] focus:outline-none placeholder:text-[var(--text-muted)]"
            />
          </div>
          <div className="max-h-52 overflow-y-auto scrollbar-thin p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-[var(--text-muted)] text-center">
                No matching roles
              </p>
            ) : (
              filtered.map((cat) => (
                <div key={cat.category} className="mb-1">
                  <p className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {cat.category}
                  </p>
                  {cat.roles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => add(role)}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl text-[11px] text-[var(--text-primary)] hover:bg-[var(--card-inner-bg)] transition-colors"
                    >
                      {role}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
