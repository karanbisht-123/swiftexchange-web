import React, { useEffect } from 'react';

interface MobileOrderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const MobileOrderSheet: React.FC<MobileOrderSheetProps> = ({ isOpen, onClose, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes slideUpSheet {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up-sheet {
          animation: slideUpSheet 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div 
        className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full bg-[#0b0e14] border-t border-color rounded-t-2xl flex flex-col shadow-2xl font-body h-[90vh] animate-slide-up-sheet relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Drag Handle & Close Button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-color shrink-0">
            <div className="flex-1" />
            <div className="w-12 h-1.5 bg-border-color rounded-full" />
            <div className="flex-1 flex justify-end">
              <button 
                onClick={onClose}
                className="text-muted hover:text-primary transition-colors p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-2">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};
