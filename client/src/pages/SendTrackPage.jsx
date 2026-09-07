import { Fragment, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Send, Plus, ChevronDown, ChevronUp, Eye, Pencil } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import SendDocumentModal from '../components/modals/SendDocumentModal';
import api from '../utils/api';

const STATUS_STYLES = {
  sent: 'bg-gray-100 text-gray-700',
  opened: 'bg-blue-100 text-blue-800',
  edited: 'bg-brand-maroon-light text-brand-maroon-dark',
};

const STATUS_LABELS = {
  sent: 'Delivered',
  opened: 'Opened',
  edited: 'Edited',
};

function EventIcon({ type }) {
  if (type === 'edited') return <Pencil size={12} className="text-brand-maroon" />;
  if (type === 'opened') return <Eye size={12} className="text-blue-600" />;
  return <Send size={12} className="text-gray-500" />;
}

export default function SendTrackPage() {
  const [sends, setSends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/sends/sent')
      .then(r => setSends(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openedCount = sends.filter(s => s.status === 'opened' || s.status === 'edited').length;
  const editedCount = sends.filter(s => s.status === 'edited').length;

  return (
    <>
      <PageHeader
        title="Send and Track"
        eyebrow="Outreach"
        description="Track who opened and edited files you sent"
        action={
          <button
            type="button"
            onClick={() => setSendOpen(true)}
            className="btn-primary"
          >
            <Plus size={14} />
            Send file
          </button>
        }
      />

      <div className="grid grid-cols-3 gap-1.5 mb-3">
        <div className="p-2.5 rounded-lg border border-brand-sand bg-white shadow-card">
          <p className="text-lg font-extrabold text-brand-ink tabular-nums">{sends.length}</p>
          <p className="text-[9px] font-semibold text-gray-500">Total sent</p>
        </div>
        <div className="p-2.5 rounded-lg border border-brand-sand bg-white shadow-card">
          <p className="text-lg font-extrabold text-brand-ink tabular-nums">{openedCount}</p>
          <p className="text-[9px] font-semibold text-gray-500">Opened</p>
        </div>
        <div className="p-2.5 rounded-lg border border-brand-sand bg-white shadow-card">
          <p className="text-lg font-extrabold text-brand-ink tabular-nums">{editedCount}</p>
          <p className="text-[9px] font-semibold text-gray-500">Edited</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 py-8 text-center">Loading…</p>
      ) : sends.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No sent files"
          description="Send a file to a colleague and track when they open or edit it."
          action={
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              className="btn-primary"
            >
              Send your first file
            </button>
          }
        />
      ) : (
        <div className="surface-panel overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-brand-mist/70 text-gray-500">
              <tr>
                <th className="text-left font-semibold px-4 py-3">File</th>
                <th className="text-left font-semibold px-4 py-3">Recipient</th>
                <th className="text-left font-semibold px-4 py-3">Access</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-left font-semibold px-4 py-3">Sent</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-mist">
              {sends.map(row => {
                const expanded = expandedId === row._id;
                return (
                  <Fragment key={row._id}>
                    <tr className="hover:bg-brand-mist/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-brand-ink">{row.documentName}</td>
                      <td className="px-4 py-3 text-gray-600">{row.recipientEmail}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize">{row.role}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${STATUS_STYLES[row.status]}`}>
                          {STATUS_LABELS[row.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {row.sentAt
                          ? formatDistanceToNow(new Date(row.sentAt), { addSuffix: true })
                          : '—'}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : row._id)}
                          className="p-1.5 rounded-lg hover:bg-white text-gray-400"
                        >
                          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-brand-mist/50">
                          <p className="section-label mb-2">
                            Activity timeline
                          </p>
                          {row.events?.length ? (
                            <ul className="space-y-2">
                              {[...row.events].reverse().map(ev => (
                                <li key={ev._id || `${ev.type}-${ev.timestamp}`} className="flex items-center gap-2 text-xs">
                                  <EventIcon type={ev.type} />
                                  <span className="capitalize font-semibold text-brand-ink">{ev.type}</span>
                                  <span className="text-gray-600">by {ev.userName || ev.userEmail}</span>
                                  <span className="text-gray-400 ml-auto">
                                    {formatDistanceToNow(new Date(ev.timestamp), { addSuffix: true })}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-gray-400">No activity yet.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SendDocumentModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={load}
      />
    </>
  );
}
