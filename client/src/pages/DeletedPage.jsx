import { useEffect, useState } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useFiles } from '../context/FilesContext';
import { useFiltered } from '../hooks/useSearchFilter';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import api from '../utils/api';

export default function DeletedPage() {
  const { restoreDocument, refresh } = useFiles();
  const [deleted, setDeleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const filtered = useFiltered(deleted, d => d.name);

  const load = () => {
    setLoading(true);
    api.get('/documents/deleted')
      .then(r => setDeleted(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (docId) => {
    await restoreDocument(docId);
    load();
    await refresh();
  };

  if (loading) return <p className="text-xs text-gray-400 py-8 text-center">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Deleted Files"
        eyebrow="Trash"
        description="Restore files deleted in the last 30 days"
      />
      {filtered.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Deleted files will appear here until permanently removed."
        />
      ) : (
        <ul className="surface-panel divide-y divide-brand-mist overflow-hidden">
          {filtered.map(doc => (
            <li key={doc._id} className="flex items-center gap-3 px-4 py-3 hover:bg-brand-mist/60 text-xs transition-colors">
              <div className="w-9 h-9 rounded-xl bg-brand-mist text-gray-500 flex items-center justify-center shrink-0">
                <Trash2 size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{doc.name}</p>
                <p className="text-[10px] text-gray-500">
                  Deleted {doc.deletedAt
                    ? formatDistanceToNow(new Date(doc.deletedAt), { addSuffix: true })
                    : 'recently'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(doc._id)}
                className="btn-secondary py-1.5 text-[11px]"
              >
                <RotateCcw size={12} />
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
