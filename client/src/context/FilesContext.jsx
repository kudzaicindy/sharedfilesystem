import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { loadAllDocuments } from '../utils/files';
import { useModal } from '../components/modals/ModalProvider';

const FilesContext = createContext(null);

export function FilesProvider({ children }) {
  const { alert, prompt, pickFolder } = useModal();
  const [folders, setFolders] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const uploadFolderRef = useRef(null);

  const refresh = useCallback(async () => {
    const { data: folderList } = await api.get('/folders');
    setFolders(folderList);
    const docs = await loadAllDocuments(folderList);
    setDocuments(docs);
    return { folders: folderList, documents: docs };
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const createFolder = useCallback(async (name, parentFolder = null) => {
    let folderName = name?.trim();
    if (!folderName) {
      folderName = await prompt({
        title: parentFolder ? 'Create subfolder' : 'Create folder',
        message: parentFolder
          ? `Create a folder inside “${parentFolder.name}”.`
          : 'Enter a name for the new folder.',
        placeholder: 'Folder name',
      });
    }
    if (!folderName?.trim()) return null;
    const body = { name: folderName.trim() };
    if (parentFolder?._id) body.parentId = parentFolder._id;
    const { data } = await api.post('/folders', body);
    setFolders(f => [...f, data]);
    await refresh();
    return data;
  }, [prompt, refresh]);

  const renameFolder = useCallback(async (folder) => {
    const nextName = await prompt({
      title: 'Rename folder',
      message: 'Enter a new name.',
      placeholder: 'Folder name',
      defaultValue: folder?.name || '',
    });
    if (!nextName?.trim() || nextName.trim() === folder.name) return null;
    const { data } = await api.patch(`/folders/${folder._id}`, { name: nextName.trim() });
    await refresh();
    return data;
  }, [prompt, refresh]);

  const moveFolder = useCallback(async (folder) => {
    const ROOT = { _id: '__root__', name: '— Top level (no parent) —' };
    const targets = [
      ROOT,
      ...folders.filter((f) => String(f._id) !== String(folder._id)),
    ];
    const picked = await pickFolder(targets, `Move “${folder.name}” into`);
    if (!picked) return null;
    const parentId = picked._id === '__root__' ? null : picked._id;
    if (String(parentId || '') === String(folder.parent || '')) return null;
    const { data } = await api.post(`/folders/${folder._id}/move`, { parentId });
    await refresh();
    return data;
  }, [folders, pickFolder, refresh]);

  const deleteFolder = useCallback(async (folder) => {
    await api.delete(`/folders/${folder._id}`);
    await refresh();
  }, [refresh]);

  const pickUploadFolder = useCallback(async (preferredFolder) => {
    if (preferredFolder) return preferredFolder;
    if (folders.length === 0) {
      await alert('Create a folder first using "Create Folder".', 'No folders');
      return null;
    }
    if (folders.length === 1) return folders[0];
    return pickFolder(folders, 'Upload to folder');
  }, [folders, alert, pickFolder]);

  const uploadFile = useCallback(async (file, preferredFolder) => {
    if (!file) return null;
    const folder = await pickUploadFolder(preferredFolder);
    if (!folder) return null;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folderId', folder._id);
      const { data } = await api.post('/documents/upload', form);
      await refresh();
      return data;
    } finally {
      setUploading(false);
    }
  }, [pickUploadFolder, refresh]);

  const openUploadDialog = useCallback(async (preferredFolder) => {
    if (preferredFolder) {
      uploadFolderRef.current = preferredFolder;
      fileInputRef.current?.click();
      return;
    }
    const folder = await pickUploadFolder(null);
    if (!folder) return;
    uploadFolderRef.current = folder;
    fileInputRef.current?.click();
  }, [pickUploadFolder]);

  const deleteDocument = useCallback(async (docId) => {
    await api.delete(`/documents/${docId}`);
    await refresh();
  }, [refresh]);

  const restoreDocument = useCallback(async (docId) => {
    await api.post(`/documents/${docId}/restore`);
    await refresh();
  }, [refresh]);

  return (
    <FilesContext.Provider value={{
      folders,
      documents,
      loading,
      uploading,
      refresh,
      createFolder,
      renameFolder,
      moveFolder,
      deleteFolder,
      uploadFile,
      openUploadDialog,
      deleteDocument,
      restoreDocument,
      fileInputRef,
    }}>
      {children}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          const preferred = uploadFolderRef.current;
          if (file) await uploadFile(file, preferred);
          e.target.value = '';
          uploadFolderRef.current = null;
        }}
      />
    </FilesContext.Provider>
  );
}

export const useFiles = () => {
  const ctx = useContext(FilesContext);
  if (!ctx) throw new Error('useFiles must be used within FilesProvider');
  return ctx;
};
