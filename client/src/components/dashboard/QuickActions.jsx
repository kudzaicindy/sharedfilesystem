import { Send, FolderPlus, Upload, Plus, Pencil } from 'lucide-react';

export default function QuickActions({ onAction, uploading, inFolder = false }) {
  const actions = [
    { id: 'create', label: 'Create', icon: Plus, primary: true },
    { id: 'upload', label: uploading ? 'Uploading…' : 'Upload', icon: Upload },
    {
      id: 'folder',
      label: inFolder ? 'Subfolder' : 'Folder',
      icon: FolderPlus,
    },
    { id: 'send', label: 'Send', icon: Send },
    { id: 'edit-pdf', label: 'Edit PDF', icon: Pencil },
  ];

  return (
    <div className="grid grid-cols-5 gap-1.5 mb-3">
      {actions.map(({ id, label, icon: Icon, primary }) => (
        <button
          key={id}
          type="button"
          disabled={uploading && id === 'upload'}
          onClick={() => onAction(id)}
          className={`flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg border text-center
            transition-colors min-h-[52px]
            ${primary
              ? 'bg-brand-navy border-brand-navy text-white hover:bg-brand-navy-soft'
              : 'bg-white border-brand-sand hover:border-brand-navy/20 hover:bg-brand-mist/50'}
            disabled:opacity-60`}
        >
          <Icon size={13} strokeWidth={1.85} className={primary ? 'text-white' : 'text-brand-navy'} />
          <span className={`text-[10px] font-semibold leading-tight ${primary ? 'text-white' : 'text-brand-ink'}`}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}
