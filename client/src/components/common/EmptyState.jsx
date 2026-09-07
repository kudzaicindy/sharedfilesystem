export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 surface-panel text-center">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-brand-maroon-light text-brand-maroon flex items-center justify-center mb-2.5">
          <Icon size={16} strokeWidth={1.5} />
        </div>
      )}
      <p className="text-[12px] font-bold text-brand-ink">{title}</p>
      {description && (
        <p className="text-[11px] text-gray-500 mt-1 max-w-sm leading-snug">{description}</p>
      )}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}
