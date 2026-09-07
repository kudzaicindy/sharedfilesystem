import { LayoutGrid, List, Info } from 'lucide-react';

export default function SectionHeader({
  title,
  showViewMore,
  onViewMore,
  showViewToggle,
  viewMode,
  onViewModeChange,
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <div className="flex items-center gap-2">
        {showViewMore && (
          <button
            type="button"
            onClick={onViewMore}
            className="text-xs font-medium text-cloudy-green hover:text-cloudy-green-dark"
          >
            View more
          </button>
        )}
        {showViewToggle && (
          <div className="flex items-center gap-0.5 text-gray-400">
            <button
              type="button"
              onClick={() => onViewModeChange?.('list')}
              className={`p-1 rounded ${viewMode === 'list' ? 'bg-gray-100 text-gray-700' : 'hover:bg-gray-50'}`}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange?.('grid')}
              className={`p-1 rounded ${viewMode === 'grid' ? 'bg-gray-100 text-gray-700' : 'hover:bg-gray-50'}`}
            >
              <LayoutGrid size={14} />
            </button>
            <button type="button" className="p-1 rounded hover:bg-gray-50">
              <Info size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
