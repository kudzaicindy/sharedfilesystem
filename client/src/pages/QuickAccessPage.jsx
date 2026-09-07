import { useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFiles } from '../context/FilesContext';
import { useQuickAccess } from '../hooks/useQuickAccess';
import { useFiltered } from '../hooks/useSearchFilter';
import { QUICK_ACCESS_ITEMS } from '../config/navigation';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import FolderCard from '../components/dashboard/FolderCard';

export default function QuickAccessPage() {
  const { tag } = useParams();
  const { user } = useAuth();
  const { folders, loading } = useFiles();
  const { getFolderIds, togglePin, isPinned } = useQuickAccess();

  const meta = QUICK_ACCESS_ITEMS.find(q => q.id === tag) || { label: tag };
  const pinnedIds = getFolderIds(tag);
  const pinnedFolders = folders.filter(f => pinnedIds.includes(f._id));
  const filtered = useFiltered(pinnedFolders, f => f.name);

  if (loading) return <p className="text-xs text-gray-400 py-8 text-center">Loading…</p>;

  return (
    <>
      <PageHeader
        title={meta.label}
        eyebrow="Quick access"
        description="Pinned folders for quick access"
      />

      {folders.length > 0 && (
        <div className="mb-5 p-4 rounded-2xl border border-brand-sand bg-white/80 shadow-card">
          <p className="section-label mb-3">Pin folders to {meta.label}</p>
          <div className="flex flex-wrap gap-2">
            {folders.map(f => (
              <button
                key={f._id}
                type="button"
                onClick={() => togglePin(tag, f._id)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all
                  ${isPinned(tag, f._id)
                    ? 'bg-brand-maroon-light border-brand-maroon/25 text-brand-maroon-dark'
                    : 'bg-white border-brand-sand text-gray-600 hover:border-brand-navy/25'}`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Star}
          title={`No folders in ${meta.label}`}
          description="Use the buttons above to pin folders here."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {filtered.map(folder => (
            <FolderCard
              key={folder._id}
              folder={folder}
              ownerName={user?.name}
              onClick={() => {}}
            />
          ))}
        </div>
      )}
    </>
  );
}
