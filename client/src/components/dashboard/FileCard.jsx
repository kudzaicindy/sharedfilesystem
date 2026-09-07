import { ExternalLink, Download, History } from 'lucide-react';
import DocPreview from './DocPreview';
import FileTypeIcon from '../files/FileTypeIcon';

function fileTypeLabel(name) {
  const ext = name?.split('.').pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : 'FILE';
}

function ActionButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="p-1 rounded hover:bg-brand-maroon-light text-gray-400 hover:text-brand-maroon transition-colors"
    >
      <Icon size={11} />
    </button>
  );
}

export default function FileCard({ document, ownerName, onOpen, onDownload, onActivity }) {
  const type = fileTypeLabel(document.name);

  return (
    <div className="group bg-white border border-brand-sand/90 rounded-lg overflow-hidden text-left shadow-card
      hover:border-brand-navy/20 transition-colors">
      <button type="button" className="block w-full text-left" onClick={() => onOpen?.(document)}>
        <DocPreview document={document} />
      </button>
      <div className="px-1.5 py-1.5">
        <div className="flex items-start gap-1.5">
          <FileTypeIcon name={document.name} size={10} />
          <div className="min-w-0 flex-1">
            <h3 className="text-[11px] font-semibold text-brand-ink truncate leading-tight">{document.name}</h3>
            <p className="text-[9px] text-gray-500">{type} · {ownerName}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-0.5 mt-1 pt-1 border-t border-brand-mist">
          <ActionButton icon={ExternalLink} label="Open" onClick={e => { e.stopPropagation(); onOpen?.(document); }} />
          <ActionButton icon={Download} label="Download" onClick={e => { e.stopPropagation(); onDownload?.(document); }} />
          <ActionButton icon={History} label="Activity" onClick={e => { e.stopPropagation(); onActivity?.(document); }} />
        </div>
      </div>
    </div>
  );
}
