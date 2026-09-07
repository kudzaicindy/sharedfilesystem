import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { isDesktopOfficeFile, openDocumentLocallyInOffice, openDocumentInBrowser } from '../utils/api';
import { resolveMimeType, canPreviewInBrowser } from '../utils/fileTypes';

const LocalEditContext = createContext(null);

export function LocalEditProvider({ children }) {
  const [sessions, setSessions] = useState([]);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const upsertSession = useCallback((session) => {
    setSessions((prev) => {
      const without = prev.filter((s) => s.docId !== session.docId);
      return [session, ...without];
    });
  }, []);

  const removeSession = useCallback((docId) => {
    setSessions((prev) => prev.filter((s) => s.docId !== docId));
  }, []);

  /**
   * Open for edit on this computer — never downloads.
   * Office → WebDAV + Word/Excel (Save in app syncs to Alamait).
   * Previewable → browser tab.
   */
  const startLocalEdit = useCallback(async (doc) => {
    if (isDesktopOfficeFile(doc.name)) {
      const { data } = await api.post(`/documents/${doc._id}/local-edit/start`);
      let lastVersionNum = null;
      try {
        const versions = await api.get(`/documents/${doc._id}/versions`);
        lastVersionNum = versions.data?.[0]?.versionNum ?? null;
      } catch {
        // ignore
      }
      const session = {
        docId: doc._id,
        name: doc.name,
        webdavUrl: data.webdavUrl,
        startedAt: Date.now(),
        mode: 'webdav',
        lastVersionNum,
        syncNotice: null,
      };
      upsertSession(session);
      openDocumentLocallyInOffice(doc._id, doc.name, data.webdavUrl);
      return session;
    }

    if (canPreviewInBrowser(resolveMimeType(doc))) {
      openDocumentInBrowser(doc._id, { sameTab: false });
      return null;
    }

    const err = new Error(
      'This file type can’t open in a desktop app from the browser without downloading. Use Download, or open Word/Excel/PowerPoint files with Open.',
    );
    err.code = 'NEEDS_DOWNLOAD';
    throw err;
  }, [upsertSession]);

  const saveLocalEdit = useCallback(async (docId, file) => {
    const form = new FormData();
    form.append('file', file);
    form.append('comment', 'Saved from desktop app');
    const { data } = await api.post(`/documents/${docId}/local-edit/save`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    removeSession(docId);
    return data;
  }, [removeSession]);

  const cancelLocalEdit = useCallback(async (docId) => {
    await api.post(`/documents/${docId}/local-edit/cancel`).catch(() => {});
    removeSession(docId);
  }, [removeSession]);

  // Detect Word/Excel saves via WebDAV (new versions)
  useEffect(() => {
    if (!sessions.length) return undefined;
    const id = window.setInterval(async () => {
      const current = sessionsRef.current;
      for (const s of current) {
        try {
          const { data: versions } = await api.get(`/documents/${s.docId}/versions`);
          const latest = versions?.[0];
          if (!latest) continue;
          if (s.lastVersionNum != null && latest.versionNum > s.lastVersionNum) {
            setSessions((prev) => prev.map((x) => (
              x.docId === s.docId
                ? {
                    ...x,
                    lastVersionNum: latest.versionNum,
                    syncNotice: `Saved — version ${latest.versionNum} tracked`,
                  }
                : x
            )));
          } else if (s.lastVersionNum == null) {
            setSessions((prev) => prev.map((x) => (
              x.docId === s.docId ? { ...x, lastVersionNum: latest.versionNum } : x
            )));
          }
        } catch {
          // ignore
        }
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [sessions.length]);

  const value = useMemo(() => ({
    sessions,
    startLocalEdit,
    saveLocalEdit,
    cancelLocalEdit,
    removeSession,
  }), [sessions, startLocalEdit, saveLocalEdit, cancelLocalEdit, removeSession]);

  return (
    <LocalEditContext.Provider value={value}>
      {children}
    </LocalEditContext.Provider>
  );
}

export function useLocalEdit() {
  const ctx = useContext(LocalEditContext);
  if (!ctx) throw new Error('useLocalEdit must be used within LocalEditProvider');
  return ctx;
}
