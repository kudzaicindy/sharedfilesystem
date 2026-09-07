import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';

export default function PublicUploadPage() {
  const { token } = useParams();
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState({ uploading: false, message: null, error: null });

  const canSubmit = useMemo(() => !!file && !status.uploading, [file, status.uploading]);

  useEffect(() => {
    setStatus({ uploading: false, message: null, error: null });
  }, [token]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setStatus({ uploading: true, message: null, error: null });
    try {
      const form = new FormData();
      form.append('file', file);
      if (name.trim()) form.append('name', name.trim());
      const { data } = await api.post(`/file-requests/${token}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setStatus({ uploading: false, message: data?.message || 'Uploaded', error: null });
      setFile(null);
    } catch (err) {
      setStatus({
        uploading: false,
        message: null,
        error: err.response?.data?.message || 'Upload failed',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-xl shadow-card p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold text-gray-900">Upload files</div>
          <div className="text-xs text-gray-500 mt-0.5">Use this link to upload a file.</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Your name (optional)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon"
              placeholder="e.g. John"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">File</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>

          {status.error && <div className="text-xs text-brand-maroon">{status.error}</div>}
          {status.message && <div className="text-xs text-cloudy-green">{status.message}</div>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold bg-gray-900 bg-brand-navy text-white disabled:opacity-50"
          >
            {status.uploading ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      </div>
    </div>
  );
}

