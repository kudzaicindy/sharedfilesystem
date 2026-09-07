import { useEffect, useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { useLocalEdit } from '../context/LocalEditContext';
import { useModal } from './modals/ModalProvider';

export default function LocalEditBanner({ onSaved }) {
  const { sessions, cancelLocalEdit, saveLocalEdit } = useLocalEdit();
  const { alert } = useModal();
  const inputRef = useRef(null);
  const [saving, setSaving] = useState(false);

  const active = sessions[0];
  const syncNotice = active?.syncNotice;

  useEffect(() => {
    if (syncNotice) onSaved?.();
  }, [syncNotice, onSaved]);

  if (!sessions.length) return null;

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSaving(true);
    try {
      await saveLocalEdit(active.docId, file);
      await alert?.(
        `“${file.name}” synced to Alamait. A new version was created.`,
        'Synced',
      );
      onSaved?.();
    } catch (err) {
      await alert?.(err.response?.data?.message || 'Could not sync file.', 'Sync failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5">
      <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-950">
            Open in desktop app
          </p>
          <p className="text-[11px] text-emerald-900/80">
            {active.syncNotice
              ? active.syncNotice
              : 'If Word saved only to your PC (Read-Only), use Sync below to upload that file so Alamait tracks it.'}
          </p>
          <p className="text-[11px] font-medium text-emerald-950 mt-0.5 truncate" title={active.name}>
            {active.name}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy text-white px-3 py-1.5 text-[11px] font-bold hover:bg-brand-navy/90 disabled:opacity-50"
          >
            <FileUp size={13} />
            {saving ? 'Syncing…' : 'Sync saved file'}
          </button>
          <button
            type="button"
            onClick={() => cancelLocalEdit(active.docId)}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white text-emerald-950 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-emerald-100"
          >
            <X size={13} />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
