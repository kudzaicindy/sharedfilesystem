import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { FolderOpen, FileText, Users, Sparkles } from 'lucide-react';
import { useFiles } from '../context/FilesContext';
import { useModal } from '../components/modals/ModalProvider';
import { useDocumentActions } from '../hooks/useDocumentActions';
import { useAuth } from '../context/AuthContext';
import QuickActions from '../components/dashboard/QuickActions';
import FileCard from '../components/dashboard/FileCard';
import AuditSidebar from '../components/AuditSidebar/AuditSidebar';
import api from '../utils/api';

function StatCard({ icon: Icon, label, value, to, accent = false }) {
  const inner = (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-200
        ${accent
          ? 'border-brand-navy/40 bg-brand-navy text-white shadow-soft'
          : 'border-brand-sand bg-white shadow-card hover:border-brand-navy/20 hover:shadow-soft'}`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0
          ${accent ? 'bg-white/10 text-white' : 'bg-brand-maroon-light text-brand-maroon'}`}
      >
        <Icon size={15} />
      </div>
      <div className="min-w-0 leading-tight">
        <p className={`text-lg font-extrabold tabular-nums tracking-tight ${accent ? 'text-white' : 'text-brand-ink'}`}>
          {value}
        </p>
        <p className={`text-[10px] font-semibold ${accent ? 'text-white/65' : 'text-gray-500'}`}>{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function HomeDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { folders, documents, loading, uploading, createFolder, openUploadDialog } = useFiles();
  const { alert, openWith } = useModal();
  const [activity, setActivity] = useState([]);
  const [sharedCount, setSharedCount] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

  const { handleOpen, handleDownload, handleActivity } = useDocumentActions({
    alert,
    openWith,
    onShowActivity: (doc) => {
      setSelectedDoc(doc);
      setShowAudit(true);
    },
  });

  const loadActivity = useCallback(() => {
    api.get('/audit/feed', { params: { limit: 8 } }).then(r => setActivity(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadActivity(); }, [loadActivity]);

  useEffect(() => {
    const onRefresh = () => loadActivity();
    window.addEventListener('audit:refresh', onRefresh);
    return () => window.removeEventListener('audit:refresh', onRefresh);
  }, [loadActivity]);

  useEffect(() => {
    Promise.all([
      api.get('/folders/shared').then(r => r.data || []).catch(() => []),
      api.get('/folders/shared-by-me').then(r => r.data || []).catch(() => []),
    ]).then(([incoming, outgoing]) => {
      setSharedCount((incoming?.length || 0) + (outgoing?.length || 0));
    });
  }, []);

  const handleQuickAction = (id) => {
    if (id === 'create' || id === 'upload') openUploadDialog();
    else if (id === 'folder') createFolder();
    else if (id === 'send') navigate('/send-track');
    else alert('This feature is coming soon.', 'Coming soon');
  };

  if (loading) {
    return <p className="text-xs text-gray-400 py-16 text-center animate-pulse">Loading workspace…</p>;
  }

  const recentFiles = documents.slice(0, 6);
  const firstName = user?.name?.split(' ')[0] || 'there';

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br from-brand-navy via-[#102844] to-[#152238] text-white p-5 sm:p-7 mb-4 shadow-lift">
        <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-brand-maroon/35 blur-3xl pointer-events-none" />
        <div className="absolute -left-8 bottom-0 w-40 h-40 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 mb-2">
              <Sparkles size={12} />
              Your workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-tight">
              Welcome back, {firstName}
            </h1>
            <p className="text-sm text-white/60 mt-1.5 max-w-md leading-relaxed">
              Share folders, co-edit Office files, and track every change in one place.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openUploadDialog()}
              className="px-3.5 py-2 rounded-xl bg-white text-brand-navy text-xs font-bold hover:bg-white/95 transition-colors shadow-soft"
            >
              Upload file
            </button>
            <Link
              to="/files"
              className="px-3.5 py-2 rounded-xl bg-white/10 text-white text-xs font-semibold hover:bg-white/15 border border-white/15 transition-colors"
            >
              Browse files
            </Link>
          </div>
        </div>
      </section>

      <QuickActions onAction={handleQuickAction} uploading={uploading} />

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <StatCard icon={FolderOpen} label="Folders" value={folders.length} to="/files" accent />
        <StatCard icon={FileText} label="Files" value={documents.length} to="/files" />
        <StatCard icon={Users} label="Shared" value={sharedCount} to="/shared" />
      </div>

      <div className="grid lg:grid-cols-5 gap-3">
        <section className="lg:col-span-3">
          <div className="flex items-center justify-between mb-2">
            <h2 className="section-title">Recent files</h2>
            <Link to="/files" className="text-[11px] font-semibold text-brand-maroon hover:underline">
              View all
            </Link>
          </div>
          {recentFiles.length === 0 ? (
            <div className="surface-panel px-3 py-8 text-center">
              <p className="text-[12px] font-bold text-brand-ink">No files yet</p>
              <button
                type="button"
                onClick={() => openUploadDialog()}
                className="mt-1.5 text-[11px] font-semibold text-brand-navy hover:underline"
              >
                Upload one
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {recentFiles.map(doc => (
                <FileCard
                  key={doc._id}
                  document={doc}
                  ownerName={doc.uploadedBy?.name || user?.name}
                  onOpen={handleOpen}
                  onDownload={handleDownload}
                  onActivity={handleActivity}
                />
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2">
          <h2 className="section-title mb-2">Activity</h2>
          <div className="surface-panel overflow-hidden max-h-72 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="text-[11px] text-gray-400 py-8 text-center">No activity yet</p>
            ) : (
              <ul className="divide-y divide-brand-mist">
                {activity.map(log => (
                  <li key={log._id} className="flex items-center gap-2 px-2.5 py-2 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded-md bg-brand-maroon-light text-brand-maroon capitalize shrink-0 font-bold text-[9px]">
                      {log.action}
                    </span>
                    <span className="truncate flex-1 text-gray-600">
                      <span className="font-semibold text-brand-ink">{log.userName}</span>
                      {' · '}
                      {log.resourceName}
                    </span>
                    <span className="text-[9px] text-gray-400 shrink-0">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {showAudit && selectedDoc && (
        <AuditSidebar resourceId={selectedDoc._id} onClose={() => setShowAudit(false)} />
      )}
    </>
  );
}
