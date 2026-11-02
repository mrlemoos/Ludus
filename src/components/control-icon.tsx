export function ControlIcon({ name }: { name: 'board' | 'flip' | 'look' | 'reset' }) {
  return (
    <svg
      className={`control-icon control-icon-${name}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'board' && (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M4 12h16M12 4v16" />
        </>
      )}
      {name === 'flip' && (
        <>
          <path d="M4 8h15l-4-4M20 16H5l4 4" />
          <path d="M19 8l-4 4M5 16l4-4" />
        </>
      )}
      {name === 'look' && (
        <>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === 'reset' && (
        <>
          <path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" />
        </>
      )}
    </svg>
  );
}
