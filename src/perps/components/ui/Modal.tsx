import { X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'w-[420px]',
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div ref={overlayRef} className="absolute inset-0" onClick={onClose} />
      <div
        className={`relative bg-secondary border border-color rounded-2xl shadow-2xl overflow-hidden flex flex-col ${width} max-h-[90vh] animate-in fade-in zoom-in-95 duration-200`}
      >
        {/* Beta Ribbon */}
        <div className="absolute top-0 left-0 overflow-hidden w-[90px] h-[90px] pointer-events-none z-10">
          <div className="absolute top-[18px] -left-[26px] w-[130px] -rotate-45 bg-gradient-to-r from-yellow-400 to-amber-500 text-[9px] font-black text-yellow-950 py-0.5 text-center shadow-md uppercase tracking-[0.2em]">
            BETA
          </div>
        </div>

        <div className="relative z-20 flex justify-between items-center px-5 py-4 border-b border-color">
          <h2 className="text-primary text-[15px] font-semibold pl-8">{title}</h2>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors p-1 rounded-md hover:bg-tertiary cursor-pointer"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="relative z-20 p-5 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
};
