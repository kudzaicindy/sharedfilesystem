import { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import api from '../../utils/api';
import { repairTextDiff } from '../../utils/textDiffDisplay';
import { humanizeChange, humanizeSummary } from '../../utils/humanizeDiff';

const ACTION_COLORS = {
  uploaded:  'bg-green-100 text-green-800',
  edited:    'bg-blue-100 text-blue-800',
  revision:  'bg-violet-100 text-violet-800',
  opened:    'bg-indigo-100 text-indigo-800',
  deleted:   'bg-red-100 text-red-800',
  restored:  'bg-yellow-100 text-yellow-800',
  shared:    'bg-purple-100 text-purple-800',
  moved:     'bg-orange-100 text-orange-800',
  renamed:   'bg-gray-100 text-gray-700',
  downloaded:'bg-cloudy-green-light text-cloudy-green-dark',
};

const ACTION_LABELS = {
  revision: 'edited',
  edited: 'saved version',
  opened: 'opened',
  uploaded: 'uploaded',
  downloaded: 'downloaded',
  deleted: 'deleted',
  restored: 'restored',
  shared: 'shared',
  moved: 'moved',
  renamed: 'renamed',
};

function formatLogTime(timestamp) {
  const d = new Date(timestamp);
  return {
    short: format(d, 'MMM d, yyyy · h:mm a'),
    full: format(d, 'PPpp'),
    relative: formatDistanceToNow(d, { addSuffix: true }),
  };
}

/** Turn stored diff (new or legacy patch) into summary + added/removed lists. */
function normalizeTextDiff(diff) {
  if (!diff) return null;
  diff = repairTextDiff(diff);

  if (diff.summary || diff.changes?.length || diff.added?.length || diff.removed?.length) {
    const norm = (item) => {
      if (typeof item === 'string') return { label: '', text: item };
      return { label: item.label || '', text: item.text ?? item.before ?? '' };
    };
    const changes = (diff.changes || []).map(c => ({
      ...c,
      ...(c.headline ? {} : humanizeChange(c)),
    }));
    return {
      summary: humanizeSummary(changes) || diff.summary || 'The form was updated.',
      changes,
      added: (diff.added || []).map(norm),
      removed: (diff.removed || []).map(norm),
      truncated: diff.truncated,
    };
  }

  if (!diff.patch) return null;

  const removed = [];
  const added = [];
  for (const line of String(diff.patch).split('\n')) {
    if (
      line.startsWith('---')
      || line.startsWith('+++')
      || line.startsWith('@@')
      || line.startsWith('Index:')
      || line.startsWith('===')
      || line.startsWith('\\')
    ) {
      continue;
    }
    if (line.startsWith('-')) removed.push(line.slice(1).trim());
    else if (line.startsWith('+')) added.push(line.slice(1).trim());
  }

  const hasLines = removed.length > 0 || added.length > 0;
  return {
    summary: hasLines
      ? `${removed.length} line(s) removed · ${added.length} line(s) added`
      : 'No wording changes detected — you may have only changed formatting, tables, or form fields.',
    added: added.slice(0, 40),
    removed: removed.slice(0, 40),
    truncated: removed.length > 40 || added.length > 40,
  };
}

function isNoTextChangeSummary(summary) {
  if (!summary) return true;
  return /no wording changes/i.test(summary) || /formatting|form fields|layout/i.test(summary);
}

function SessionEditors({ editors, multiEditor }) {
  if (!editors?.length) return null;
  return (
    <div className="mt-1.5 rounded-md border border-violet-100 bg-violet-50/90 px-2 py-1.5 text-[11px]">
      <p className="font-medium text-violet-950">
        {multiEditor ? 'Who edited before this save' : 'Edited by'}
      </p>
      <ul className="mt-1 space-y-0.5">
        {editors.map((rev, i) => (
          <li key={i} className="text-violet-900">
            <span className="font-medium text-gray-800">{rev.userName}</span>
            {' · '}
            {format(new Date(rev.at), 'h:mm:ss a')}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextChanges({ diff, revisionCount = 0, revisions = [] }) {
  const normalized = normalizeTextDiff(diff);
  const editors = diff?.editors?.length ? diff.editors : revisions;
  const multiEditor = Boolean(diff?.multiEditor) || (editors?.length > 1);
  const attributionNote = diff?.attributionNote;

  const hasTextLines = normalized && (
    normalized.changes?.length > 0
    || normalized.added.length > 0
    || normalized.removed.length > 0
  );
  const noTextButEdited = normalized && isNoTextChangeSummary(normalized.summary) && revisionCount > 0;
  const sessionEdits = Array.isArray(revisions) ? revisions : [];

  if (!normalized && revisionCount === 0) return null;

  if (noTextButEdited) {
    const editTimes = sessionEdits
      .map(r => format(new Date(r.at), 'h:mm a'))
      .join(', ');
    return (
      <div className="mt-1.5 rounded-md border border-amber-100 bg-amber-50/90 px-2 py-1.5 text-[11px] text-amber-950 leading-snug">
        <p className="font-medium">Edit recorded in the editor</p>
        <p className="mt-0.5 text-amber-900/90">
          {revisionCount === 1
            ? '1 change this session'
            : `${revisionCount} changes this session`}
          {editTimes ? ` (${editTimes})` : ''}.
          {' '}
          Forms, checkboxes, and tables often do not show up in a text summary here.
        </p>
        <p className="mt-1 text-[10px] text-amber-800/90">
          To see exactly what changed: open the file → <span className="font-medium">Review → Track Changes</span>.
        </p>
      </div>
    );
  }

  if (!hasTextLines) {
    if (!normalized) return null;
    return (
      <p className="mt-1 text-[11px] text-gray-500 leading-snug">{normalized.summary}</p>
    );
  }

  return (
    <details className="mt-1" open>
      <summary className="text-[11px] text-blue-700 cursor-pointer select-none">
        What changed
      </summary>
      <div className="mt-1 space-y-2 text-[11px]">
        <SessionEditors editors={editors} multiEditor={multiEditor} />

        {multiEditor && attributionNote && (
          <p className="text-amber-900/95 leading-snug rounded border border-amber-100 bg-amber-50/90 px-2 py-1.5">
            {attributionNote}
            {' '}
            Use the times above to see who was active; the cells below are everything that changed in this version.
          </p>
        )}

        <p className="text-gray-800 leading-snug font-medium">{normalized.summary}</p>

        {normalized.changes?.length > 0 && (
          <div>
            <p className="font-medium text-gray-700 mb-0.5">
              {multiEditor ? 'What changed (combined)' : 'What changed'}
            </p>
            <ul className="space-y-1.5 rounded border border-violet-100 bg-violet-50/80 p-2">
              {normalized.changes.map((c, i) => {
                const h = c.headline || humanizeChange(c).headline;
                const beforeLine = c.beforeLine;
                const afterLine = c.afterLine;
                if (beforeLine || afterLine) {
                  return (
                    <li key={`c-${i}`} className="text-gray-800 leading-snug space-y-1">
                      <p className="font-medium">{h}</p>
                      {beforeLine && (
                        <p className="text-[10px] text-red-800/90 break-words">
                          <span className="font-semibold">Before:</span> {beforeLine}
                        </p>
                      )}
                      {afterLine && (
                        <p className="text-[10px] text-green-800/90 break-words">
                          <span className="font-semibold">After:</span> {afterLine}
                        </p>
                      )}
                      {c.after && !c.before && (
                        <p className="text-[10px] text-gray-500">Added: “{c.after}”</p>
                      )}
                      {c.before && c.after && (
                        <p className="text-[10px] text-gray-500">
                          “{c.before}” → “{c.after}”
                        </p>
                      )}
                    </li>
                  );
                }
                return (
                  <li key={`c-${i}`} className="text-gray-800 leading-snug">
                    {h}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!multiEditor && normalized.removed.length > 0 && (
          <div>
            <p className="font-medium text-red-700 mb-0.5">Removed</p>
            <ul className="space-y-0.5 rounded border border-red-100 bg-red-50/80 p-1.5">
              {normalized.removed.map((item, i) => {
                const label = item.label && !/^runs$/i.test(item.label) ? item.label : '';
                return (
                  <li key={`r-${i}`} className="text-red-900 break-words">
                    {label && <span className="text-[10px] text-red-600 block">{label}</span>}
                    {item.text || '(empty)'}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {!multiEditor && normalized.added.length > 0 && (
          <div>
            <p className="font-medium text-green-700 mb-0.5">Added</p>
            <ul className="space-y-0.5 rounded border border-green-100 bg-green-50/80 p-1.5">
              {normalized.added.map((item, i) => {
                const label = item.label && !/^runs$/i.test(item.label) ? item.label : '';
                return (
                  <li key={`a-${i}`} className="text-green-900 break-words">
                    {label && <span className="text-[10px] text-green-600 block">{label}</span>}
                    {item.text || '(empty)'}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {normalized.truncated && (
          <p className="text-[10px] text-gray-400">Showing the first part of a long change.</p>
        )}
      </div>
    </details>
  );
}

export default function AuditSidebar({ resourceId, onClose }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = useCallback(() => {
    if (!resourceId) return;
    setLoading(true);
    api.get(`/audit/resource/${resourceId}`)
      .then(r => setLogs(r.data))
      .finally(() => setLoading(false));
  }, [resourceId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const onRefresh = (e) => {
      const id = e.detail?.docId;
      if (!id || String(id) === String(resourceId)) loadLogs();
    };
    window.addEventListener('audit:refresh', onRefresh);
    const interval = setInterval(loadLogs, 12000);
    return () => {
      window.removeEventListener('audit:refresh', onRefresh);
      clearInterval(interval);
    };
  }, [resourceId, loadLogs]);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} aria-hidden />
      <aside className="fixed top-0 right-0 w-72 h-full border-l border-gray-100 bg-white flex flex-col z-50 shadow-xl">
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-gray-900">Activity</h2>
            <p className="text-[10px] text-gray-400 mt-0.5">Who changed what and when</p>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={loadLogs}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
              title="Refresh activity"
              aria-label="Refresh activity"
            >
              <RefreshCw size={14} />
            </button>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
          {loading && <p className="text-xs text-gray-400 text-center py-8">Loading activity…</p>}
          {!loading && logs.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No activity yet</p>
          )}
          {logs.map(log => {
            const time = formatLogTime(log.timestamp);
            const label = ACTION_LABELS[log.action] || log.action;
            const isRevision = log.action === 'revision';
            const isSave = log.action === 'edited' && log.metadata?.via === 'onlyoffice';
            const isSpreadsheet = ['xlsx', 'xls'].includes(log.metadata?.fileType);

            return (
              <div
                key={log._id}
                className={`flex items-start gap-2 py-2 border-b border-gray-50 ${isRevision ? 'pl-2 border-l-2 border-violet-200' : ''}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-medium flex-shrink-0 ${isRevision ? 'bg-violet-500' : 'bg-cloudy-green'}`}>
                  {log.userName?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{log.userName}</p>
                  <span className={`inline-block text-[11px] px-1.5 py-0.5 rounded font-medium mt-0.5 ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                    {label}
                  </span>

                  {isRevision && log.metadata?.revisionIndex != null && (
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {isSpreadsheet ? 'Edited in spreadsheet' : 'Edited in document'}
                      {log.metadata.revisionTotal > 1
                        ? ` (${log.metadata.revisionIndex} of ${log.metadata.revisionTotal} this session)`
                        : ''}
                    </p>
                  )}

                  {isSave && (
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Version {log.metadata.versionNum ?? '—'} saved
                      {log.metadata.revisionCount > 0
                        ? ` · ${log.metadata.revisionCount} edit(s) in session`
                        : ''}
                      {isSpreadsheet ? ' · cell changes listed below' : ''}
                    </p>
                  )}

                  <TextChanges
                    diff={log.metadata?.diff}
                    revisionCount={isSave ? log.metadata?.revisionCount : 0}
                    revisions={isSave ? log.metadata?.revisions : []}
                  />

                  <p className="text-xs text-gray-500 mt-0.5" title={time.full}>
                    {time.short}
                    <span className="text-gray-400"> · {time.relative}</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}
