import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cloudy-quick-access';

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function useQuickAccess() {
  const [pins, setPins] = useState(readStore);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  }, [pins]);

  const getFolderIds = useCallback((tag) => pins[tag] || [], [pins]);

  const togglePin = useCallback((tag, folderId) => {
    setPins(prev => {
      const list = prev[tag] || [];
      const next = list.includes(folderId)
        ? list.filter(id => id !== folderId)
        : [...list, folderId];
      return { ...prev, [tag]: next };
    });
  }, []);

  const isPinned = useCallback((tag, folderId) => (pins[tag] || []).includes(folderId), [pins]);

  return { getFolderIds, togglePin, isPinned };
}
