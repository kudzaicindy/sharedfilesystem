import api from './api';

export async function loadAllDocuments(folders) {
  if (!folders.length) return [];
  const results = await Promise.all(
    folders.map(f =>
      api.get(`/documents/folder/${f._id}`).then(r => r.data).catch(() => [])
    )
  );
  return results
    .flat()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}
