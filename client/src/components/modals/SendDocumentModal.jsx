import { useState } from 'react';
import { useFiles } from '../../context/FilesContext';
import { useModal } from './ModalProvider';
import Modal, { ModalButton } from './Modal';
import api from '../../utils/api';

export default function SendDocumentModal({ open, onClose, onSent }) {
  const { documents } = useFiles();
  const { alert } = useModal();
  const [documentId, setDocumentId] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    setDocumentId('');
    setEmail('');
    setRole('viewer');
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!documentId) {
      setError('Select a file to send.');
      return;
    }
    if (!email.trim()) {
      setError('Recipient email is required.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/sends', {
        documentId,
        recipientEmail: email.trim(),
        role,
      });
      await alert(
        `File sent to ${email.trim()}. You can track opens and edits on the Send and Track page.`,
        'File sent'
      );
      onSent?.();
      handleClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send file.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Send file"
      onClose={handleClose}
      size="md"
      footer={
        <>
          <ModalButton variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </ModalButton>
          <ModalButton onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send file'}
          </ModalButton>
        </>
      }
    >
      <p className="text-xs text-gray-500 mb-4">
        Send a file to someone with an Alamait account. Opens and edits are tracked automatically.
      </p>

      {documents.length === 0 ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Upload a file first, then you can send and track it.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">File</label>
            <select
              value={documentId}
              onChange={e => setDocumentId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon bg-white"
            >
              <option value="">Select a file</option>
              {documents.map(doc => (
                <option key={doc._id} value={doc._id}>{doc.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Recipient email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Access level</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-maroon/30 focus:border-brand-maroon bg-white"
            >
              <option value="viewer">Viewer — track opens only</option>
              <option value="editor">Editor — track opens and edits</option>
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
