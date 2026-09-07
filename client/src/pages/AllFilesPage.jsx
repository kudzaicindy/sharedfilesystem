import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  Download,
  MoreVertical,
  Share2,
  Trash2,
  CheckSquare,
  Square,
  Info,
  Pencil,
  FolderInput,
  FolderOpen,
  FilePlus2,
  Home,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useFiles } from '../context/FilesContext';
import { useModal } from '../components/modals/ModalProvider';
import { useFiltered } from '../hooks/useSearchFilter';
import { useDocumentActions } from '../hooks/useDocumentActions';
import { useSocket } from '../hooks/useSocket';
import QuickActions from '../components/dashboard/QuickActions';
import FolderCard from '../components/dashboard/FolderCard';
import AuditSidebar from '../components/AuditSidebar/AuditSidebar';
import FileTypeIcon from '../components/files/FileTypeIcon';
import api from '../utils/api';

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateShort(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

function fileBadge(name = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (!ext || ext.length > 5) return 'FILE';
  return ext.toUpperCase();
}

function DropdownMenuModal({ open, onClose, anchorEl, children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) return;
    try {
      const r = anchorEl?.getBoundingClientRect?.();
      if (r) {
        const width = 176;
        const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
        const top = Math.min(r.bottom + 6, window.innerHeight - 16);
        setPos({ left, top });
      } else {
        setPos({ left: 16, top: 16 });
      }
    } catch {
      setPos({ left: 16, top: 16 });
    }
  }, [open, anchorEl]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <button
        type="button"
        aria-label="Close menu"
        className="absolute inset-0 w-full h-full cursor-default"
        onClick={onClose}
      />
      <div
        className="fixed w-44 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden animate-in fade-in"
        style={{ left: pos?.left ?? 16, top: pos?.top ?? 16 }}
        role="menu"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function MenuItem({ icon: Icon, children, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full px-2.5 py-2 flex items-center gap-2 text-xs disabled:opacity-50
        ${danger ? 'text-red-700 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-50'}`}
    >
      {Icon && <Icon size={14} className={danger ? 'text-red-500' : 'text-gray-500'} />}
      <span className="flex-1 text-left">{children}</span>
    </button>
  );
}

function Breadcrumbs({ crumbs, onNavigate }) {
  return (
    <nav aria-label="Folder path" className="flex items-center gap-1 min-w-0 flex-wrap">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={crumb.id || 'root'} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={12} className="text-gray-300 shrink-0" />}
            <button
              type="button"
              disabled={isLast}
              onClick={() => onNavigate(crumb.folder)}
              className={`text-xs truncate max-w-[160px] ${
                isLast
                  ? 'font-semibold text-gray-900 cursor-default'
                  : 'font-medium text-gray-500 hover:text-brand-navy'
              }`}
            >
              {i === 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Home size={12} className="shrink-0" />
                  {crumb.label}
                </span>
              ) : crumb.label}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

function EmptyState({ title, description, actions }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-3 py-8">
      <div className="w-9 h-9 rounded-full bg-brand-maroon-light text-brand-maroon flex items-center justify-center mb-2">
        <FolderOpen size={16} />
      </div>
      <p className="text-xs font-semibold text-gray-900">{title}</p>
      {description && <p className="text-[11px] text-gray-500 mt-0.5 max-w-xs">{description}</p>}
      {actions?.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
          {actions}
        </div>
      )}
    </div>
  );
}

export default function AllFilesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const socketRef = useSocket();
  const {
    folders, documents, loading, uploading,
    createFolder, openUploadDialog,
    deleteDocument,
    renameFolder, moveFolder, deleteFolder, refresh,
  } = useFiles();
  const { alert, openWith, prompt, confirm } = useModal();

  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderDocs, setFolderDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [menuForId, setMenuForId] = useState(null);
  const [folderMenu, setFolderMenu] = useState(null);
  const menuBtnRefs = useRef(new Map());

  const ownerName = user?.name || 'You';
  const folderById = useMemo(() => {
    const map = new Map();
    folders.forEach((f) => map.set(String(f._id), f));
    return map;
  }, [folders]);

  const fileCountByFolder = useMemo(() => {
    const map = new Map();
    documents.forEach((d) => {
      const key = String(d.folder);
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [documents]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [{ id: 'root', label: 'All files', folder: null }];
    if (!selectedFolder) return crumbs;
    const chain = [];
    let cur = selectedFolder;
    const seen = new Set();
    while (cur) {
      const id = String(cur._id);
      if (seen.has(id)) break;
      seen.add(id);
      chain.unshift(cur);
      cur = cur.parent ? folderById.get(String(cur.parent)) : null;
    }
    chain.forEach((f) => {
      crumbs.push({ id: String(f._id), label: f.name, folder: f });
    });
    return crumbs;
  }, [selectedFolder, folderById]);

  const showActivity = (doc) => {
    setSelectedDoc(doc);
    setShowAudit(true);
    const socket = socketRef.current;
    if (socket) socket.emit('join:document', doc._id);
  };

  const { handleOpen, handleOpenWith, handleDownload } = useDocumentActions({
    alert,
    openWith,
    onShowActivity: showActivity,
  });

  const filteredFolders = useFiltered(folders, (f) => f.name);
  const childFolders = useMemo(() => {
    if (!selectedFolder) return filteredFolders.filter((f) => !f.parent);
    return filteredFolders.filter((f) => String(f.parent) === String(selectedFolder._id));
  }, [filteredFolders, selectedFolder]);

  const filteredDocuments = useFiltered(
    selectedFolder ? folderDocs : documents,
    (d) => d.name,
  );

  const reloadFolderDocs = useCallback(async (folderId) => {
    const r = await api.get(`/documents/folder/${folderId}`);
    setFolderDocs(r.data);
  }, []);

  useEffect(() => {
    if (!selectedFolder) {
      setFolderDocs([]);
      setSelectedIds(new Set());
      return;
    }
    reloadFolderDocs(selectedFolder._id).catch(() => setFolderDocs([]));
  }, [selectedFolder, reloadFolderDocs]);

  // Keep selected folder object in sync after refresh/rename
  useEffect(() => {
    if (!selectedFolder) return;
    const fresh = folderById.get(String(selectedFolder._id));
    if (!fresh) {
      setSelectedFolder(null);
      return;
    }
    if (fresh !== selectedFolder && (
      fresh.name !== selectedFolder.name
      || String(fresh.parent || '') !== String(selectedFolder.parent || '')
    )) {
      setSelectedFolder(fresh);
    }
  }, [folderById, selectedFolder]);

  const handleQuickAction = (id) => {
    if (id === 'create' || id === 'upload') openUploadDialog(selectedFolder);
    else if (id === 'folder') createFolder(undefined, selectedFolder);
    else if (id === 'send') navigate('/send-track');
    else alert('This feature is coming soon.', 'Coming soon');
  };

  const openFolder = (folder) => {
    setSelectedFolder(folder);
    setSelectedDoc(null);
    setShowAudit(false);
    setSelectedIds(new Set());
    setMenuForId(null);
  };

  const navigateBreadcrumb = (folder) => {
    setSelectedFolder(folder);
    setShowAudit(false);
    setSelectedIds(new Set());
  };

  const rows = useMemo(() => filteredDocuments.map((doc) => ({
    doc,
    owner: doc.uploadedBy?.name || ownerName,
    lastOpened: doc.lastOpenedAt || doc.updatedAt || doc.createdAt,
    size: doc.size,
  })), [filteredDocuments, ownerName]);

  const selectedCount = selectedIds.size;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (rows.length === 0) return prev;
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.doc._id));
    });
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedDocs = useMemo(
    () => rows.filter((r) => selectedIds.has(r.doc._id)).map((r) => r.doc),
    [rows, selectedIds],
  );

  const bulkDownload = async () => {
    for (const doc of selectedDocs) {
      // eslint-disable-next-line no-await-in-loop
      await handleDownload(doc);
    }
  };

  const bulkDelete = async () => {
    const ok = await confirm(`Move ${selectedCount} file(s) to trash?`, 'Delete files');
    if (!ok) return;
    for (const doc of selectedDocs) {
      // eslint-disable-next-line no-await-in-loop
      await deleteDocument(doc._id);
    }
    setSelectedIds(new Set());
    if (selectedFolder) await reloadFolderDocs(selectedFolder._id);
    else await refresh();
  };

  const bulkShare = async () => {
    if (selectedCount !== 1) {
      await alert('Select a single file to share for now.', 'Share selected');
      return;
    }
    navigate('/send-track');
  };

  const renameOne = async (doc) => {
    const nextName = await prompt({
      title: 'Rename file',
      message: 'Enter a new name.',
      placeholder: 'File name',
      defaultValue: doc.name || '',
    });
    if (!nextName?.trim() || nextName.trim() === doc.name) return;
    await api.patch(`/documents/${doc._id}`, { name: nextName.trim() });
    if (selectedFolder) await reloadFolderDocs(selectedFolder._id);
    else await refresh();
  };

  const showInfo = async (doc) => {
    await alert(
      `Name: ${doc.name}\nSize: ${formatBytes(doc.size)}\nType: ${doc.mimeType || '—'}`,
      'File info',
    );
  };

  const folderSubtitle = (folder) => {
    const count = fileCountByFolder.get(String(folder._id)) || 0;
    const kids = folders.filter((f) => String(f.parent) === String(folder._id)).length;
    const bits = [];
    if (count) bits.push(`${count} file${count === 1 ? '' : 's'}`);
    if (kids) bits.push(`${kids} folder${kids === 1 ? '' : 's'}`);
    return bits.length ? bits.join(' · ') : 'Empty folder';
  };

  const runFolderRename = async (folder) => {
    setFolderMenu(null);
    await renameFolder(folder);
  };

  const runFolderMove = async (folder) => {
    setFolderMenu(null);
    await moveFolder(folder);
    if (selectedFolder && String(selectedFolder._id) === String(folder._id)) {
      setSelectedFolder(null);
    }
  };

  const runFolderDelete = async (folder) => {
    setFolderMenu(null);
    const ok = await confirm(
      `Move “${folder.name}” and its contents to trash?`,
      'Delete folder',
    );
    if (!ok) return;
    await deleteFolder(folder);
    if (selectedFolder && String(selectedFolder._id) === String(folder._id)) {
      setSelectedFolder(null);
    }
  };

  if (loading) {
    return <p className="text-xs text-gray-400 py-10 text-center animate-pulse">Loading…</p>;
  }

  const hasFolders = childFolders.length > 0;
  const hasFiles = rows.length > 0;

  return (
    <>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="section-label mb-0.5">Library</p>
          <h1 className="text-[15px] font-extrabold text-brand-ink tracking-tight truncate">
            {selectedFolder ? selectedFolder.name : 'All files'}
          </h1>
          <div className="mt-1">
            <Breadcrumbs crumbs={breadcrumbs} onNavigate={navigateBreadcrumb} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => createFolder(undefined, selectedFolder)}
            className="btn-secondary"
          >
            <FolderInput size={13} />
            {selectedFolder ? 'Subfolder' : 'Folder'}
          </button>
          <button
            type="button"
            onClick={() => openUploadDialog(selectedFolder)}
            disabled={uploading}
            className="btn-primary"
          >
            <FilePlus2 size={13} />
            {uploading ? '…' : 'Upload'}
          </button>
        </div>
      </header>

      <QuickActions
        onAction={handleQuickAction}
        uploading={uploading}
        inFolder={Boolean(selectedFolder)}
      />

      {hasFolders && (
        <section className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="section-label">Folders</h2>
            <span className="text-[10px] font-medium text-gray-400">{childFolders.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {childFolders.map((folder) => (
              <FolderCard
                key={folder._id}
                folder={folder}
                subtitle={folderSubtitle(folder)}
                onClick={() => openFolder(folder)}
                onMenu={(f, el) => setFolderMenu({ folder: f, el })}
              />
            ))}
          </div>
        </section>
      )}

      <DropdownMenuModal
        open={Boolean(folderMenu)}
        onClose={() => setFolderMenu(null)}
        anchorEl={folderMenu?.el}
      >
        <MenuItem icon={Pencil} onClick={() => runFolderRename(folderMenu.folder)}>Rename</MenuItem>
        <MenuItem icon={FolderInput} onClick={() => runFolderMove(folderMenu.folder)}>Move</MenuItem>
        <div className="h-px bg-gray-100" />
        <MenuItem danger icon={Trash2} onClick={() => runFolderDelete(folderMenu.folder)}>
          Move to trash
        </MenuItem>
      </DropdownMenuModal>

      <section className="surface-panel overflow-hidden">
        <div className="px-2.5 py-1.5 border-b border-brand-mist bg-brand-mist/40 flex items-center justify-between gap-2">
          <div className="text-[12px] font-bold text-brand-ink">
            Files
            <span className="ml-1 text-[10px] font-medium text-gray-400">{rows.length}</span>
          </div>
          {selectedCount > 0 && (
            <div className="text-[10px] font-semibold text-brand-maroon">
              {selectedCount} selected
            </div>
          )}
        </div>

        {selectedCount > 0 && (
          <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap items-center gap-2 bg-brand-maroon-light/40">
            <button
              type="button"
              onClick={bulkShare}
              className="px-2.5 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-medium hover:bg-brand-navy/90 inline-flex items-center gap-1.5"
            >
              <Share2 size={14} />
              Share
            </button>
            <button
              type="button"
              onClick={bulkDownload}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 inline-flex items-center gap-1.5"
            >
              <Download size={14} />
              Download
            </button>
            <button
              type="button"
              onClick={bulkDelete}
              className="px-2.5 py-1.5 rounded-lg bg-white border border-red-100 text-red-700 text-xs font-medium hover:bg-red-50 inline-flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}

        {!hasFiles ? (
          <EmptyState
            title={selectedFolder ? 'This folder is empty' : 'No files yet'}
            description={
              selectedFolder
                ? 'Upload a file or create a subfolder to get started.'
                : 'Create a folder, then upload documents to organize your workspace.'
            }
            actions={[
              <button
                key="upload"
                type="button"
                onClick={() => openUploadDialog(selectedFolder)}
                className="px-3 py-1.5 rounded-lg bg-brand-navy text-white text-xs font-medium"
              >
                Upload file
              </button>,
              <button
                key="folder"
                type="button"
                onClick={() => createFolder(undefined, selectedFolder)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700"
              >
                {selectedFolder ? 'New subfolder' : 'New folder'}
              </button>,
            ]}
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-2.5 py-1.5 w-7">
                    <button type="button" onClick={toggleAll} className="text-gray-400 hover:text-gray-800">
                      {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  </th>
                  <th className="px-2.5 py-1.5 text-left">Name</th>
                  <th className="px-2.5 py-1.5 text-left hidden md:table-cell">Owner</th>
                  <th className="px-2.5 py-1.5 text-left hidden lg:table-cell">Modified</th>
                  <th className="px-2.5 py-1.5 text-left hidden sm:table-cell">Size</th>
                  <th className="px-2.5 py-1.5 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(({ doc, owner, lastOpened, size }) => {
                  const checked = selectedIds.has(doc._id);
                  const anchorEl = menuBtnRefs.current.get(doc._id) || null;
                  return (
                    <tr
                      key={doc._id}
                      className={checked ? 'bg-brand-maroon-light/40' : 'hover:bg-gray-50/80'}
                    >
                      <td className="px-2.5 py-1.5">
                        <button type="button" onClick={() => toggleOne(doc._id)} className="text-gray-400 hover:text-gray-800">
                          {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                      </td>
                      <td className="px-2.5 py-1.5 font-medium text-gray-900 max-w-[360px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-50 border border-gray-100 shrink-0">
                            <FileTypeIcon name={doc.name} size={12} />
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpen(doc)}
                            className="text-left hover:text-brand-navy truncate"
                          >
                            {doc.name}
                          </button>
                          <span className="hidden sm:inline-flex text-[8px] font-bold px-1 py-0.5 rounded bg-gray-100 text-gray-500">
                            {fileBadge(doc.name)}
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5 py-1.5 text-gray-600 hidden md:table-cell">{owner}</td>
                      <td className="px-2.5 py-1.5 text-gray-600 hidden lg:table-cell">{formatDateShort(lastOpened)}</td>
                      <td className="px-2.5 py-1.5 text-gray-600 hidden sm:table-cell tabular-nums">{formatBytes(size)}</td>
                      <td className="px-2.5 py-1.5 relative">
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) menuBtnRefs.current.set(doc._id, el);
                          }}
                          onClick={() => setMenuForId((prev) => (prev === doc._id ? null : doc._id))}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        >
                          <MoreVertical size={14} />
                        </button>
                        <DropdownMenuModal
                          open={menuForId === doc._id}
                          onClose={() => setMenuForId(null)}
                          anchorEl={anchorEl}
                        >
                          <MenuItem icon={Download} onClick={() => { setMenuForId(null); handleDownload(doc); }}>
                            Download
                          </MenuItem>
                          <MenuItem icon={ExternalLink} onClick={() => { setMenuForId(null); handleOpenWith(doc); }}>
                            Open with…
                          </MenuItem>
                          <MenuItem icon={Pencil} onClick={async () => { setMenuForId(null); await renameOne(doc); }}>
                            Rename
                          </MenuItem>
                          <MenuItem icon={Info} onClick={async () => { setMenuForId(null); await showInfo(doc); }}>
                            Info
                          </MenuItem>
                          <div className="h-px bg-gray-100" />
                          <MenuItem
                            danger
                            icon={Trash2}
                            onClick={async () => {
                              setMenuForId(null);
                              const ok = await confirm('Move this file to trash?', 'Delete file');
                              if (ok) {
                                await deleteDocument(doc._id);
                                if (selectedFolder) await reloadFolderDocs(selectedFolder._id);
                              }
                            }}
                          >
                            Move to trash
                          </MenuItem>
                        </DropdownMenuModal>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAudit && (
        <AuditSidebar
          resourceId={selectedDoc?._id || selectedFolder?._id}
          onClose={() => setShowAudit(false)}
        />
      )}
    </>
  );
}
