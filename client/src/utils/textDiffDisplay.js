import { humanizeChange, humanizeSummary } from './humanizeDiff';

const HUGE = 120;

function splitRunTokens(value) {
  return String(value || '')
    .split(/\s*·\s*/)
    .map(t => t.trim())
    .filter(Boolean);
}

function stripRunsPrefix(s) {
  const t = String(s || '').trim();
  return t.replace(/^Runs:\s*/i, '');
}

function isNoiseChange(before, after) {
  const b = String(before || '').trim();
  const a = String(after || '').trim();
  if (!b || !a) return false;
  if (b.endsWith('…') || a.endsWith('…')) {
    const b2 = b.replace(/…+$/g, '');
    const a2 = a.replace(/…+$/g, '');
    if (a2.startsWith(b2) || b2.startsWith(a2)) return true;
  }
  if (b.length >= 4 && a.startsWith(b)) return true;
  if (a.length >= 4 && b.startsWith(a)) return true;
  return false;
}

function tokenDiffFromRuns(beforeStr, afterStr) {
  const before = splitRunTokens(stripRunsPrefix(beforeStr)).join(' ').replace(/\s+/g, ' ').trim();
  const after = splitRunTokens(stripRunsPrefix(afterStr)).join(' ').replace(/\s+/g, ' ').trim();
  if (before === after) return { changes: [], added: [], removed: [] };

  // Lightweight word split diff without importing diff (keep client simple)
  const bWords = before.split(/\s+/).filter(Boolean);
  const aWords = after.split(/\s+/).filter(Boolean);
  const bSet = new Map();
  const aSet = new Map();
  for (const w of bWords) bSet.set(w, (bSet.get(w) || 0) + 1);
  for (const w of aWords) aSet.set(w, (aSet.get(w) || 0) + 1);

  const added = [];
  const removed = [];
  for (const [w, c] of aSet) {
    const prev = bSet.get(w) || 0;
    for (let i = 0; i < c - prev; i++) added.push({ label: '', text: w });
  }
  for (const [w, c] of bSet) {
    const next = aSet.get(w) || 0;
    for (let i = 0; i < c - next; i++) removed.push({ label: '', text: w });
  }

  const changes = [];
  if (added.length === 1 && removed.length === 0) {
    changes.push({ label: 'Form text', before: '', after: added[0].text });
    return { changes, added: [], removed: [] };
  }
  if (removed.length === 1 && added.length === 0) {
    changes.push({ label: 'Form text', before: removed[0].text, after: '' });
    return { changes, added: [], removed: [] };
  }

  return {
    changes,
    added: added.slice(0, 5),
    removed: removed.slice(0, 5),
  };
}

function isHugeRunsDump(text) {
  const t = String(text || '');
  return t.length > HUGE && (t.startsWith('Runs:') || t.includes(' · '));
}

function filterNoiseChanges(changes) {
  return (changes || []).filter(c => !isNoiseChange(c.before, c.after));
}

function isNoiseLabel(label) {
  const t = String(label || '').trim();
  return !t || /^runs$/i.test(t) || /^form text$/i.test(t);
}

function isBlankFormNoise(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/^[.…_\-–—\s]+$/.test(s)) return true;
  if (s.length === 1 && /[\/,;:]/.test(s)) return true;
  return false;
}

/** Fix old/noisy diffs that list the whole form under Removed/Added. */
export function repairTextDiff(diff) {
  if (!diff) return null;

  if (diff.changes?.length) {
    const changes = filterNoiseChanges(diff.changes)
      .filter(c => !isBlankFormNoise(c.before) || !isBlankFormNoise(c.after))
      .map(c => {
        // Upgrade old "Form text: added …" entries to line-change wording
        const upgraded = {
          ...c,
          lineChanged: c.lineChanged || Boolean(c.beforeLine || c.afterLine)
            || (/^Form text:\s*(added|removed)/i.test(c.headline || '') && (c.after || c.before)),
        };
        return {
          ...upgraded,
          ...humanizeChange(upgraded),
        };
      });
    return {
      ...diff,
      changes,
      summary: humanizeSummary(changes) || diff.summary || 'The form was updated.',
      // Prefer sentences; hide raw Added/Removed when we have change headlines
      added: [],
      removed: [],
    };
  }

  const asText = (item) => (typeof item === 'string' ? item : item.text || '');
  const asLabel = (item) => (typeof item === 'string' ? '' : item.label || '');

  let removed = (diff.removed || []).map(item => (
    typeof item === 'string' ? { label: '', text: item } : { label: item.label || '', text: item.text || '' }
  )).filter(x => !isBlankFormNoise(x.text) && !isHugeRunsDump(x.text));

  let added = (diff.added || []).map(item => (
    typeof item === 'string' ? { label: '', text: item } : { label: item.label || '', text: item.text || '' }
  )).filter(x => !isBlankFormNoise(x.text) && !isHugeRunsDump(x.text));

  // Old logs: one huge "Runs: …" on each side
  const rawRemoved = (diff.removed || []).map(asText);
  const rawAdded = (diff.added || []).map(asText);
  const rRuns = rawRemoved.find(isHugeRunsDump);
  const aRuns = rawAdded.find(isHugeRunsDump);
  if (rRuns && aRuns) {
    const { changes, added: aTok, removed: rTok } = tokenDiffFromRuns(rRuns, aRuns);
    const clean = filterNoiseChanges(changes).map(c => ({ ...c, ...humanizeChange(c) }));
    if (clean.length) {
      return {
        ...diff,
        summary: humanizeSummary(clean) || 'The form was updated.',
        changes: clean.slice(0, 8),
        added: [],
        removed: [],
      };
    }
    // Still too noisy — layman one-liner
    if ((aTok.length + rTok.length) > 8) {
      return {
        ...diff,
        summary: 'The offer form was updated (several wording changes).',
        changes: [],
        added: [],
        removed: [],
      };
    }
    added = aTok.filter(x => !isBlankFormNoise(x.text));
    removed = rTok.filter(x => !isBlankFormNoise(x.text));
  }

  // Relabel "Runs" → hide technical labels
  const tidy = (arr) => arr
    .filter(x => !isBlankFormNoise(x.text))
    .slice(0, 8)
    .map(x => ({
      label: isNoiseLabel(x.label) ? '' : x.label,
      text: x.text,
    }));

  removed = tidy(removed);
  added = tidy(added);

  // Old noisy logs: long "Added" lists of form boilerplate — keep only rare short inserts
  if (added.length >= 5 && removed.length === 0) {
    const boilerplate = /^(SUNWAY|OFFER FORM|CONFIDENTIAL|PERSONAL DETAILS|NAME|DATE OF BIRTH|the undersigned|Do hereby|I|We)$/i;
    const meaningful = added.filter(x => {
      const t = String(x.text || '').trim();
      if (boilerplate.test(t)) return false;
      if (/they/i.test(t)) return true;
      if (t.length <= 40 && !/^[.…_]+$/.test(t)) return true;
      return false;
    });
    // Prefer tokens that look like the real edit (They / , They)
    const they = meaningful.filter(x => /they/i.test(x.text));
    const keep = they.length ? they : meaningful.slice(0, 3);
    if (keep.length && keep.length < added.length) {
      return {
        ...diff,
        summary: keep.length === 1
          ? `Line changed — added “${keep[0].text}”.`
          : `${keep.length} lines updated on the form.`,
        changes: keep.map(k => ({
          label: 'Line',
          before: '',
          after: k.text,
          lineChanged: true,
          headline: `Line changed — added “${k.text}”.`,
        })),
        added: [],
        removed: [],
      };
    }
    return {
      ...diff,
      summary: 'The offer form was updated (several wording changes).',
      changes: [],
      added: [],
      removed: [],
    };
  }

  if (removed.length + added.length > 10) {
    return {
      ...diff,
      summary: 'The offer form was updated (several wording changes).',
      changes: [],
      added: [],
      removed: [],
    };
  }

  return {
    ...diff,
    changes: diff.changes || [],
    added,
    removed,
    summary: diff.summary && !/^\d+ (updated|removed|added)/i.test(diff.summary)
      ? diff.summary
      : (added.length || removed.length
        ? `${added.length + removed.length} wording change(s) on the form.`
        : diff.summary || 'The form was updated.'),
  };
}
