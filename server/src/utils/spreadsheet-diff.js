const { xlsxToCellMap } = require('./xlsx-extract');
const { enrichChanges, humanizeSummary } = require('./humanize-diff');

const MAX_CHANGES = 40;

function buildSpreadsheetDiff(beforeBuffer, afterBuffer) {
  const before = xlsxToCellMap(beforeBuffer);
  const after = xlsxToCellMap(afterBuffer);
  const changes = [];
  const added = [];
  const removed = [];

  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const bv = before.get(key);
    const av = after.get(key);
    if (bv === av) continue;

    const bang = key.lastIndexOf('!');
    const sheet = bang > 0 ? key.slice(0, bang) : 'Sheet';
    const cell = bang > 0 ? key.slice(bang + 1) : key;
    const label = `${sheet} cell ${cell}`;

    if (bv != null && av != null) {
      changes.push({ label, before: bv, after: av });
    } else if (bv != null) {
      removed.push({ label, text: bv });
    } else if (av != null) {
      added.push({ label, text: av });
    }
  }

  const trimmedAdded = added.slice(0, MAX_CHANGES);
  const trimmedRemoved = removed.slice(0, MAX_CHANGES);

  const addedAsChanges = trimmedAdded.map(({ label, text }) => {
    const row = { label, before: '', after: text };
    return { ...row, ...enrichChanges([row])[0] };
  });
  const removedAsChanges = trimmedRemoved.map(({ label, text }) => {
    const row = { label, before: text, after: '' };
    return { ...row, ...enrichChanges([row])[0] };
  });

  const allChanges = enrichChanges(changes.slice(0, MAX_CHANGES))
    .concat(addedAsChanges)
    .concat(removedAsChanges);

  return {
    summary:
      humanizeSummary(allChanges)
      || (allChanges.length
        ? `${allChanges.length} cell(s) updated`
        : 'Spreadsheet was saved (cell changes could not be listed).'),
    changes: allChanges,
    added: [],
    removed: [],
    hasChanges: allChanges.length > 0,
    truncated:
      changes.length > MAX_CHANGES
      || added.length > MAX_CHANGES
      || removed.length > MAX_CHANGES,
  };
}

/**
 * Attach editor names when possible. OnlyOffice only gives per-person timestamps in
 * history.changes — not which cell each person changed when several edit one session.
 */
function attributeSpreadsheetDiff(diff, revisions = []) {
  if (!diff?.changes?.length) return diff;

  const sorted = [...(revisions || [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  if (sorted.length === 1) {
    const name = sorted[0].userName || 'Editor';
    return {
      ...diff,
      multiEditor: false,
      editors: sorted,
      changes: diff.changes.map(c => ({
        ...c,
        editedBy: name,
        headline: `${name}: ${c.headline || ''}`.replace(/: $/, ''),
      })),
    };
  }

  if (sorted.length > 1) {
    return {
      ...diff,
      multiEditor: true,
      editors: sorted,
      attributionNote:
        'Several people edited before this save. OnlyOffice reports who edited and when, but not which cell each person changed.',
      changes: diff.changes.map(c => ({ ...c, editedBy: null })),
    };
  }

  return diff;
}

module.exports = { buildSpreadsheetDiff, attributeSpreadsheetDiff };
