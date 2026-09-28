import React from 'react';

type Props = {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
};

/**
 * Circular profile-completion indicator (0–100%).
 */
export const ProfileCompletionRing: React.FC<Props> = ({
  percent,
  size = 88,
  strokeWidth = 8,
  label = 'Complete',
  className = '',
}) => {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="block -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-[var(--card-border,#EAE2D5)] opacity-60"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="text-[var(--accent-amber,#E58B13)] transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold tabular-nums text-[var(--text-primary,#141210)] leading-none">
            {p}%
          </span>
        </div>
      </div>
      {label ? (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted,#8C7862)]">
          {label}
        </span>
      ) : null}
    </div>
  );
};
