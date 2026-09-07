import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import mammoth from 'mammoth';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import { Bold, Italic, Underline as UnderlineIcon, Save, Download, ArrowLeft } from 'lucide-react';
import api from '../utils/api';
import { goBackFromEditor } from '../utils/editorNavigation';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  ImageRun,
  WidthType,
} from 'docx';

function parseFilenameFromContentDisposition(value) {
  if (!value) return null;
  // Handles: attachment; filename="foo.docx" OR filename*=UTF-8''foo.docx
  const utf8 = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try { return decodeURIComponent(utf8[1].replace(/(^"|"$)/g, '')); } catch { return utf8[1]; }
  }
  const simple = value.match(/filename\s*=\s*("?)([^"]+)\1/i);
  return simple?.[2] || null;
}

function ext(name = '') {
  return name.split('.').pop()?.toLowerCase() || '';
}

function isDocx(name = '') {
  return ext(name) === 'docx';
}

function colorToDocxHex(color) {
  if (!color) return undefined;
  const c = String(color).trim();
  const hex = c.startsWith('#') ? c.slice(1) : c;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return hex.split('').map(ch => (ch + ch)).join('').toUpperCase();
  }
  return undefined;
}

function pxToHalfPoints(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // 1px ~= 0.75pt, and docx uses half-points
  return Math.max(1, Math.round(n * 1.5));
}

function dataUrlToUint8Array(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return null;
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extractTextStyle(marks = []) {
  const ts = marks.find(m => m.type === 'textStyle');
  const color = colorToDocxHex(ts?.attrs?.color);
  const font = ts?.attrs?.fontFamily || undefined;
  const size = pxToHalfPoints(ts?.attrs?.fontSize);
  return { color, font, size };
}

function collectTextRuns(inline = []) {
  const runs = [];
  for (const node of inline) {
    if (node.type === 'text') {
      const marks = node.marks || [];
      const bold = marks.some(m => m.type === 'bold');
      const italics = marks.some(m => m.type === 'italic');
      const underline = marks.some(m => m.type === 'underline');
      const { color, font, size } = extractTextStyle(marks);
      runs.push(new TextRun({
        text: node.text || '',
        bold,
        italics,
        underline,
        color,
        font,
        size,
      }));
    } else if (node.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }));
    } else if (node.type === 'image') {
      // Images are handled at block level (paragraph/table). Skip here.
    } else if (node.content) {
      runs.push(...collectTextRuns(node.content));
    }
  }
  return runs;
}

function paragraphAlignmentFromAttrs(attrs) {
  const a = attrs?.textAlign;
  if (a === 'center') return AlignmentType.CENTER;
  if (a === 'right') return AlignmentType.RIGHT;
  if (a === 'justify') return AlignmentType.JUSTIFIED;
  return undefined;
}

async function nodeToParagraphs(node) {
  if (!node) return [];

  if (node.type === 'paragraph' || node.type === 'heading') {
    const runs = [];
    for (const child of node.content || []) {
      if (child.type === 'image') {
        const bytes = dataUrlToUint8Array(child.attrs?.src);
        if (bytes) {
          runs.push(new ImageRun({
            data: bytes,
            transformation: { width: 520, height: 320 },
          }));
        }
      } else {
        runs.push(...collectTextRuns([child]));
      }
    }

    const safeRuns = runs.length ? runs : [new TextRun({ text: '' })];
    const heading = node.type === 'heading'
      ? (
          (node.attrs?.level || 1) === 1 ? HeadingLevel.HEADING_1 :
          (node.attrs?.level || 1) === 2 ? HeadingLevel.HEADING_2 :
          (node.attrs?.level || 1) === 3 ? HeadingLevel.HEADING_3 :
          HeadingLevel.HEADING_4
        )
      : undefined;

    return [new Paragraph({
      children: safeRuns,
      heading,
      alignment: paragraphAlignmentFromAttrs(node.attrs),
    })];
  }

  return [];
}

async function tableNodeToDocxTable(node) {
  const rows = [];
  for (const r of node.content || []) {
    if (r.type !== 'tableRow') continue;
    const cells = [];
    for (const c of r.content || []) {
      if (c.type !== 'tableCell' && c.type !== 'tableHeader') continue;
      const paras = [];
      for (const block of c.content || []) {
        const out = await nodeToParagraphs(block);
        paras.push(...out);
      }
      cells.push(new DocxTableCell({
        children: paras.length ? paras : [new Paragraph({ children: [new TextRun({ text: '' })] })],
      }));
    }
    rows.push(new DocxTableRow({ children: cells }));
  }

  return new DocxTable({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

async function tiptapJsonToDocx(editorJson) {
  const blocks = editorJson?.content || [];
  const children = [];

  for (const node of blocks) {
    if (node.type === 'paragraph') {
      const paras = await nodeToParagraphs(node);
      children.push(...paras);
    } else if (node.type === 'heading') {
      const paras = await nodeToParagraphs(node);
      children.push(...paras);
    } else if (node.type === 'bulletList') {
      for (const li of node.content || []) {
        if (li.type !== 'listItem') continue;
        const inner = li.content || [];
        // listItem usually contains a paragraph; handle first paragraph
        const para = inner.find(n => n.type === 'paragraph') || { type: 'paragraph', content: inner.flatMap(n => n.content || []) };
        const paras = await nodeToParagraphs(para);
        for (const p of paras) {
          children.push(new Paragraph({ ...p.options, bullet: { level: 0 } }));
        }
      }
    } else if (node.type === 'orderedList') {
      // Minimal support: convert to plain paragraphs with "1. " prefix
      let i = 1;
      for (const li of node.content || []) {
        if (li.type !== 'listItem') continue;
        const inner = li.content || [];
        const para = inner.find(n => n.type === 'paragraph') || { type: 'paragraph', content: inner.flatMap(n => n.content || []) };
        const runs = collectTextRuns(para.content || []);
        children.push(new Paragraph({
          children: [new TextRun({ text: `${i}. ` }), ...(runs.length ? runs : [new TextRun({ text: '' })])],
        }));
        i += 1;
      }
    } else if (node.type === 'table') {
      children.push(await tableNodeToDocxTable(node));
    } else if (node.content) {
      // Fallback: try to flatten unknown block types into a paragraph
      const paras = await nodeToParagraphs({ type: 'paragraph', content: node.content });
      children.push(...paras);
    }
  }

  if (!children.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
  }

  return new Document({ sections: [{ children }] });
}

function ToolbarButton({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400' :
        active ? 'border-brand-maroon bg-brand-maroon-light/40 text-brand-maroon' :
        'border-gray-200 hover:bg-gray-50 text-gray-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default function SimpleDocxEditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState('document.docx');

  const handleBack = () => goBackFromEditor(navigate, '/files');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // keep it simple; Word import will already have headings/paragraphs
        codeBlock: false,
      }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '<p>Loading…</p>',
    editorProps: {
      attributes: {
        class:
          [
            'prose prose-sm max-w-none focus:outline-none min-h-[60vh] px-6 py-6 bg-white',
            // Best-effort "Word-like" table visibility
            'prose-table:table-auto prose-table:w-full',
            'prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-2 prose-th:py-1 prose-th:text-left',
            'prose-td:border prose-td:border-gray-300 prose-td:px-2 prose-td:py-1',
            'prose-img:max-w-full prose-img:h-auto',
          ].join(' '),
      },
    },
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.get(`/documents/${docId}/download`, {
          responseType: 'blob',
        });

        const cd = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
        const inferredName = parseFilenameFromContentDisposition(cd) || 'document.docx';
        if (cancelled) return;
        setFilename(inferredName);

        if (!isDocx(inferredName)) {
          throw new Error('This editor supports .docx only.');
        }

        const arrayBuffer = await res.data.arrayBuffer();
        const { value: html } = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            // Keep it predictable: avoid importing gigantic inline styles
            styleMap: [
              "p[style-name='Title'] => h1:fresh",
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ],
            // Embed images as data URLs so they render & survive round-trips.
            convertImage: mammoth.images.inline((element) => {
              return element.read('base64').then((imageBuffer) => {
                const contentType = element.contentType || 'image/png';
                return { src: `data:${contentType};base64,${imageBuffer}` };
              });
            }),
          }
        );

        if (cancelled) return;
        editor?.commands?.setContent(html || '<p></p>', false);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Failed to open document');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [docId, editor]);

  const buildDocxBlob = async () => {
    const json = editor?.getJSON?.();
    const doc = await tiptapJsonToDocx(json);
    const blob = await Packer.toBlob(doc);
    // Ensure correct extension
    const base = (filename || 'document.docx').replace(/\.(doc|docx)$/i, '');
    return { blob, name: `${base}.docx` };
  };

  const handleDownload = async () => {
    const { blob, name } = await buildDocxBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const { blob, name } = await buildDocxBlob();
      const file = new File([blob], name, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const form = new FormData();
      form.append('file', file);
      form.append('comment', 'Edited in browser (simple editor)');

      await api.put(`/documents/${docId}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="p-2 rounded-md hover:bg-gray-50 text-gray-600"
            aria-label="Back"
            title="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 truncate">{filename}</div>
            <div className="text-[10px] text-gray-500">
              Simple .docx editor (no Docker). Best-effort formatting.
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            <ToolbarButton
              label="Bold"
              onClick={() => editor?.chain?.().focus().toggleBold().run()}
              active={!!editor?.isActive?.('bold')}
              disabled={!editor}
            >
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton
              label="Italic"
              onClick={() => editor?.chain?.().focus().toggleItalic().run()}
              active={!!editor?.isActive?.('italic')}
              disabled={!editor}
            >
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton
              label="Underline"
              onClick={() => editor?.chain?.().focus().toggleUnderline().run()}
              active={!!editor?.isActive?.('underline')}
              disabled={!editor}
            >
              <UnderlineIcon size={14} />
            </ToolbarButton>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading || !editor}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={14} />
              Download
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || !editor || saving}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-black disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-3 p-3 rounded-lg border border-red-100 bg-red-50 text-xs text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-6 text-xs text-gray-500">Loading document…</div>
        ) : (
          <div className="border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <EditorContent editor={editor} />
          </div>
        )}
      </div>
    </div>
  );
}

