const mammoth = require('mammoth');
const JSZip = require('jszip');

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extractWtText(xmlFragment) {
  const parts = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xmlFragment))) {
    const t = decodeXmlEntities(m[1]).trim();
    if (t) parts.push(t);
  }
  return parts.join(' ');
}

function isCheckboxChecked(block) {
  const checkedTag = block.match(/<w:checked[^/]*\/?>/);
  if (!checkedTag) return false;
  const valMatch = checkedTag[0].match(/w:val="([^"]*)"/);
  if (!valMatch) return true;
  const v = valMatch[1];
  return v === '1' || v === 'true' || v === 'on';
}

/**
 * Build comparable text from docx XML (forms, controls, tables) + mammoth body.
 * Mammoth alone often misses content-control / field edits ("no" → "5").
 */
async function docxToComparableText(buffer) {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  let mammothText = '';
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    mammothText = String(value || '').trim();
  } catch {
    mammothText = '';
  }

  let docXml = '';
  try {
    const zip = await JSZip.loadAsync(buffer);
    docXml = (await zip.file('word/document.xml')?.async('string')) || '';
  } catch {
    return mammothText;
  }

  if (!docXml) return mammothText;

  const segments = [];

  const runTexts = [];
  const wtRe = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = wtRe.exec(docXml))) {
    const t = decodeXmlEntities(m[1]).trim();
    if (t) runTexts.push(t);
  }
  if (runTexts.length) {
    segments.push(`Runs: ${runTexts.join(' · ')}`);
  }

  const checks = [];
  const checkRe = /<w:checkBox[^>]*>([\s\S]*?)<\/w:checkBox>/g;
  while ((m = checkRe.exec(docXml))) {
    checks.push(isCheckboxChecked(m[1]) ? 'checked' : 'unchecked');
  }
  const checkRe14 = /<w14:checkbox[^>]*>([\s\S]*?)<\/w14:checkbox>/g;
  while ((m = checkRe14.exec(docXml))) {
    const val = /<w14:checked\s+w14:val="([^"]*)"/.exec(m[1])?.[1];
    checks.push(val === '1' || val === 'true' ? 'checked' : 'unchecked');
  }
  if (checks.length) {
    segments.push(`Checkboxes: ${checks.join(', ')}`);
  }

  const controls = [];
  const sdtRe = /<w:sdt>([\s\S]*?)<\/w:sdt>/g;
  while ((m = sdtRe.exec(docXml))) {
    const block = m[0];
    const tag = /<w:tag\s+w:val="([^"]*)"/.exec(block)?.[1] || '';
    const alias = /<w:alias\s+w:val="([^"]*)"/.exec(block)?.[1] || '';
    const label = tag || alias || 'field';
    const text = extractWtText(block);
    controls.push(`${label}=${text || '(empty)'}`);
  }
  if (controls.length) {
    segments.push(`Fields: ${controls.join(' · ')}`);
  }

  const fldSimpleRe = /<w:fldSimple[^>]*>([\s\S]*?)<\/w:fldSimple>/g;
  const simpleFields = [];
  while ((m = fldSimpleRe.exec(docXml))) {
    const text = extractWtText(m[1]);
    if (text) simpleFields.push(text);
  }
  if (simpleFields.length) {
    segments.push(`Form values: ${simpleFields.join(' · ')}`);
  }

  const xmlPart = segments.join('\n');
  if (!xmlPart) return mammothText;

  return [mammothText, xmlPart].filter(Boolean).join('\n\n');
}

module.exports = { docxToComparableText };
