import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import mammoth from 'mammoth';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import * as Y from 'yjs';
import { SocketIOProvider } from 'y-socket.io';
import { ArrowLeft } from 'lucide-react';
import api from '../utils/api';
import { goBackFromEditor } from '../utils/editorNavigation';

function randomColor() {
  const colors = ['#2563eb', '#16a34a', '#dc2626', '#7c3aed', '#ea580c', '#0891b2', '#db2777'];
  return colors[Math.floor(Math.random() * colors.length)];
}

function randomName() {
  const animals = ['Fox', 'Otter', 'Hawk', 'Panda', 'Koala', 'Lynx', 'Dolphin', 'Tiger', 'Falcon'];
  const adj = ['Quick', 'Calm', 'Bold', 'Kind', 'Sharp', 'Bright', 'Quiet', 'Brave'];
  return `${adj[Math.floor(Math.random() * adj.length)]} ${animals[Math.floor(Math.random() * animals.length)]}`;
}

export default function CollabEditorPage() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('connecting');
  const [loadError, setLoadError] = useState(null);

  const collabServerUrl = import.meta.env.VITE_COLLAB_SERVER_URL || 'http://localhost:5000';

  const me = useMemo(() => {
    return { name: randomName(), color: randomColor() };
  }, []);

  const ydoc = useMemo(() => new Y.Doc(), []);
  const initialLoadedRef = useRef(false);

  const provider = useMemo(() => {
    if (!docId) return null;
    return new SocketIOProvider(collabServerUrl, docId, ydoc, {
      autoConnect: true,
    });
  }, [collabServerUrl, docId, ydoc]);

  const extensions = useMemo(() => {
    const base = [
      StarterKit.configure({ history: false, codeBlock: false }),
      Collaboration.configure({ document: ydoc }),
      TextStyle,
      Color,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({ inline: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ];

    return base;
  }, [ydoc]);

  useEffect(() => {
    if (!provider) return undefined;

    const onStatus = (event) => setStatus(event?.status || 'unknown');
    provider.on('status', onStatus);

    return () => {
      provider.off('status', onStatus);
      try { provider.disconnect(); } catch { /* ignore */ }
      try { provider.destroy(); } catch { /* ignore */ }
    };
  }, [provider]);

  const editor = useEditor({
    extensions,
    editorProps: {
      attributes: {
        class:
          [
            'prose prose-sm max-w-none focus:outline-none min-h-[70vh] px-6 py-6 bg-white',
            'prose-headings:scroll-mt-24',
            'prose-table:table-auto prose-table:w-full',
            'prose-th:border prose-th:border-gray-300 prose-th:bg-gray-50 prose-th:px-2 prose-th:py-1 prose-th:text-left',
            'prose-td:border prose-td:border-gray-300 prose-td:px-2 prose-td:py-1',
            'prose-img:max-w-full prose-img:h-auto',
          ].join(' '),
      },
    },
  }, [extensions]);

  useEffect(() => {
    if (!provider || !editor || !docId) return undefined;

    const maybeLoadInitial = async () => {
      if (initialLoadedRef.current) return;
      if (!provider.synced) return;

      const config = ydoc.getMap('config');
      const fragment = ydoc.getXmlFragment('default');
      const fragmentLooksEmpty = (fragment?.length || 0) === 0;
      const alreadyMarked = !!config.get('initialContentLoaded');
      // If we've previously marked "loaded" but the shared doc is empty (e.g. a previous crash),
      // allow a retry so the document isn't stuck blank.
      if (alreadyMarked && !fragmentLooksEmpty) {
        initialLoadedRef.current = true;
        return;
      }

      try {
        setLoadError(null);

        const res = await api.get(`/documents/${docId}/download`, { responseType: 'blob' });
        const cd = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
        const name = (() => {
          const value = cd || '';
          const utf8 = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
          if (utf8?.[1]) {
            try { return decodeURIComponent(utf8[1].replace(/(^"|"$)/g, '')); } catch { return utf8[1]; }
          }
          const simple = value.match(/filename\s*=\s*("?)([^"]+)\1/i);
          return simple?.[2] || '';
        })();

        const ext = name.split('.').pop()?.toLowerCase();
        if (ext && ext !== 'docx') {
          setLoadError('Collaborative editor currently supports .docx only.');
          initialLoadedRef.current = true;
          return;
        }

        const arrayBuffer = await res.data.arrayBuffer();
        const { value: html } = await mammoth.convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Title'] => h1:fresh",
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
            ],
            convertImage: mammoth.images.inline((element) => {
              return element.read('base64').then((imageBuffer) => {
                const contentType = element.contentType || 'image/png';
                return { src: `data:${contentType};base64,${imageBuffer}` };
              });
            }),
          }
        );

        // This will write into the Yjs doc via Collaboration extension
        editor.commands.setContent(html || '<p></p>', false);

        // Mark loaded after setting content, so we don't get stuck blank if setContent never ran.
        config.set('initialContentLoaded', true);
        initialLoadedRef.current = true;
      } catch (e) {
        setLoadError(e?.response?.data?.message || e?.message || 'Failed to load document');
        // Avoid infinite retries; user can refresh to try again.
        ydoc.getMap('config').set('initialContentLoaded', true);
        initialLoadedRef.current = true;
      }
    };

    const onStatus = () => { maybeLoadInitial(); };
    provider.on('status', onStatus);
    maybeLoadInitial();

    return () => {
      provider.off('status', onStatus);
    };
  }, [provider, editor, docId, ydoc]);

  useEffect(() => {
    return () => {
      try { editor?.destroy?.(); } catch { /* ignore */ }
      try { ydoc?.destroy?.(); } catch { /* ignore */ }
    };
  }, [editor, ydoc]);

  const handleBack = () => goBackFromEditor(navigate, '/');

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
            <div className="text-sm font-semibold text-gray-900 truncate">Collaborative doc</div>
            <div className="text-[10px] text-gray-500 truncate">
              Doc: <span className="font-mono">{docId}</span> · Server: <span className="font-mono">{collabServerUrl}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 text-xs text-gray-600">
              <span
                className={[
                  'inline-block h-2 w-2 rounded-full',
                  status === 'connected' ? 'bg-green-500' :
                  status === 'connecting' ? 'bg-yellow-500' :
                  'bg-gray-400',
                ].join(' ')}
              />
              {status}
            </span>
            <span className="hidden sm:inline-flex items-center gap-2 text-xs text-gray-600">
              You:
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: me.color }} />
                {me.name}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        {loadError && (
          <div className="mb-3 p-3 rounded-lg border border-red-100 bg-red-50 text-xs text-red-700">
            {loadError}
          </div>
        )}
        <div className="border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <EditorContent editor={editor} />
        </div>

        <div className="mt-3 text-[11px] text-gray-500">
          Open this same URL in another tab to see live collaboration: <span className="font-mono">/collab/{docId}</span>
        </div>
      </div>
    </div>
  );
}

