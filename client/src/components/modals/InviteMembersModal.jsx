import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useFiles } from '../../context/FilesContext';
import { useModal } from './ModalProvider';
import Modal, { ModalButton } from './Modal';
import api from '../../utils/api';

export default function InviteMembersModal({ open, onClose }) {
  const { user } = useAuth();
  const { folders, refresh } = useFiles();
  const { alert } = useModal();
  const [email, setEmail] = useState('');
  const [folderId, setFolderId] = useState('');
  const [role, setRole] = useState('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const ownedFolders = useMemo(
    () => folders.filter(f => f.owner === user?._id || f.owner?._id === user?._id),
    [folders, user]
  );

  const handleClose = () => {
    setEmail('');
    setFolderId('');
    setRole('viewer');
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!folderId) {
      setError('Select a folder to share.');
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post(`/folders/${folderId}/share`, {
        email: email.trim(),
        role,
      });
      await refresh();
      const sent = data?.emailSent;
      const title = sent ? 'Invite email sent' : 'Invite saved';
      let body = data?.message
        || (sent
          ? `Invite email sent to ${email.trim()}.`
          : `Invite saved for ${email.trim()}.`);
      if (!sent && data?.inviteUrl) {
        body += `\n\nShare this link:\n${data.inviteUrl}`;
        try {
          await navigator.clipboard.writeText(data.inviteUrl);
          body += '\n\n(Link copied to clipboard.)';
        } catch {
          // clipboard may be blocked
        }
      }
      await alert(body, title);
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to invite member.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Invite Members"
      onClose={handleClose}
      size="md"
      footer={
        <>
          <ModalButton variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </ModalButton>
          <ModalButton onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send invite'}
          </ModalButton>
        </>
      }
    >
      <p className="text-xs text-gray-500 mb-4">
        We’ll email them an invite link. New users get access after they create an account from that link.
      </p>

      {ownedFolders.length === 0 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Create a folder first, then you can invite members to it.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Folder</label>
            <select
              value={folderId}
              onChange={e => setFolderId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon bg-white"
            >
              <option value="">Select a folder</option>
              {ownedFolders.map(f => (
                <option key={f._id} value={f._id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Access level</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon bg-white"
            >
              <option value="viewer">Viewer — can view files</option>
              <option value="editor">Editor — can upload and edit</option>
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
