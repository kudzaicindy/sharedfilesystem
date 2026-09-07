import { Folder, MoreVertical } from 'lucide-react';

export default function FolderCard({
  folder,
  subtitle,
  ownerName,
  onClick,
  onMenu,
}) {
  const line = subtitle || (ownerName ? ownerName : 'Folder');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className="group relative flex items-center gap-2 rounded-lg border border-brand-sand/90 bg-white px-2 py-1.5 text-left
        shadow-card hover:border-brand-navy/20 hover:bg-brand-mist/40
        transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/25"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-maroon-light text-brand-maroon">
        <Folder size={14} className="fill-brand-maroon/15" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1 pr-5">
        <h3 className="text-[11px] font-semibold text-brand-ink truncate leading-tight">{folder.name}</h3>
        <p className="text-[9px] text-gray-500 truncate">{line}</p>
      </div>
      {onMenu && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMenu?.(folder, e.currentTarget);
          }}
          className="absolute top-1 right-1 p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-white hover:text-brand-navy"
          aria-label={`Options for ${folder.name}`}
        >
          <MoreVertical size={12} />
        </button>
      )}
    </div>
  );
}
