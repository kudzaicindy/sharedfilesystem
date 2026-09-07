import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

export function useSearchQuery() {
  const ctx = useOutletContext();
  return ctx?.searchQuery ?? '';
}

export function useFiltered(items, getSearchText) {
  const searchQuery = useSearchQuery();
  return useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => getSearchText(item).toLowerCase().includes(q));
  }, [items, searchQuery, getSearchText]);
}
