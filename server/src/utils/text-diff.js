const { diffLines, diffWords, diffArrays } = require('diff');
const { enrichChanges, humanizeSummary } = require('./humanize-diff');

const MAX_ITEMS = 30;
const MAX_LINE_CHARS = 200;
const HUGE_LINE = 180;

function clampLine(line, max = MAX_LINE_CHARS) {
  const s = String(line || '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function parseSegments(text) {
  const map = new Map();
  const segmentRe = /^(Runs|Fields|Form values|Checkboxes|Controls):(.+)$/gm;
  const s = String(text || '');
  let m;
  while ((m = segmentRe.exec(s))) {
    map.set(m[1], m[2].trim());
  }
  const body = s.replace(segmentRe, '').trim();
  return { map, body };
}

function splitRunTokens(value) {
  return String(value || '')
    .split(/\s*·\s*/)
    .map(t => t.trim())
    .filter(Boolean);
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

/** Sequence diff on ·-separated tokens (avoids false shifts after insert/delete). */
function diffTokenArrays(beforeTokens, afterTokens, segmentName = 'Text') {
  const b = beforeTokens;
  const a = afterTokens;
  const added = [];
  const removed = [];
  const changes = [];
  let lastCommon = '';

  const humanSegment = segmentName === 'Runs' ? 'Form text' : segmentName;

  const parts = diffArrays(b, a);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      if (part.value.length) lastCommon = part.value[part.value.length - 1];
      continue;
    }

    if (part.removed) {
      const removedTokens = part.value.filter(isMeaningfulToken);
      const next = parts[i + 1];
      if (next?.added) {
        const addedTokens = next.value.filter(isMeaningfulToken);
        i += 1;
        if (removedTokens.length === 1 && addedTokens.length === 1) {
          const before = removedTokens[0];
          const after = addedTokens[0];
          if (!isNoiseChange(before, after)) {
            changes.push({
              segment: humanSegment,
              label: lastCommon ? `Near “${clampLine(lastCommon)}”` : 'Updated',
              before,
              after,
            });
          }
        } else {
          // Many tokens shifted — keep only short paired snippets, not the whole form
          const pairs = Math.min(removedTokens.length, addedTokens.length, 8);
          for (let p = 0; p < pairs; p++) {
            if (!isNoiseChange(removedTokens[p], addedTokens[p])
              && removedTokens[p] !== addedTokens[p]) {
              changes.push({
                segment: humanSegment,
                label: lastCommon ? `Near “${clampLine(lastCommon)}”` : 'Updated',
                before: removedTokens[p],
                after: addedTokens[p],
              });
            }
          }
          for (let p = pairs; p < Math.min(removedTokens.length, pairs + 5); p++) {
            removed.push({
              label: lastCommon ? `Near “${clampLine(lastCommon)}”` : humanSegment,
              text: removedTokens[p],
            });
          }
          for (let p = pairs; p < Math.min(addedTokens.length, pairs + 5); p++) {
            added.push({
              label: lastCommon ? `Near “${clampLine(lastCommon)}”` : humanSegment,
              text: addedTokens[p],
            });
          }
        }
      } else {
        const label = lastCommon ? `Near “${clampLine(lastCommon)}”` : humanSegment;
        for (const t of removedTokens.slice(0, 8)) removed.push({ label, text: t });
      }
      continue;
    }

    if (part.added) {
      const label = lastCommon ? `Near “${clampLine(lastCommon)}”` : humanSegment;
      for (const t of part.value.filter(isMeaningfulToken).slice(0, 8)) {
        added.push({ label, text: t });
      }
    }
  }

  return { added, removed, changes };
}

function isMeaningfulToken(t) {
  const s = String(t || '').trim();
  if (!s) return false;
  // Dots / underscores used as blank lines on forms
  if (/^[.…_\-–—\s]+$/.test(s)) return false;
  if (s.length === 1 && /[\/,;:]/.test(s)) return false;
  return true;
}

function runsToPlainText(val) {
  return splitRunTokens(val)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isJunkDiffChunk(t) {
  const s = String(t || '').trim();
  if (!s) return true;
  if (/^[.…_\-–—\s\/,;:]+$/.test(s)) return true;
  return false;
}

/** Expand a character range to a readable “line” window in the form text. */
function lineWindow(text, from, to, pad = 70) {
  const full = String(text || '');
  if (!full) return '';
  let start = Math.max(0, from - pad);
  let end = Math.min(full.length, Math.max(to, from) + pad);
  // Snap to spaces so we don’t cut mid-word
  if (start > 0) {
    const sp = full.indexOf(' ', start);
    if (sp !== -1 && sp < from) start = sp + 1;
  }
  if (end < full.length) {
    const sp = full.lastIndexOf(' ', end);
    if (sp > to) end = sp;
  }
  let snippet = full.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < full.length) snippet = `${snippet}…`;
  return clampLine(snippet, 160);
}

/**
 * Join Word runs into normal text, then word-diff with surrounding line context.
 */
function diffRunTokens(beforeVal, afterVal) {
  const before = runsToPlainText(beforeVal);
  const after = runsToPlainText(afterVal);
  if (before === after) {
    return { added: [], removed: [], changes: [] };
  }

  const parts = diffWords(before, after);
  const changes = [];
  let bPos = 0;
  let aPos = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = String(part.value || '');
    const len = raw.length;

    if (!part.added && !part.removed) {
      bPos += len;
      aPos += len;
      continue;
    }

    if (part.removed) {
      const next = parts[i + 1];
      const removedText = raw.replace(/\s+/g, ' ').trim();
      if (next?.added) {
        const addedText = String(next.value || '').replace(/\s+/g, ' ').trim();
        const addLen = String(next.value || '').length;
        if (!isJunkDiffChunk(removedText) || !isJunkDiffChunk(addedText)) {
          if (!isNoiseChange(removedText, addedText)) {
            const beforeLine = lineWindow(before, bPos, bPos + len);
            const afterLine = lineWindow(after, aPos, aPos + addLen);
            changes.push({
              segment: 'Form text',
              label: 'Line',
              before: removedText,
              after: addedText,
              beforeLine,
              afterLine,
              lineChanged: true,
            });
          }
        }
        bPos += len;
        aPos += addLen;
        i += 1;
        continue;
      }

      if (!isJunkDiffChunk(removedText)) {
        const beforeLine = lineWindow(before, bPos, bPos + len);
        changes.push({
          segment: 'Form text',
          label: 'Line',
          before: removedText,
          after: '',
          beforeLine,
          afterLine: lineWindow(after, aPos, aPos),
          lineChanged: true,
        });
      }
      bPos += len;
      continue;
    }

    if (part.added) {
      const addedText = raw.replace(/\s+/g, ' ').trim();
      if (!isJunkDiffChunk(addedText)) {
        const afterLine = lineWindow(after, aPos, aPos + len);
        const beforeLine = lineWindow(before, bPos, bPos);
        changes.push({
          segment: 'Form text',
          label: 'Line',
          before: '',
          after: addedText,
          beforeLine,
          afterLine,
          lineChanged: true,
        });
      }
      aPos += len;
    }
  }

  // Merge tiny adjacent “added” into one line change when possible
  const merged = [];
  for (const c of changes) {
    const prev = merged[merged.length - 1];
    if (
      prev
      && prev.lineChanged
      && c.lineChanged
      && prev.afterLine
      && c.afterLine
      && prev.afterLine === c.afterLine
    ) {
      prev.after = [prev.after, c.after].filter(Boolean).join(' ').trim();
      prev.before = [prev.before, c.before].filter(Boolean).join(' ').trim();
      continue;
    }
    merged.push(c);
  }

  return {
    added: [],
    removed: [],
    changes: enrichChanges(merged.slice(0, 8)),
  };
}

function diffFieldsSegment(beforeVal, afterVal) {
  const parseFields = (val) => {
    const out = [];
    for (const part of String(val).split(/\s*·\s*/)) {
      const eq = part.indexOf('=');
      if (eq === -1) {
        if (part.trim()) out.push({ key: part.trim(), value: '' });
      } else {
        out.push({
          key: part.slice(0, eq).trim(),
          value: part.slice(eq + 1).trim(),
        });
      }
    }
    return out;
  };

  const bMap = new Map(parseFields(beforeVal).map(f => [f.key, f.value]));
  const aMap = new Map(parseFields(afterVal).map(f => [f.key, f.value]));
  const added = [];
  const removed = [];
  const changes = [];

  for (const key of new Set([...bMap.keys(), ...aMap.keys()])) {
    const bv = bMap.get(key);
    const av = aMap.get(key);
    if (bv === av) continue;
    if (bv != null && av != null) {
      changes.push({ segment: 'Fields', label: key, before: bv, after: av });
    } else if (bv != null) {
      removed.push({ label: key, text: bv });
    } else if (av != null) {
      added.push({ label: key, text: av });
    }
  }
  return { added, removed, changes };
}

function diffSegmentsTokenWise(beforeText, afterText) {
  const b = parseSegments(beforeText);
  const a = parseSegments(afterText);

  const added = [];
  const removed = [];
  const changes = [];

  for (const key of new Set([...b.map.keys(), ...a.map.keys()])) {
    const bv = b.map.get(key) || '';
    const av = a.map.get(key) || '';
    if (bv === av) continue;

    let result;
    if (key === 'Runs') result = diffRunTokens(bv, av, 'Form text');
    else if (key === 'Fields') result = diffFieldsSegment(bv, av);
    else result = diffRunTokens(bv, av, key === 'Form values' ? 'Form values' : key);

    added.push(...result.added);
    removed.push(...result.removed);
    changes.push(...result.changes);
  }

  // Mammoth body can show an edit when XML Runs did not (or lagged). Prefer line context.
  if (
    changes.length === 0
    && b.body !== a.body
    && b.body
    && a.body
    && b.body.length < 4000
    && a.body.length < 4000
  ) {
    const bodyDiff = diffPlainWithLineContext(b.body, a.body);
    added.push(...bodyDiff.added);
    removed.push(...bodyDiff.removed);
    changes.push(...bodyDiff.changes);
  }

  return {
    added: added.slice(0, MAX_ITEMS),
    removed: removed.slice(0, MAX_ITEMS),
    changes: changes.slice(0, MAX_ITEMS),
  };
}

/** Word-diff plain text and attach a readable Before/After line for each edit. */
function diffPlainWithLineContext(beforeText, afterText) {
  const before = String(beforeText || '').replace(/\s+/g, ' ').trim();
  const after = String(afterText || '').replace(/\s+/g, ' ').trim();
  if (!before || !after || before === after) {
    return { added: [], removed: [], changes: [] };
  }

  const parts = diffWords(before, after);
  const changes = [];
  let bPos = 0;
  let aPos = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const raw = String(part.value || '');
    const len = raw.length;

    if (!part.added && !part.removed) {
      bPos += len;
      aPos += len;
      continue;
    }

    if (part.removed) {
      const next = parts[i + 1];
      const removedText = raw.replace(/\s+/g, ' ').trim();
      if (next?.added) {
        const addedText = String(next.value || '').replace(/\s+/g, ' ').trim();
        const addLen = String(next.value || '').length;
        if (!isJunkDiffChunk(removedText) || !isJunkDiffChunk(addedText)) {
          if (!isNoiseChange(removedText, addedText)) {
            changes.push({
              segment: 'Form text',
              label: 'Line',
              before: removedText,
              after: addedText,
              beforeLine: lineWindow(before, bPos, bPos + len),
              afterLine: lineWindow(after, aPos, aPos + addLen),
              lineChanged: true,
            });
          }
        }
        bPos += len;
        aPos += addLen;
        i += 1;
        continue;
      }
      if (!isJunkDiffChunk(removedText)) {
        changes.push({
          segment: 'Form text',
          label: 'Line',
          before: removedText,
          after: '',
          beforeLine: lineWindow(before, bPos, bPos + len),
          afterLine: lineWindow(after, aPos, aPos),
          lineChanged: true,
        });
      }
      bPos += len;
      continue;
    }

    if (part.added) {
      const addedText = raw.replace(/\s+/g, ' ').trim();
      if (!isJunkDiffChunk(addedText)) {
        changes.push({
          segment: 'Form text',
          label: 'Line',
          before: '',
          after: addedText,
          beforeLine: lineWindow(before, bPos, bPos),
          afterLine: lineWindow(after, aPos, aPos + len),
          lineChanged: true,
        });
      }
      aPos += len;
    }
  }

  return {
    added: [],
    removed: [],
    changes: enrichChanges(changes.slice(0, 8)),
  };
}

function collectFromParts(parts, { splitLines = true } = {}) {
  const added = [];
  const removed = [];

  for (const part of parts) {
    const chunks = splitLines
      ? part.value.split('\n').map(l => l.trim()).filter(Boolean)
      : [part.value.trim()].filter(Boolean);

    for (const chunk of chunks) {
      if (!chunk || chunk.length > HUGE_LINE) continue;
      const line = clampLine(chunk);
      if (part.added) added.push({ label: 'Text', text: line });
      else if (part.removed) removed.push({ label: 'Text', text: line });
    }
  }

  return { added, removed };
}

function buildSummary({ changes, added, removed, sameText }) {
  if (sameText) {
    return 'No plain-text changes (form fields and checkboxes may not appear here).';
  }
  const n = changes.length + added.length + removed.length;
  if (!n) return 'Document was saved (no detectable text differences).';
  if (changes.length === 1 && changes[0].headline) {
    return changes[0].headline;
  }
  const bits = [];
  if (changes.length) bits.push(`${changes.length} updated`);
  if (removed.length) bits.push(`${removed.length} removed`);
  if (added.length) bits.push(`${added.length} added`);
  return bits.join(' · ');
}

/**
 * Human-readable diff for Activity — highlights small form edits, not whole documents.
 */
function buildReadableTextDiff(beforeText, afterText) {
  const before = String(beforeText || '');
  const after = String(afterText || '');
  const sameText = before === after;

  const tokenDiff = diffSegmentsTokenWise(before, after);
  const hasTokenChanges =
    tokenDiff.changes.length > 0
    || tokenDiff.added.length > 0
    || tokenDiff.removed.length > 0;

  if (hasTokenChanges) {
    const small = (arr) => arr.filter(x => String(x.text || x.before || x.after || '').length <= HUGE_LINE);
    let changes = enrichChanges(
      tokenDiff.changes.filter(c => !isNoiseChange(c.before, c.after)),
    );
    // Already enriched inside freq path sometimes — dedupe headlines
    const seen = new Set();
    changes = changes.filter(c => {
      const key = c.headline || `${c.before}|${c.after}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let removed = small(tokenDiff.removed);
    let added = small(tokenDiff.added);

    // Tiny edit fallback — still attach Before/After line windows from full text
    if (changes.length === 0 && added.length + removed.length > 0 && added.length + removed.length <= 5) {
      const plainBefore = String(before).replace(/\s+/g, ' ').trim();
      const plainAfter = String(after).replace(/\s+/g, ' ').trim();
      const lineChanges = [];

      for (const a of added) {
        const needle = String(a.text || '').trim();
        if (!needle) continue;
        const idx = plainAfter.indexOf(needle);
        const afterLine = idx >= 0
          ? lineWindow(plainAfter, idx, idx + needle.length)
          : clampLine(needle, 160);
        const beforeLine = idx >= 0
          ? lineWindow(plainBefore, Math.min(idx, plainBefore.length), Math.min(idx, plainBefore.length))
          : '';
        lineChanges.push({
          segment: 'Form text',
          label: 'Line',
          before: '',
          after: needle,
          beforeLine,
          afterLine,
          lineChanged: true,
        });
      }
      for (const r of removed) {
        const needle = String(r.text || '').trim();
        if (!needle) continue;
        const idx = plainBefore.indexOf(needle);
        const beforeLine = idx >= 0
          ? lineWindow(plainBefore, idx, idx + needle.length)
          : clampLine(needle, 160);
        const afterLine = idx >= 0
          ? lineWindow(plainAfter, Math.min(idx, plainAfter.length), Math.min(idx, plainAfter.length))
          : '';
        lineChanges.push({
          segment: 'Form text',
          label: 'Line',
          before: needle,
          after: '',
          beforeLine,
          afterLine,
          lineChanged: true,
        });
      }

      const enriched = enrichChanges(lineChanges);
      return {
        summary: humanizeSummary(enriched) || 'Line changed.',
        changes: enriched,
        removed: [],
        added: [],
        hasChanges: true,
        truncated: false,
      };
    }

    const fragmentCount = changes.length + added.length + removed.length;
    if (fragmentCount > 12 && changes.length < 3) {
      return {
        summary: 'The offer form was updated (several wording changes).',
        changes: changes.slice(0, 5),
        removed: [],
        added: [],
        hasChanges: true,
        truncated: true,
      };
    }

    if (changes.length >= 1) {
      removed = [];
      added = [];
    }

    return {
      summary: humanizeSummary(changes) || buildSummary({
        changes,
        added,
        removed,
        sameText: false,
      }),
      changes,
      removed,
      added,
      hasChanges: true,
      truncated:
        changes.length >= MAX_ITEMS
        || added.length >= MAX_ITEMS
        || removed.length >= MAX_ITEMS,
    };
  }

  let { added, removed } = collectFromParts(diffLines(before, after), { splitLines: true });
  if (!added.length && !removed.length && !sameText) {
    const wordDiff = collectFromParts(diffWords(before, after), { splitLines: false });
    added = wordDiff.added;
    removed = wordDiff.removed;
  }

  const flatRemoved = removed.map(r => (typeof r === 'string' ? r : r.text));
  const flatAdded = added.map(a => (typeof a === 'string' ? a : a.text));

  return {
    summary: buildSummary({ changes: [], added, removed, sameText }),
    changes: [],
    removed: flatRemoved,
    added: flatAdded,
    hasChanges: !sameText && (flatRemoved.length > 0 || flatAdded.length > 0),
    truncated: flatRemoved.length >= MAX_ITEMS || flatAdded.length >= MAX_ITEMS,
  };
}

module.exports = { buildReadableTextDiff };
