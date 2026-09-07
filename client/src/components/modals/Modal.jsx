import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, footer, size = 'sm' }) {
  if (!open) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${widths[size]} bg-white rounded-xl shadow-xl border border-gray-100`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 pb-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function ModalButton({ variant = 'primary', children, ...props }) {
  const styles = {
    primary: 'bg-gray-900 bg-brand-navy text-white hover:bg-gray-800 hover:bg-brand-navy/90',
    secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
    danger: 'bg-brand-maroon text-white hover:bg-brand-maroon-dark',
  };
  return (
    <button
      type="button"
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${styles[variant]}`}
      {...props}
    >
      {children}
    </button>
  );
}

export { ModalButton };
