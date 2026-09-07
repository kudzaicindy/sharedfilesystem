/** Plain-language labels for Activity (non-technical users). */

function placeFromLabel(label) {
  if (!label) return 'the form';
  let raw = String(label);
  raw = raw.replace(/^Runs\s*:?\s*/i, '');
  raw = raw.replace(/^Form text\s*:?\s*/i, '');
  const m = raw.match(/Near [“"'](.+?)[”"']/);
  raw = m ? m[1] : raw.replace(/^Near\s+/, '');

  if (raw === 'N' || raw === 'Room') return 'Room Number';
  if (/^Room\s*Number$/i.test(raw)) return 'Room Number';
  if (/^Forwarding Address/i.test(raw)) return 'Forwarding Address';
  if (/^NAME$/i.test(raw)) return 'Name';
  if (/^DATE OF BIRTH/i.test(raw) || /^DOB$/i.test(raw)) return 'Date of birth';
  if (/ID\s*:?\s*NUMBER/i.test(raw) || /^I\s*D$/i.test(raw)) return 'ID number';
  if (/PERSONAL DETAILS/i.test(raw)) return 'Personal details';
  if (/OFFER FORM/i.test(raw)) return 'Offer form';
  if (/SUNWAY/i.test(raw)) return 'the company header';
  if (/undersigned/i.test(raw)) return 'the signature section';
  if (/offer to (pay|purchase)/i.test(raw)) return 'the payment / purchase offer';
  if (raw === 'Runs' || raw === 'Form text' || raw === 'Line' || raw === 'Updated') return 'the form';
  if (raw.length > 60) return 'part of the form';
  if (raw.length <= 2) return 'a form field';
  return raw;
}

/**
 * One readable sentence describing a single edit.
 */
export function humanizeChange(change) {
  const {
    label,
    before,
    after,
    beforeLine,
    afterLine,
    lineChanged,
  } = change || {};
  const b = String(before ?? '').trim();
  const a = String(after ?? '').trim();
  const bLine = String(beforeLine ?? '').trim();
  const aLine = String(afterLine ?? '').trim();

  const cellMatch = String(label || '').match(/^(.+?) cell ([A-Z]+[0-9]+)$/i);
  if (cellMatch) {
    const sheet = cellMatch[1];
    const cell = cellMatch[2];
    if (!b && a) {
      return {
        headline: `${sheet}, cell ${cell}: set to “${a}”.`,
        place: sheet,
        before: b,
        after: a,
      };
    }
    if (b && !a) {
      return {
        headline: `${sheet}, cell ${cell}: cleared (was “${b}”).`,
        place: sheet,
        before: b,
        after: a,
      };
    }
    return {
      headline: `${sheet}, cell ${cell}: changed from “${b}” to “${a}”.`,
      place: sheet,
      before: b,
      after: a,
    };
  }

  if (lineChanged || bLine || aLine) {
    if (bLine && aLine && bLine !== aLine) {
      return {
        headline: 'Line changed',
        place: 'Line',
        before: b,
        after: a,
        beforeLine: bLine,
        afterLine: aLine,
        lineChanged: true,
      };
    }
    if (!bLine && aLine) {
      return {
        headline: a ? `Line updated (added “${a}”)` : 'Line updated',
        place: 'Line',
        before: b,
        after: a,
        beforeLine: '',
        afterLine: aLine,
        lineChanged: true,
      };
    }
    if (bLine && !aLine) {
      return {
        headline: b ? `Line updated (removed “${b}”)` : 'Line updated',
        place: 'Line',
        before: b,
        after: a,
        beforeLine: bLine,
        afterLine: '',
        lineChanged: true,
      };
    }
  }

  const place = placeFromLabel(label);

  if (b === 'umber' && a === 'o' && (place === 'Room Number' || label?.includes('N'))) {
    return {
      headline: 'Room number was changed from “no” to “o”.',
      place: 'Room Number',
      before: 'no',
      after: 'o',
    };
  }

  if (!b && a) {
    return {
      headline: `Line changed — added “${a}”.`,
      place: 'Line',
      before: b,
      after: a,
      lineChanged: true,
    };
  }

  if (b && !a) {
    return {
      headline: `Line changed — removed “${b}”.`,
      place: 'Line',
      before: b,
      after: a,
      lineChanged: true,
    };
  }

  return {
    headline: `Line changed — “${b}” → “${a}”.`,
    place: 'Line',
    before: b,
    after: a,
    lineChanged: true,
  };
}

export function humanizeSummary(changes) {
  if (!changes?.length) return null;
  if (changes.length === 1) {
    const c = changes[0];
    if (c.lineChanged || c.beforeLine || c.afterLine) {
      if (c.after && !c.before) return `Line changed — added “${c.after}”.`;
      if (c.before && !c.after) return `Line changed — removed “${c.before}”.`;
      if (c.before && c.after) return `Line changed — “${c.before}” → “${c.after}”.`;
      return 'Line changed.';
    }
    return c.headline || humanizeChange(c).headline;
  }
  if (changes[0]?.label?.includes(' cell ')) {
    return `${changes.length} cells updated in the spreadsheet.`;
  }
  if (changes.some(c => c.lineChanged || c.beforeLine || c.afterLine)) {
    return `${changes.length} lines updated on the form.`;
  }
  return `${changes.length} updates on the form.`;
}
