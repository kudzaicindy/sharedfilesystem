export default function CloudLogo({ className = 'w-8 h-8', variant = 'color' }) {
  const isLight = variant === 'light';
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect
        width="36"
        height="36"
        rx="10"
        fill={isLight ? 'rgba(255,255,255,0.12)' : '#7A1E2C'}
      />
      <path
        d="M26.2 16.1C25.5 12.4 22.2 9.8 18.4 9.8C15 9.8 12.1 11.9 10.8 14.8C8.3 15.2 6.2 17.4 6.2 20.1C6.2 23 8.6 25.4 11.5 25.4H26.2C28.7 25.4 30.8 23.3 30.8 20.8C30.8 18.3 28.7 16.3 26.2 16.1Z"
        fill={isLight ? '#fff' : '#fff'}
        fillOpacity={isLight ? 0.95 : 1}
      />
      <path
        d="M12.5 19.2H23.5M14.2 22H21.8"
        stroke={isLight ? '#0B1F3A' : '#7A1E2C'}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
