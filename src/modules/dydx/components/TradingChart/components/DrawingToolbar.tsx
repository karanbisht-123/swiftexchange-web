import { ChevronLeft, ChevronRight, Eraser, MousePointer2, Trash2, X } from 'lucide-react';
import { memo } from 'react';

import { DRAWING_COLORS, DRAWING_WIDTHS, TOOL_CATEGORIES } from '../constants/toolCategories';
import type { ToolCategory } from '../types';

// ============================================================================
// Main toolbar
// ============================================================================
export interface DrawingToolbarProps {
  show: boolean;
  onShow: () => void;
  onHide: () => void;
  activeTool: string | null;
  activeCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectTool: (id: string | null) => void;
  onClear: () => void;
}

export const DrawingToolbar = memo(function DrawingToolbar({
  show,
  onShow,
  onHide,
  activeTool,
  activeCategory,
  onSelectCategory,
  onSelectTool,
  onClear,
}: DrawingToolbarProps) {
  if (!show) {
    return (
      <div
        onClick={onShow}
        className="absolute left-0 top-0 bottom-0 w-2.5 hover:w-5 z-35 transition-all duration-200 cursor-pointer flex items-center group pointer-events-auto bg-transparent hover:bg-hover/10"
        title="Show Drawing Tools"
      >
        <button className="absolute left-0 top-[120px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-secondary border-y border-r border-color rounded-r-md py-2.5 px-0.5 text-gray-400 hover:text-primary shadow-md flex items-center justify-center">
          <ChevronRight className="w-3.5 h-6 text-gray-400" />
        </button>
      </div>
    );
  }

  const activeCatObj: ToolCategory | undefined = TOOL_CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className="absolute left-0 top-0 bottom-0 w-[46px] z-35 flex flex-col items-center py-2 bg-secondary border-r border-color shadow-lg select-none gap-1">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.25); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(156, 163, 175, 0.45); }
        @keyframes slideIn { from { transform: translateX(-8px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-in { animation: slideIn 0.12s ease-out forwards; }
      `}</style>

      <button
        onClick={() => {
          onSelectTool(null);
          onSelectCategory(null);
        }}
        className={`p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] min-h-[32px] ${
          !activeTool ? 'bg-brand/15 text-brand' : 'text-gray-400 hover:bg-hover hover:text-primary'
        }`}
        title="Cursor"
      >
        <MousePointer2 className="w-4 h-4" />
      </button>

      <div className="w-6 h-px bg-color my-1 shrink-0" />

      {TOOL_CATEGORIES.map(cat => {
        const isCatActive = cat.sections.some(sec => sec.tools.some(t => t.id === activeTool));
        const isOpen = activeCategory === cat.id;
        const isActive = isOpen || isCatActive;

        let displayIcon = cat.icon;
        for (const sec of cat.sections) {
          const found = sec.tools.find(t => t.id === activeTool);
          if (found) {
            displayIcon = found.icon;
            break;
          }
        }

        return (
          <div key={cat.id} className="relative">
            <button
              onClick={e => {
                e.stopPropagation();
                onSelectCategory(activeCategory === cat.id ? null : cat.id);
              }}
              className={`p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] min-h-[32px] relative ${
                isActive
                  ? 'bg-brand/15 text-brand border border-brand/20'
                  : 'text-gray-400 hover:bg-hover hover:text-primary'
              }`}
              title={cat.label}
            >
              {displayIcon}
            </button>
          </div>
        );
      })}

      <div className="w-6 h-px bg-color my-1 shrink-0" />

      <button
        onClick={() => {
          onClear();
          onSelectCategory(null);
        }}
        className="p-2 rounded-lg transition-colors flex items-center justify-center min-w-[32px] min-h-[32px] text-gray-400 hover:bg-hover hover:text-red-400"
        title="Clear Drawings"
      >
        <Eraser className="w-4 h-4" />
      </button>

      <div className="mt-auto pt-2 border-t border-color w-full flex justify-center shrink-0">
        <button
          onClick={() => {
            onHide();
            onSelectCategory(null);
          }}
          className="p-2 rounded-lg text-gray-400 hover:bg-hover hover:text-primary transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
          title="Collapse Toolbar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {activeCatObj && (
        <>
          <div
            className="fixed inset-0 z-30 pointer-events-auto"
            onClick={() => onSelectCategory(null)}
          />
          <div
            className="absolute left-[45px] top-0 bottom-0 w-[240px] bg-secondary border-r border-color shadow-2xl z-35 flex flex-col select-none animate-slide-in pointer-events-auto"
            style={{ height: '100%' }}
          >
            <div className="px-4 py-2.5 border-b border-color flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                {activeCatObj.label}
              </span>
              <button
                onClick={() => onSelectCategory(null)}
                className="p-1 hover:bg-hover rounded text-gray-400 hover:text-primary transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-4">
              {activeCatObj.sections.map((sec, idx) => (
                <div key={idx} className="flex flex-col gap-1">
                  <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider text-muted/60 font-bold select-none text-left">
                    {sec.header}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {sec.tools.map(tool => {
                      const isToolActive = activeTool === tool.id;
                      return (
                        <button
                          key={tool.id}
                          onClick={e => {
                            e.stopPropagation();
                            onSelectTool(tool.id);
                            onSelectCategory(null);
                          }}
                          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors group ${
                            isToolActive
                              ? 'bg-brand/15 text-brand font-medium border border-brand/20'
                              : 'text-gray-400 hover:bg-hover hover:text-primary'
                          }`}
                        >
                          <span
                            className={`shrink-0 ${
                              isToolActive ? 'text-brand' : 'text-gray-400 group-hover:text-primary'
                            }`}
                          >
                            {tool.icon}
                          </span>
                          <span className="truncate">{tool.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// DrawingStyleBar — color + width picker shown above chart while placing/selected
// ============================================================================
export interface DrawingStyleBarProps {
  active: boolean;
  hasSelected: boolean;
  color: string;
  onColorChange: (c: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
  onDeleteSelected: () => void;
}

export const DrawingStyleBar = memo(function DrawingStyleBar({
  active,
  hasSelected,
  color,
  onColorChange,
  width,
  onWidthChange,
  onDeleteSelected,
}: DrawingStyleBarProps) {
  if (!active && !hasSelected) return null;
  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-secondary px-3 py-1.5 rounded-lg border border-color shadow-lg select-none pointer-events-auto">
      <span className="text-[10px] uppercase font-bold text-muted tracking-wider">
        {hasSelected ? 'Selected:' : 'Style:'}
      </span>
      <div className="flex items-center gap-1.5 border-r border-color pr-3">
        {DRAWING_COLORS.map(c => (
          <button
            key={c.hex}
            onClick={() => onColorChange(c.hex)}
            className={`w-4 h-4 rounded-full border transition-all ${
              color === c.hex ? 'scale-125 border-white' : 'border-transparent'
            }`}
            style={{ backgroundColor: c.hex }}
            title={c.label}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        {DRAWING_WIDTHS.map(w => (
          <button
            key={w}
            onClick={() => onWidthChange(w)}
            className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
              width === w ? 'bg-brand text-white' : 'text-muted hover:bg-hover hover:text-primary'
            }`}
          >
            {w}px
          </button>
        ))}
      </div>
      {hasSelected && (
        <>
          <div className="w-px h-4 bg-color mx-1" />
          <button
            onClick={onDeleteSelected}
            className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors flex items-center justify-center"
            title="Delete Selected Drawing (Del / Backspace)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
});

// ============================================================================
// ScaleModeToggle — log/linear price scale toggle
// ============================================================================
export interface ScaleModeToggleProps {
  isLog: boolean;
  onToggle: () => void;
}

export const ScaleModeToggle = memo(function ScaleModeToggle({
  isLog,
  onToggle,
}: ScaleModeToggleProps) {
  return (
    <div className="absolute bottom-6 right-[68px] z-20 flex items-center gap-1 bg-secondary border border-color rounded p-0.5 shadow-md pointer-events-auto select-none">
      <button
        onClick={onToggle}
        className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded transition-colors ${
          isLog ? 'bg-brand text-white' : 'text-muted hover:text-primary'
        }`}
        title="Toggle Logarithmic Price Scale"
      >
        Log
      </button>
    </div>
  );
});
