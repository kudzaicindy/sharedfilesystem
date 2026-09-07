import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useFiltered } from '../hooks/useSearchFilter';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import FolderCard from '../components/dashboard/FolderCard';
import api from '../utils/api';

export default function SharedPage() {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const filteredIncoming = useFiltered(incoming, f => `${f.name} ${f.owner?.name || ''}`);
  const filteredOutgoing = useFiltered(outgoing, f => `${f.name} ${f.members?.map(m => m.user?.name || '').join(' ') || ''}`);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/folders/shared'),
      api.get('/folders/shared-by-me'),
    ])
      .then(([a, b]) => {
        setIncoming(a.data || []);
        setOutgoing(b.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-xs text-gray-400 py-8 text-center">Loading…</p>;

  return (
    <>
      <PageHeader
        title="Shared"
        eyebrow="Collaboration"
        description="Folders shared with you and folders you shared with others"
      />
      {filteredIncoming.length === 0 && filteredOutgoing.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing shared yet"
          description="When someone shares a folder with you, it will appear here."
        />
      ) : (
        <div className="space-y-4">
          <section>
            <h2 className="section-label mb-3">Shared with you</h2>
            {filteredIncoming.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                No folders shared with you yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                {filteredIncoming.map(folder => (
                  <FolderCard
                    key={folder._id}
                    folder={folder}
                    ownerName={folder.owner?.name || 'Unknown'}
                    onClick={() => {}}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="section-label mb-3">Shared by you</h2>
            {filteredOutgoing.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
                You haven’t shared any folders yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
                {filteredOutgoing.map(folder => (
                  <FolderCard
                    key={folder._id}
                    folder={folder}
                    ownerName="You"
                    onClick={() => {}}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
