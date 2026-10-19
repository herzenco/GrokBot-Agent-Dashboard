"use client";

export function LogoMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="7" height="7" rx="2" />
      <rect x="13" y="2" width="7" height="7" rx="2" />
      <rect x="2" y="13" width="7" height="7" rx="2" />
      <circle cx="16.5" cy="16.5" r="3.5" />
    </svg>
  );
}

export function ActivityIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 8h3l2-5 2 10 2-5h3" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg className="icon-moon" width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M15 10.8A6.5 6.5 0 0 1 7.2 3a6.5 6.5 0 1 0 7.8 7.8Z" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg className="icon-sun" width="17" height="17" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="9" cy="9" r="3.5" />
      <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.7 3.7l1.4 1.4M12.9 12.9l1.4 1.4M3.7 14.3l1.4-1.4M12.9 5.1l1.4-1.4" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M7 1.5v11M1.5 7h11" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6.5l2.5 2.5L10 3.5" />
    </svg>
  );
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      aria-label="Toggle color theme"
      onClick={() => {
        const dark = document.documentElement.classList.toggle("dark");
        try {
          localStorage.setItem("ahq-theme", dark ? "dark" : "light");
        } catch {
          /* storage can be blocked */
        }
      }}
    >
      <SunIcon />
      <MoonIcon />
    </button>
  );
}
