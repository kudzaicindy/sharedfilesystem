const RETURN_KEY = 'editorReturnTo';

const EDITOR_PREFIXES = ['/editor/', '/docx-editor/', '/collab/', '/xlsx-editor/'];

function isEditorPath(path) {
  return EDITOR_PREFIXES.some(p => path.startsWith(p));
}

/** Call before navigating into a full-screen editor. */
export function saveEditorReturnPath() {
  const path = window.location.pathname + window.location.search;
  if (!isEditorPath(path)) {
    sessionStorage.setItem(RETURN_KEY, path || '/files');
  }
}

/** Return to the file list or wherever the user opened the editor from. */
export function goBackFromEditor(navigate, fallback = '/files') {
  const ret = sessionStorage.getItem(RETURN_KEY);
  const current = window.location.pathname;

  if (ret && ret !== current && !isEditorPath(ret)) {
    sessionStorage.removeItem(RETURN_KEY);
    navigate(ret);
    return;
  }

  if (window.history.length > 1) {
    navigate(-1);
    return;
  }

  navigate(fallback);
}
