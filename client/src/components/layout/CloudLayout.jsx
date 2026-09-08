import { useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import LocalEditBanner from '../LocalEditBanner';
import { useFiles } from '../../context/FilesContext';
import { isOnlyOfficeConfigured } from '../../utils/onlyOfficeAvailability';
import { preloadOnlyOfficeApi } from '../../utils/onlyOfficePreload';

export default function CloudLayout({
  children,
  searchQuery,
  onSearchChange,
}) {
  const { refresh } = useFiles();

  useEffect(() => {
    if (!isOnlyOfficeConfigured()) return undefined;
    const run = () => preloadOnlyOfficeApi();
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex h-screen app-shell-bg overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header searchQuery={searchQuery} onSearchChange={onSearchChange} />
        <LocalEditBanner onSaved={() => refresh?.()} />
        <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-3">
          <div className="mx-auto w-full max-w-6xl animate-fade-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
