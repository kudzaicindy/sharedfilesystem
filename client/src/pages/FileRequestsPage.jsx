import { useEffect, useMemo, useState } from 'react';
import { Inbox, Plus, Link2, Copy, Trash2, Check } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';
import { useModal } from '../components/modals/ModalProvider';
import { useFiles } from '../context/FilesContext';
import api from '../utils/api';

export default function FileRequestsPage() {
  const { alert, prompt, pickFolder, confirm } = useModal();
  const { folders } = useFiles();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  const origin = useMemo(() => window.location.origin, []);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/file-requests');
      setItems(data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const folderNameById = useMemo(() => {
    const map = new Map();
    folders?.forEach(f => map.set(String(f._id), f.name));
    return map;
  }, [folders]);

  const buildUploadUrl = (token) => `${origin}/upload/${token}`;

  const openEmailClient = ({ to, subject, body }) => {
    const qs = new URLSearchParams();
    if (subject) qs.set('subject', subject);
    if (body) qs.set('body', body);
    const href = `mailto:${encodeURIComponent(to || '')}?${qs.toString()}`;
    window.location.href = href;
  };

  const handleCreate = async () => {
    if (!folders?.length) {
      await alert('Create a folder first, then create an upload link.', 'No folders');
      return;
    }
    const folder = folders.length === 1 ? folders[0] : await pickFolder(folders, 'Upload link folder');
    if (!folder) return;

    const label = await prompt({
      title: 'Upload link name',
      message: 'Optional label to help you recognize this link.',
      placeholder: 'e.g. Vendor invoices',
      defaultValue: '',
    });

    const { data } = await api.post('/file-requests', {
      folderId: folder._id,
      label: label?.trim() || undefined,
    });

    await refresh();

    try {
      await navigator.clipboard.writeText(buildUploadUrl(data.token));
      setCopiedId(data._id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      await alert('Link created. Copy it using the copy button.', 'Created');
    }
  };

  const handleCopy = async (item) => {
    try {
      await navigator.clipboard.writeText(buildUploadUrl(item.token));
      setCopiedId(item._id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      await alert(buildUploadUrl(item.token), 'Copy this link');
    }
  };

  const handleRevoke = async (item) => {
    const ok = await confirm('Disable this upload link? It will stop accepting uploads.', 'Revoke link');
    if (!ok) return;
    await api.post(`/file-requests/${item._id}/revoke`);
    await refresh();
  };

  const handleEmailRequest = async () => {
    if (!folders?.length) {
      await alert('Create a folder first, then create an upload link.', 'No folders');
      return;
    }
    const folder = folders.length === 1 ? folders[0] : await pickFolder(folders, 'Email request folder');
    if (!folder) return;

    const emails = await prompt({
      title: 'Email request',
      message: 'Enter recipient emails (comma separated).',
      placeholder: 'name@example.com, other@example.com',
      defaultValue: '',
    });
    if (!emails?.trim()) return;

    const label = await prompt({
      title: 'Link label (optional)',
      message: 'Optional label for your own tracking.',
      placeholder: 'e.g. May invoices',
      defaultValue: '',
    });

    const { data } = await api.post('/file-requests', {
      folderId: folder._id,
      label: label?.trim() || undefined,
    });
    await refresh();

    const url = buildUploadUrl(data.token);
    const folderName = folder.name || 'a folder';
    openEmailClient({
      to: emails,
      subject: 'Upload files request',
      body: `Hi,\n\nPlease upload your file(s) using this link:\n${url}\n\nThey will be added to: ${folderName}\n\nThanks`,
    });
  };

  return (
    <>
      <PageHeader
        title="File Requests"
        eyebrow="Inbound"
        description="Create upload links for others to send you files"
        action={
          <button
            type="button"
            onClick={handleCreate}
            className="btn-primary"
          >
            <Plus size={14} />
            New request
          </button>
        }
      />

      <div className="grid sm:grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={handleCreate}
          className="p-2.5 rounded-lg border border-brand-sand bg-white shadow-card flex items-start gap-2.5 hover:border-brand-navy/20 text-left transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-maroon-light flex items-center justify-center shrink-0">
            <Link2 size={14} className="text-brand-maroon" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-brand-ink">Upload link</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
              Anyone with the link can upload to a folder you choose.
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={handleEmailRequest}
          className="p-2.5 rounded-lg border border-brand-sand bg-white shadow-card flex items-start gap-2.5 hover:border-brand-navy/20 text-left transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-mist flex items-center justify-center shrink-0">
            <Inbox size={14} className="text-brand-navy" />
          </div>
          <div>
            <p className="text-[12px] font-bold text-brand-ink">Email request</p>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">
              Send a request to specific people by email.
            </p>
          </div>
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-gray-500">Loading…</div>
      ) : items?.length ? (
        <div className="space-y-2.5">
          {items.map(item => (
            <div key={item._id} className="p-4 rounded-2xl border border-brand-sand bg-white shadow-card flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-bold text-brand-ink truncate">
                    {item.label || 'Upload link'}
                  </p>
                  {!item.isActive && (
                    <span className="text-[10px] px-2 py-0.5 rounded-lg bg-brand-mist text-gray-500 font-semibold">revoked</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Folder: {folderNameById.get(String(item.folder)) || 'Unknown'} · Uploads: {item.uploadCount || 0}
                </p>
                <p className="text-[10px] text-gray-400 mt-1.5 truncate" title={buildUploadUrl(item.token)}>
                  {buildUploadUrl(item.token)}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(item)}
                  className="p-2 rounded-xl hover:bg-brand-mist border border-brand-sand text-gray-600"
                  title="Copy link"
                >
                  {copiedId === item._id ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => handleRevoke(item)}
                  disabled={!item.isActive}
                  className="p-2 rounded-xl hover:bg-brand-mist border border-brand-sand text-gray-600 disabled:opacity-40"
                  title="Revoke link"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Inbox}
          title="No active file requests"
          description="Create a request link and collect files without sharing your whole drive."
          action={
            <button
              type="button"
              onClick={handleCreate}
              className="btn-primary"
            >
              Create request
            </button>
          }
        />
      )}
    </>
  );
}
