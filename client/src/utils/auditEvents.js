/** Tell Activity sidebars / feeds to reload after a document is saved. */
export function notifyAuditRefresh(docId) {
  window.dispatchEvent(
    new CustomEvent('audit:refresh', { detail: { docId: docId ? String(docId) : null } }),
  );
}
