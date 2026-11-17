/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function BrandEmblem({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3.5">
      <svg
        viewBox="0 0 64 64"
        className={compact ? 'h-9 w-9 shrink-0' : 'h-12 w-12 shrink-0 sm:h-14 sm:w-14'}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="av-gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
        </defs>
        <rect
          x="3"
          y="3"
          width="58"
          height="58"
          rx="12"
          fill="#11151d"
          stroke="#f59e0b"
          strokeOpacity="0.45"
          strokeWidth="2"
        />
        <path
          d="M12 36 A20 20 0 0 1 52 36"
          fill="none"
          stroke="url(#av-gold)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path d="M12 40 H52" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" />
        <path
          d="M32 15 L43 44 H36.5 L32 31 L27.5 44 H21 Z"
          fill="#f8fafc"
        />
        <circle cx="32" cy="23" r="3.2" fill="#f59e0b" />
        <path d="M18 49 H46" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <div className="min-w-0">
        <div
          className={`font-display font-bold tracking-tight text-slate-50 leading-none ${
            compact ? 'text-lg' : 'text-3xl sm:text-5xl'
          }`}
        >
          ANGOLA VIRTUAL
        </div>
        {!compact && (
          <p className="mt-1.5 text-xs sm:text-sm text-amber-300/90 font-medium tracking-wide">
            Luanda · Bairro Prenda · Unidade de Vizinhança n.º 1
          </p>
        )}
      </div>
    </div>
  );
}
