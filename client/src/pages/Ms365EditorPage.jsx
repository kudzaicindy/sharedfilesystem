import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react';
import api from '../utils/api';
import { goBackFromEditor } from '../utils/editorNavigation';
import { useNavigate } from 'react-router-dom';
import { notifyAuditRefresh } from '../utils/auditEvents';

export default function Ms365EditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data: st } = await api.get('/ms365/status');
        if (cancelled) return;
        setStatus(st);

        if (!st.configured) {
          setError('Microsoft 365 is not configured. Add MS365_CLIENT_ID, MS365_CLIENT_SECRET, MS365_TENANT_ID, and MS365_REDIRECT_URI to server/.env.');
          setLoading(false);
          return;
        }
        if (!st.linked) {
          setLoading(false);
          return;
        }

        const { data } = await api.post(`/ms365/edit/${docId}`);
        if (cancelled) return;
        setSession(data);
        if (data.editUrl) window.open(data.editUrl, '_blank', 'noopener,noreferrer');
        setMessage(data.message || 'Opened in Microsoft 365 Online.');
      } catch (err) {
        if (cancelled) return;
        if (err.response?.data?.code === 'MS365_NOT_LINKED' || err.response?.status === 401) {
          setStatus((s) => ({ ...(s || {}), linked: false, configured: true }));
        } else {
          setError(err.response?.data?.message || 'Could not start Microsoft 365 editing.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const connect = async () => {
    try {
      const { data } = await api.get('/ms365/connect');
      window.location.href = data.url;
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start Microsoft sign-in.');
    }
  };

  const syncBack = async () => {
    if (!session?.driveItemId) return;
    setSyncing(true);
    setMessage('');
    try {
      const { data } = await api.post(`/ms365/sync/${docId}`, {
        driveItemId: session.driveItemId,
      });
      setMessage(data.message || 'Synced.');
      notifyAuditRefresh(docId);
    } catch (err) {
      setError(err.response?.data?.message || 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => goBackFromEditor(navigate, '/files')}
          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold text-slate-900 truncate">Microsoft 365 Online</h1>
          <p className="text-[11px] text-slate-500 truncate">{session?.name || 'Preparing…'}</p>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 shadow-sm p-5">
          {loading && <p className="text-xs text-slate-500">Starting Microsoft 365 session…</p>}

          {!loading && error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg p-3 mb-3">{error}</p>
          )}

          {!loading && status?.configured && !status?.linked && (
            <>
              <p className="text-xs text-slate-600 mb-4">
                Connect your Microsoft 365 account once. Alamait will copy the file to your OneDrive app folder, open it in Word/Excel Online, then sync your saves back.
              </p>
              <button
                type="button"
                onClick={connect}
                className="w-full bg-brand-navy text-white py-2 rounded-lg text-xs font-bold"
              >
                Connect Microsoft 365
              </button>
            </>
          )}

          {!loading && session && (
            <>
              {message && (
                <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-3">{message}</p>
              )}
              <div className="space-y-2">
                {session.editUrl && (
                  <a
                    href={session.editUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 border border-slate-200 py-2 rounded-lg text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    <ExternalLink size={14} />
                    Open again in Microsoft 365
                  </a>
                )}
                <button
                  type="button"
                  disabled={syncing}
                  onClick={syncBack}
                  className="w-full inline-flex items-center justify-center gap-1.5 bg-brand-navy text-white py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                  {syncing ? 'Syncing…' : 'Sync back to Alamait'}
                </button>
              </div>
            </>
          )}

          {!loading && !status?.configured && (
            <p className="text-[11px] text-slate-500 mt-2">
              Or use <Link className="text-brand-maroon font-semibold underline" to={`/editor/${docId}`}>OnlyOffice</Link> for tracked in-app editing.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
