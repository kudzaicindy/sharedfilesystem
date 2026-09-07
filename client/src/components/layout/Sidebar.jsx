import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import CloudLogo from '../icons/CloudLogo';
import { NAV_ITEMS, QUICK_ACCESS_ITEMS } from '../../config/navigation';

function UserAvatar({ name, avatar }) {
  if (avatar) {
    return <img src={avatar} alt="" className="w-7 h-7 rounded-lg object-cover ring-1 ring-white/15" />;
  }
  const initials = name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  return (
    <div className="w-7 h-7 rounded-lg bg-brand-maroon/90 text-white flex items-center justify-center text-[10px] font-bold ring-1 ring-white/10">
      {initials}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `group relative w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] font-medium transition-colors
      ${isActive
        ? 'bg-white/12 text-white'
        : 'text-white/65 hover:bg-white/6 hover:text-white'}`;

  return (
    <aside className="w-[196px] flex-shrink-0 sidebar-shell shadow-sidebar flex flex-col h-full text-white">
      <div className="px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <CloudLogo className="w-7 h-7 shrink-0" variant="light" />
          <div className="min-w-0 leading-tight">
            <p className="text-[14px] font-extrabold tracking-tight text-white">Alamait</p>
            <p className="text-[9px] font-medium text-white/40">Shared docs</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
          Workspace
        </p>
        <ul className="space-y-px">
          {NAV_ITEMS.map(({ id, label, path, icon: Icon }) => (
            <li key={id}>
              <NavLink to={path} end={path === '/'} className={linkClass}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-brand-maroon" />
                    )}
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md
                        ${isActive ? 'bg-brand-maroon text-white' : 'bg-white/5 text-white/70 group-hover:text-white'}`}
                    >
                      <Icon size={13} strokeWidth={2} />
                    </span>
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <p className="px-2 mb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">
            Quick access
          </p>
          <ul className="space-y-px">
            {QUICK_ACCESS_ITEMS.map(({ id, label, path, icon: Icon }) => (
              <li key={id}>
                <NavLink to={path} className={linkClass}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r-full bg-brand-maroon" />
                      )}
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md
                          ${isActive ? 'bg-brand-maroon text-white' : 'bg-white/5 text-white/55'}`}
                      >
                        {Icon
                          ? <Icon size={12} strokeWidth={2} />
                          : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                      </span>
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="p-2 border-t border-white/10">
        <div className="rounded-xl bg-white/6 border border-white/8 px-2 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <UserAvatar name={user?.name} avatar={user?.avatar} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-white truncate">{user?.name}</p>
              <p className="text-[9px] text-white/40 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-2 w-full inline-flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold
              text-white/65 hover:text-white rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors"
          >
            <LogOut size={11} />
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
