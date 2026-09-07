import { useState } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Plus } from 'lucide-react';

function FolderNode({ folder, depth = 0, selected, onSelect, children }) {
  const [open, setOpen] = useState(false);
  const isSelected = selected === folder._id;

  return (
    <div>
      <div
        onClick={() => { setOpen(o => !o); onSelect(folder); }}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer text-sm select-none
          ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-100 text-gray-700'}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? <FolderOpen size={15} className="text-indigo-400" /> : <Folder size={15} className="text-gray-400" />}
        <span className="truncate">{folder.name}</span>
      </div>
      {open && children}
    </div>
  );
}

export default function FolderTree({ folders = [], selected, onSelect, onCreateFolder }) {
  const roots = folders.filter(f => !f.parent);
  const childrenOf = id => folders.filter(f => f.parent === id || f.parent?._id === id);

  function renderNode(folder, depth = 0) {
    const kids = childrenOf(folder._id);
    return (
      <FolderNode key={folder._id} folder={folder} depth={depth} selected={selected} onSelect={onSelect}>
        {kids.map(k => renderNode(k, depth + 1))}
      </FolderNode>
    );
  }

  return (
    <aside className="w-56 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Folders</span>
        <button onClick={onCreateFolder} className="p-1 rounded hover:bg-gray-100">
          <Plus size={15} className="text-gray-500" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {roots.map(f => renderNode(f))}
        {roots.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">No folders yet</p>
        )}
      </div>
    </aside>
  );
}
