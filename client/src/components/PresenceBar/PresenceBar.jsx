export default function PresenceBar({ users = [] }) {
  if (!users.length) return null;
  return (
    <div className="flex items-center gap-1 px-3">
      <span className="text-xs text-gray-400 mr-1">Viewing:</span>
      {users.slice(0, 5).map((u, i) => (
        <div key={i} title={u.name}
          className="w-7 h-7 rounded-full bg-indigo-400 border-2 border-white flex items-center justify-center text-white text-xs font-medium -ml-1">
          {u.name?.[0]?.toUpperCase() || '?'}
        </div>
      ))}
      {users.length > 5 && (
        <span className="text-xs text-gray-500 ml-1">+{users.length - 5} more</span>
      )}
    </div>
  );
}
