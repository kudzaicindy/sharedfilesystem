import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../utils/api';
import { goBackFromEditor } from '../utils/editorNavigation';

function parseFilenameFromContentDisposition(value) {
  if (!value) return null;
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

function isXlsx(name = '') {
  return ext(name) === 'xlsx';
}

function colLabel(n) {
  let x = n + 1;
  let s = '';
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

export default function SimpleXlsxEditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [filename, setFilename] = useState('spreadsheet.xlsx');

  const [sheetNames, setSheetNames] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [grid, setGrid] = useState([['']]);
  const [sheetsByName, setSheetsByName] = useState({});

  const handleBack = () => goBackFromEditor(navigate, '/files');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await api.get(`/documents/${docId}/download`, { responseType: 'arraybuffer' });
        const cd = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
        const inferredName = parseFilenameFromContentDisposition(cd) || 'spreadsheet.xlsx';
        if (cancelled) return;
        setFilename(inferredName);

        if (!isXlsx(inferredName)) throw new Error('This editor supports .xlsx only.');

        const wb = XLSX.read(res.data, { type: 'array' });
        const names = wb.SheetNames || [];
        if (!names.length) throw new Error('No sheets found.');
        const first = names[0];
        const nextSheets = {};
        for (const n of names) {
          const ws = wb.Sheets[n];
          const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, raw: false });
          nextSheets[n] = (aoa?.length ? aoa : [['']]).map(row => row.map(v => (v ?? '').toString()));
        }

        if (cancelled) return;
        setSheetNames(names);
        setSheetsByName(nextSheets);
        setActiveSheet(first);
        setGrid(nextSheets[first] || [['']]);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || 'Failed to open spreadsheet');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  const updateActiveSheetGrid = (name) => {
    setActiveSheet(name);
    setGrid(sheetsByName?.[name] || [['']]);
  };

  const normalizedGrid = useMemo(() => {
    const rows = Math.max(grid.length, 30);
    const cols = Math.max(...grid.map(r => r.length), 10);
    const cappedRows = Math.min(rows, 200);
    const cappedCols = Math.min(cols, 50);

    const out = [];
    for (let r = 0; r < cappedRows; r += 1) {
      const row = grid[r] || [];
      const next = [];
      for (let c = 0; c < cappedCols; c += 1) {
        next.push(row[c] ?? '');
      }
      out.push(next);
    }
    return out;
  }, [grid]);

  const setCell = (r, c, value) => {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      while (next.length <= r) next.push([]);
      while (next[r].length <= c) next[r].push('');
      next[r][c] = value;
      return next;
    });
  };

  useEffect(() => {
    if (!activeSheet) return;
    setSheetsByName(prev => ({ ...prev, [activeSheet]: grid }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid]);

  const buildXlsxBlob = async () => {
    const base = (filename || 'spreadsheet.xlsx').replace(/\.xlsx$/i, '');
    const wb = XLSX.utils.book_new();
    const names = sheetNames?.length ? sheetNames : [activeSheet || 'Sheet1'];
    for (const n of names) {
      const data = (n === activeSheet ? grid : sheetsByName?.[n]) || [['']];
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, n);
    }
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return { blob, name: `${base}.xlsx` };
  };

  const handleDownload = async () => {
    const { blob, name } = await buildXlsxBlob();
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

      const { blob, name } = await buildXlsxBlob();
      const file = new File([blob], name, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const form = new FormData();
      form.append('file', file);
      form.append('comment', 'Edited in browser (simple spreadsheet editor)');

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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
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
              Simple .xlsx editor (no Docker). Best-effort formatting/formulas.
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownload}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              <Download size={14} />
              Download
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-black disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {error && (
          <div className="mb-3 p-3 rounded-lg border border-red-100 bg-red-50 text-xs text-red-700">
            {error}
          </div>
        )}

        {!loading && sheetNames.length > 1 && (
          <div className="mb-3 flex items-center gap-2">
            <div className="text-xs text-gray-500">Sheet</div>
            <select
              value={activeSheet}
              onChange={(e) => {
                setError(null);
                updateActiveSheetGrid(e.target.value);
              }}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
            >
              {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-xs text-gray-500">Loading spreadsheet…</div>
        ) : (
          <div className="border border-gray-100 rounded-xl shadow-sm overflow-auto bg-white">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-10 px-2 py-1 text-[10px] text-gray-400 font-medium border-r border-gray-100">#</th>
                  {normalizedGrid[0].map((_, c) => (
                    <th key={c} className="px-2 py-1 text-[10px] text-gray-500 font-medium border-r border-gray-100">
                      {colLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {normalizedGrid.map((row, r) => (
                  <tr key={r} className="border-b border-gray-50">
                    <td className="px-2 py-1 text-[10px] text-gray-400 border-r border-gray-100 bg-gray-50 sticky left-0">
                      {r + 1}
                    </td>
                    {row.map((val, c) => (
                      <td key={c} className="border-r border-gray-50">
                        <input
                          value={val}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          className="w-32 px-2 py-1 outline-none focus:bg-brand-maroon-light/20"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

