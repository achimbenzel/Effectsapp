/** Minimal inline icon set (16px stroke icons matching the mono UI). */

interface IconProps {
  size?: number;
}

const S = (p: IconProps) => p.size ?? 16;

export const IconBrush = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.5 1.5l4 4L7 13H3v-4l7.5-7.5z" />
    <path d="M8.5 3.5l4 4" />
  </svg>
);

export const IconEraser = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 13L2.5 9.5a1.4 1.4 0 010-2L8 2a1.4 1.4 0 012 0l3.5 3.5a1.4 1.4 0 010 2L9 13H6z" />
    <path d="M5 6.5L9.5 11" />
    <path d="M6 13h8" />
  </svg>
);

export const IconUndo = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h7a3.5 3.5 0 110 7H6" />
    <path d="M6 3L3 6l3 3" />
  </svg>
);

export const IconRedo = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 6H6a3.5 3.5 0 100 7h4" />
    <path d="M10 3l3 3-3 3" />
  </svg>
);

export const IconDice = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <rect x="2" y="2" width="12" height="12" rx="2.5" />
    <circle cx="5.6" cy="5.6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.4" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="10.4" cy="5.6" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="5.6" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

export const IconFit = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4" />
  </svg>
);

export const IconZoomIn = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14M7 5v4M5 7h4" />
  </svg>
);

export const IconZoomOut = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14M5 7h4" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.8 9.5h6.4L12 4" />
  </svg>
);

export const IconFill = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5v3M8 4.5L3.5 9a1.5 1.5 0 000 2.1l1.4 1.4a1.5 1.5 0 002.1 0L11.5 8 8 4.5z" />
    <path d="M13.5 11.5s1 1.3 1 2a1 1 0 11-2 0c0-.7 1-2 1-2z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconImport = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2v8M5 7l3 3 3-3" />
    <path d="M2.5 11v2a1 1 0 001 1h9a1 1 0 001-1v-2" />
  </svg>
);

export const IconLogo = (p: IconProps) => (
  <svg width={S(p)} height={S(p)} viewBox="0 0 32 32" fill="none">
    <rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" strokeWidth="2.2" />
    <path d="M9 23l5-5v-6h5l4 4" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="23" r="2.4" fill="currentColor" />
    <circle cx="23" cy="16" r="2.4" fill="currentColor" />
  </svg>
);
