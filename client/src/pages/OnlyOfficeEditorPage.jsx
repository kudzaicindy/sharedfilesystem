import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import api from '../utils/api';
import { goBackFromEditor } from '../utils/editorNavigation';
import { notifyAuditRefresh } from '../utils/auditEvents';
import { useDocumentPresence } from '../hooks/useDocumentPresence';
import {
  getCachedOnlyOfficeConfig,
  loadOnlyOfficeApi,
  preloadOnlyOfficeApi,
  fetchOnlyOfficeConfig,
} from '../utils/onlyOfficePreload';

export default function OnlyOfficeEditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const cached = getCachedOnlyOfficeConfig(docId);
  const [state, setState] = useState({
    loading: !cached,
    error: null,
    payload: cached,
  });
  const editorRef = useRef(null);
  const saveRefreshTimer = useRef(null);
  const openTrackedRef = useRef(false);
  const initGen = useRef(0);
  const othersEditing = useDocumentPresence(docId);

  const containerId = useMemo(() => `onlyoffice-editor-${docId}`, [docId]);

  const scheduleAuditRefresh = () => {
    if (saveRefreshTimer.current) clearTimeout(saveRefreshTimer.current);
    saveRefreshTimer.current = setTimeout(() => {
      notifyAuditRefresh(docId);
    }, 800);
  };

  const handleBack = async () => {
    try { editorRef.current?.destroyEditor?.(); } catch { /* ignore */ }
    editorRef.current = null;
    scheduleAuditRefresh();
    goBackFromEditor(navigate, '/files');
  };

  // Start script download immediately (in parallel with config)
  useEffect(() => {
    preloadOnlyOfficeApi();
  }, []);

  // Track open once, after editor is up — never compete with load
  useEffect(() => {
    if (openTrackedRef.current || !docId || !state.payload) return;
    openTrackedRef.current = true;
    const t = setTimeout(() => {
      api.post('/sends/track/open', { documentId: docId }).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [docId, state.payload]);

  // Fetch config (shared with Open warm-up — one request, not two)
  useEffect(() => {
    let cancelled = false;
    const hit = getCachedOnlyOfficeConfig(docId);
    if (hit) {
      setState({ loading: false, error: null, payload: hit });
      return undefined;
    }

    (async () => {
      try {
        setState(prev => ({ ...prev, loading: !prev.payload, error: null }));
        const data = await fetchOnlyOfficeConfig(docId);
        if (cancelled) return;
        setState({ loading: false, error: null, payload: data });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err.response?.data?.message || 'Could not start the editor. Is OnlyOffice running?',
          payload: null,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [docId]);

  // Init editor as soon as config + DocsAPI are ready (parallel wait)
  useEffect(() => {
    if (!state.payload) return undefined;

    const gen = ++initGen.current;
    let editor = null;
    let cancelled = false;

    (async () => {
      try {
        const { dsUrl, config, token } = state.payload;
        const DocsAPI = await loadOnlyOfficeApi(dsUrl);
        if (cancelled || gen !== initGen.current) return;
        if (!DocsAPI?.DocEditor) throw new Error('OnlyOffice editor API not available');

        // Avoid double-mount (React Strict Mode): destroy previous instance first
        try { editorRef.current?.destroyEditor?.(); } catch { /* ignore */ }

        const el = document.getElementById(containerId);
        if (!el) throw new Error('Editor container missing');
        el.innerHTML = '';

        editor = new DocsAPI.DocEditor(containerId, {
          ...config,
          token,
          width: '100%',
          height: '100%',
          events: {
            onDocumentStateChange(event) {
              if (event.data === false) scheduleAuditRefresh();
            },
          },
        });
        if (cancelled || gen !== initGen.current) {
          try { editor.destroyEditor?.(); } catch { /* ignore */ }
          return;
        }
        editorRef.current = editor;
      } catch (e) {
        if (!cancelled && gen === initGen.current) {
          setState(prev => ({ ...prev, error: e.message || 'Editor failed to load' }));
        }
      }
    })();

    return () => {
      cancelled = true;
      // Delay destroy so Strict Mode remount can reuse; only destroy if still this gen
      const dying = editor;
      setTimeout(() => {
        if (initGen.current !== gen) return;
        try { dying?.destroyEditor?.(); } catch { /* ignore */ }
        if (editorRef.current === dying) editorRef.current = null;
      }, 0);
    };
  }, [containerId, state.payload, docId]);

  useEffect(() => () => {
    if (saveRefreshTimer.current) clearTimeout(saveRefreshTimer.current);
    scheduleAuditRefresh();
  }, [docId]);

  const docTitle = state.payload?.config?.document?.title || (state.loading ? 'Loading…' : 'Document');
  const presenceLabel = othersEditing.length > 0
    ? `Also editing: ${othersEditing.map(u => u.name).join(', ')}`
    : null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <EditorTopBar onBack={handleBack} title={docTitle} presenceLabel={presenceLabel} />

      {state.error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-sm font-semibold text-gray-900">Editor unavailable</div>
          <div className="text-xs text-gray-500 max-w-md">{state.error}</div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white"
            onClick={handleBack}
          >
            Back to files
          </button>
        </div>
      )}

      {!state.error && (
        <div className="relative flex-1 min-h-0 w-full">
          {state.loading && !state.payload && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50 text-sm text-gray-500">
              Starting editor…
            </div>
          )}
          <div id={containerId} className="absolute inset-0 w-full h-full" />
        </div>
      )}
    </div>
  );
}

function EditorTopBar({ onBack, title, presenceLabel }) {
  return (
    <header className="shrink-0 flex flex-col border-b border-gray-200 bg-white z-[200] relative">
      <div className="h-11 flex items-center gap-2 px-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-gray-100 text-gray-700 text-xs font-medium"
          aria-label="Back to files"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <span className="text-xs text-gray-500 truncate flex-1">{title}</span>
      </div>
      <div
        className="px-3 py-1.5 text-[11px] font-medium text-sky-950 bg-sky-50 border-t border-sky-100"
        role="note"
      >
        Saves automatically · Press{' '}
        <kbd className="px-1 py-0.5 rounded bg-white border border-sky-200 text-sky-900 font-semibold text-[10px]">
          Ctrl+S
        </kbd>
        {' '}to save now (gray Save icon is normal).
      </div>
      {presenceLabel && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 border-t border-amber-100"
          role="status"
          aria-live="polite"
        >
          <Users size={14} className="shrink-0" aria-hidden />
          <span className="truncate">{presenceLabel}</span>
        </div>
      )}
    </header>
  );
}
