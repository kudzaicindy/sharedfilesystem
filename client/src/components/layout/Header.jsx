import { useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import InviteMembersModal from '../modals/InviteMembersModal';

function UserAvatar({ name, avatar }) {
  if (avatar) {
    return <img src={avatar} alt="" className="w-7 h-7 rounded-lg object-cover ring-1 ring-brand-sand" />;
  }
  const initials = name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  return (
    <div className="w-7 h-7 rounded-lg bg-brand-maroon-light text-brand-maroon flex items-center justify-center text-[9px] font-bold ring-1 ring-brand-maroon/10">
      {initials}
    </div>
  );
}

export default function Header({ searchQuery, onSearchChange }) {
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const roleLabel = user?.role === 'admin' ? 'Admin' : 'Member';

  return (
    <>
      <header className="h-11 flex-shrink-0 border-b border-brand-sand/80 bg-white/75 backdrop-blur-md flex items-center gap-2 px-3 sm:px-4">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
            <input
              type="search"
              placeholder="Search…"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-2.5 py-1.5 bg-brand-mist/80 border border-transparent rounded-lg text-[12px] text-brand-ink
                placeholder:text-gray-400 hover:bg-brand-mist focus:bg-white focus:border-brand-sand focus-ring transition-colors"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="hidden sm:inline-flex btn-primary"
        >
          <UserPlus size={13} />
          Invite
        </button>

        <div className="flex items-center gap-2 pl-0.5">
          <div className="text-right hidden md:block leading-tight">
            <p className="text-[11px] font-semibold text-brand-ink">{user?.name}</p>
            <p className="text-[9px] text-gray-500 font-medium">{roleLabel}</p>
          </div>
          <UserAvatar name={user?.name} avatar={user?.avatar} />
        </div>
      </header>

      <InviteMembersModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </>
  );
}
