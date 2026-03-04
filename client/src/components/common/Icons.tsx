/**
 * SVG Icon components – bold uicon style inspired by Flaticon.
 * Each icon renders at 1em × 1em and inherits currentColor.
 */
interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const defaults = (props: IconProps) => ({
  width: props.size || '1em',
  height: props.size || '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  className: props.className,
  style: props.style,
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

// ── Navigation & General ──

export function IconHome(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 01-1.5 1.5h-4a1 1 0 01-1-1v-4.5a1 1 0 00-1-1h-3a1 1 0 00-1 1v4.5a1 1 0 01-1 1h-4A1.5 1.5 0 013 20V9.5z" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-1.42 3.42 2 2 0 01-1.41-.59l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-3.42-1.42 2 2 0 01.59-1.41l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 011.42-3.42 2 2 0 011.41.59l.06.06A1.65 1.65 0 009 4.6h.09a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06A2 2 0 0120.38 5a2 2 0 01-.58 1.42l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function IconHash(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <line x1="4" y1="9" x2="20" y2="9" />
      <line x1="4" y1="15" x2="20" y2="15" />
      <line x1="10" y1="3" x2="8" y2="21" />
      <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
  );
}

export function IconVolume(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function IconMicOff(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
      <path d="M17 16.95A7 7 0 015 12v-2m14 0v2c0 .36-.03.71-.08 1.06" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function IconHeadphones(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
    </svg>
  );
}

export function IconHeadphonesOff(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M3 18v-6a9 9 0 0118 0v6" />
      <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z" />
      <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.65 2.36a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.76.29 1.55.52 2.36.65A2 2 0 0122 16.92z" />
    </svg>
  );
}

export function IconPhoneOff(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.76.29 1.55.52 2.36.65A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-4.33-3.56" />
      <path d="M8.09 9.91l1.22-1.22a2 2 0 01-.45-2.11c.29-.76.52-1.55.65-2.36A2 2 0 0111.52 2h3a2 2 0 012 1.72" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

// ── Chat & Messages ──

export function IconSend(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function IconX(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M15.5 3.5L8 11l-2-2-3 3 5 5 3-3-2-2 7.5-7.5" />
      <path d="M18 2l4 4-4 4-4-4 4-4z" />
      <line x1="2" y1="22" x2="8.5" y2="15.5" />
    </svg>
  );
}

export function IconSmile(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3" />
      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3" />
    </svg>
  );
}

export function IconMessage(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
    </svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

// ── Status & Info ──

export function IconCircle(props: IconProps & { fill?: string }) {
  return (
    <svg width={props.size || '1em'} height={props.size || '1em'} viewBox="0 0 24 24" className={props.className} style={props.style}>
      <circle cx="12" cy="12" r="8" fill={props.fill || 'currentColor'} />
    </svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
    </svg>
  );
}

export function IconMinusCircle(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function IconHelpCircle(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
    </svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="3" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export function IconPalette(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.1 0 2-.9 2-2 0-.51-.19-.98-.51-1.35a1.7 1.7 0 01-.49-1.15c0-.93.76-1.7 1.7-1.7H17c2.76 0 5-2.24 5-5 0-4.97-4.48-8.8-10-8.8z" />
      <circle cx="6.5" cy="11.5" r="1.5" fill="currentColor" />
      <circle cx="9.5" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="14.5" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="17.5" cy="11.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconKeyboard(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
      <line x1="6" y1="8" x2="6.01" y2="8" strokeWidth="2" />
      <line x1="10" y1="8" x2="10.01" y2="8" strokeWidth="2" />
      <line x1="14" y1="8" x2="14.01" y2="8" strokeWidth="2" />
      <line x1="18" y1="8" x2="18.01" y2="8" strokeWidth="2" />
      <line x1="6" y1="12" x2="6.01" y2="12" strokeWidth="2" />
      <line x1="10" y1="12" x2="10.01" y2="12" strokeWidth="2" />
      <line x1="14" y1="12" x2="14.01" y2="12" strokeWidth="2" />
      <line x1="18" y1="12" x2="18.01" y2="12" strokeWidth="2" />
      <line x1="7" y1="16" x2="17" y2="16" />
    </svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2v11z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function IconTrashAccount(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <line x1="2" y1="2" x2="22" y2="22" strokeWidth="2.5" />
    </svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function IconCompass(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <svg {...defaults(props)}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
