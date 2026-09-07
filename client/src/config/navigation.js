import {
  LayoutDashboard,
  FolderOpen,
  Send,
  Users,
  Inbox,
  Trash2,
  Star,
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { id: 'all-files', label: 'All Files', path: '/files', icon: FolderOpen },
  { id: 'send-track', label: 'Send and Track', path: '/send-track', icon: Send },
  { id: 'shared', label: 'Shared', path: '/shared', icon: Users },
  { id: 'file-requests', label: 'File Requests', path: '/file-requests', icon: Inbox },
  { id: 'deleted', label: 'Deleted Files', path: '/deleted', icon: Trash2 },
];

export const QUICK_ACCESS_ITEMS = [
  { id: 'starred', label: 'Starred', path: '/quick/starred', icon: Star },
  { id: 'finance', label: 'Finance', path: '/quick/finance' },
  { id: 'report', label: 'Report', path: '/quick/report' },
  { id: 'event', label: 'Event', path: '/quick/event' },
];

export function getActiveNavId(pathname) {
  if (pathname.startsWith('/quick/')) return pathname.split('/')[2] || 'starred';
  const match = NAV_ITEMS.find(n => n.path === pathname);
  return match?.id ?? 'all-files';
}
