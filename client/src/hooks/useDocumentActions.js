import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api, {
  openDocumentInBrowser,
  downloadDocument,
  isDesktopOfficeFile,
} from '../utils/api';
import { saveEditorReturnPath } from '../utils/editorNavigation';
import { useLocalEdit } from '../context/LocalEditContext';
import {
  preloadOnlyOfficeApi,
  fetchOnlyOfficeConfig,
  clearCachedOnlyOfficeConfig,
} from '../utils/onlyOfficePreload';

import {
  isOnlyOfficeConfigured,
  isOnlyOfficeFileExt,
  pickDefaultOpenChoice,
  getFallbackEditorPath,
} from '../utils/onlyOfficeAvailability';

/** Warm config + DocsAPI before the editor route mounts. */
function warmOnlyOffice(docId) {
  if (!isOnlyOfficeConfigured()) return;
  clearCachedOnlyOfficeConfig(docId);
  preloadOnlyOfficeApi();
  fetchOnlyOfficeConfig(docId).catch(() => {});
}

export function useDocumentActions({ alert, openWith, onShowActivity }) {
  const navigate = useNavigate();
  const { startLocalEdit } = useLocalEdit();

  const runOpenChoice = useCallback(async (doc, choice) => {
    if (!choice) return;

    const isEditorRoute = ['onlyoffice', 'docx-editor', 'collab-docx', 'xlsx-editor', 'ms365'].includes(choice);
    if (!isEditorRoute) {
      api.post('/sends/track/open', { documentId: doc._id }).catch(() => {});
    }

    if (choice === 'browser') {
      openDocumentInBrowser(doc._id, { sameTab: true });
      return;
    }
    if (choice === 'onlyoffice') {
      if (!isOnlyOfficeConfigured()) {
        const ext = doc?.name?.split('.')?.pop()?.toLowerCase() || '';
        const fallback = getFallbackEditorPath(doc._id, ext);
        if (fallback) {
          saveEditorReturnPath();
          navigate(fallback);
          return;
        }
      }
      warmOnlyOffice(doc._id);
      saveEditorReturnPath();
      navigate(`/editor/${doc._id}`);
      return;
    }
    if (choice === 'ms365') {
      saveEditorReturnPath();
      navigate(`/ms365/${doc._id}`);
      return;
    }
    if (choice === 'docx-editor') {
      saveEditorReturnPath();
      navigate(`/docx-editor/${doc._id}`);
      return;
    }
    if (choice === 'collab-docx') {
      saveEditorReturnPath();
      navigate(`/collab/${doc._id}`);
      return;
    }
    if (choice === 'xlsx-editor') {
      saveEditorReturnPath();
      navigate(`/xlsx-editor/${doc._id}`);
      return;
    }
    if (choice === 'office-desktop' || choice === 'app') {
      await startLocalEdit(doc);
    }
  }, [navigate, startLocalEdit]);

  /** Primary Open — simple editors in production; OnlyOffice when configured. */
  const handleOpen = useCallback(async (doc) => {
    try {
      const ext = doc?.name?.split('.')?.pop()?.toLowerCase() || '';
      if (isOnlyOfficeFileExt(ext)) {
        const defaultChoice = pickDefaultOpenChoice({
          ext,
          browserOk: false,
          officeDesktopOk: ['doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx'].includes(ext),
        });
        if (defaultChoice === 'onlyoffice') {
          warmOnlyOffice(doc._id);
          saveEditorReturnPath();
          navigate(`/editor/${doc._id}`);
          return;
        }
        if (['collab-docx', 'docx-editor', 'xlsx-editor'].includes(defaultChoice)) {
          saveEditorReturnPath();
          await runOpenChoice(doc, defaultChoice);
          return;
        }
        const choice = await openWith?.(doc);
        await runOpenChoice(doc, choice || 'browser');
        return;
      }

      // PDFs / images → browser preview
      const choice = await openWith?.(doc);
      await runOpenChoice(doc, choice || 'browser');
    } catch (err) {
      await alert?.(
        err.response?.data?.message || err.message || 'Could not open this file.',
        'File unavailable',
      );
    }
  }, [alert, navigate, openWith, runOpenChoice]);

  /** Explicit “Open with…” picker (OnlyOffice / M365 / desktop / etc.). */
  const handleOpenWith = useCallback(async (doc) => {
    try {
      const choice = await openWith?.(doc);
      if (!choice) return;
      await runOpenChoice(doc, choice);
    } catch (err) {
      await alert?.(
        err.response?.data?.message || err.message || 'Could not open this file.',
        'File unavailable',
      );
    }
  }, [alert, openWith, runOpenChoice]);

  const handleDownload = useCallback(async (doc) => {
    try {
      await downloadDocument(doc._id, doc.name);
    } catch (err) {
      await alert?.(
        err.response?.data?.message || 'Could not download this file. Try uploading it again.',
        'Download failed',
      );
    }
  }, [alert]);

  const handleActivity = useCallback((doc) => {
    onShowActivity?.(doc);
  }, [onShowActivity]);

  return { handleOpen, handleOpenWith, handleDownload, handleActivity, isDesktopOfficeFile };
}
