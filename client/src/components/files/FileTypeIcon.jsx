function extFromName(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

function PdfIcon({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path fill="currentColor" d="M6 2h8l4 4v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" opacity="0.2" />
      <path fill="currentColor" d="M14 2v4a2 2 0 0 0 2 2h4v2h-4a4 4 0 0 1-4-4V2h2z" />
      <path fill="currentColor" d="M7.2 16.8v-6h2.3c1.6 0 2.6.9 2.6 2.3 0 1.4-1 2.3-2.6 2.3H8.9v1.4H7.2zm1.7-2.8h.6c.7 0 1.1-.3 1.1-.9 0-.6-.4-.9-1.1-.9h-.6V14zM13 16.8v-6h2.1c1.9 0 3.1 1.1 3.1 3s-1.2 3-3.1 3H13zm1.7-1.4h.4c1 0 1.6-.6 1.6-1.6 0-1-.6-1.6-1.6-1.6h-.4v3.2z" />
    </svg>
  );
}

function WordIcon({ className, style }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
      <path fill="currentColor" d="M6 2h8l4 4v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" opacity="0.2" />
      <path fill="currentColor" d="M14 2v4a2 2 0 0 0 2 2h4v2h-4a4 4 0 0 1-4-4V2h2z" />
      <path fill="currentColor" d="M7.2 16.8l-1.4-6h1.7l.7 3.6.8-3.6h1.4l.8 3.6.7-3.6H14l-1.4 6h-1.6l-.8-3.4-.8 3.4H7.2z" />
      <path fill="currentColor" d="M14.8 16.8v-6h3.8v1.4h-2.1v1h1.9v1.4h-1.9v2.2h-1.7z" opacity="0.65" />
    </svg>
  );
}

export default function FileTypeIcon({ name, size = 16 }) {
  const ext = extFromName(name);
  const base = `inline-block shrink-0`;
  const style = { width: size, height: size };

  if (ext === 'pdf') {
    return (
      <span className="inline-flex items-center justify-center rounded bg-red-50 text-red-600" style={{ width: size + 10, height: size + 10 }}>
        <PdfIcon className={base} style={style} />
      </span>
    );
  }
  if (ext === 'doc' || ext === 'docx') {
    return (
      <span className="inline-flex items-center justify-center rounded bg-blue-50 text-blue-600" style={{ width: size + 10, height: size + 10 }}>
        <WordIcon className={base} style={style} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center rounded bg-gray-100 text-gray-600" style={{ width: size + 10, height: size + 10 }}>
      <WordIcon className={base} style={style} />
    </span>
  );
}

