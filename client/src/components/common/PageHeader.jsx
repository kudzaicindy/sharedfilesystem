export default function PageHeader({ title, description, action, eyebrow }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0">
        {eyebrow && <p className="section-label mb-0.5">{eyebrow}</p>}
        <h1 className="text-[15px] font-extrabold text-brand-ink tracking-tight">{title}</h1>
        {description && (
          <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl leading-snug">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
