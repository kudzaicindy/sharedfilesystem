import { useEffect, useMemo, useRef, useState } from 'react';
import { getDocumentViewUrl } from '../../utils/api';

function isPdf(name = '') {
  return name.split('.').pop()?.toLowerCase() === 'pdf';
}

/** Renders a real PDF thumbnail (page 1) when possible. */
export default function DocPreview({ document }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const canvasRef = useRef(null);

  const pdfUrl = useMemo(() => {
    if (!document?._id) return null;
    if (!isPdf(document?.name)) return null;
    return getDocumentViewUrl(document._id);
  }, [document?._id, document?.name]);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      if (!pdfUrl) return;
      setStatus('loading');
      try {
        const pdfjs = await import('pdfjs-dist/build/pdf');
        // worker must be set for pdfjs-dist
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
        // eslint-disable-next-line no-underscore-dangle
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default || worker;

        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: false,
          // some servers/proxies block range requests; thumbnails work fine without them
          disableRange: true,
          disableStream: true,
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const ctx = canvas.getContext('2d', { alpha: false });
        const targetW = 420; // reasonable thumb width, scaled down by CSS
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetW / viewport.width;
        const vp = page.getViewport({ scale });

        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);

        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  // Fallback placeholder (matches prior Cloudy mock)
  const Placeholder = (
    <div className="w-full aspect-[16/9] bg-gray-50 border-b border-gray-100 p-1.5 flex flex-col gap-0.5 overflow-hidden">
      <div className="h-1 bg-gray-200 rounded w-3/4" />
      <div className="h-0.5 bg-gray-100 rounded w-full" />
      <div className="h-0.5 bg-gray-100 rounded w-full" />
      <div className="h-0.5 bg-gray-100 rounded w-5/6" />
      <div className="flex-1 min-h-[4px]" />
      <div className="grid grid-cols-3 gap-0.5">
        <div className="h-3 bg-gray-100 rounded" />
        <div className="h-3 bg-gray-100 rounded" />
        <div className="h-3 bg-gray-100 rounded" />
      </div>
    </div>
  );

  if (!pdfUrl) return Placeholder;

  return (
    <div className="w-full aspect-[16/9] bg-gray-50 border-b border-gray-100 overflow-hidden relative">
      {(status === 'idle' || status === 'loading') && (
        <div className="absolute inset-0 animate-pulse bg-gray-50" />
      )}
      {status !== 'error' ? (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
        />
      ) : (
        Placeholder
      )}
    </div>
  );
}
