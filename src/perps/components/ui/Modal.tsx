import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, width = 'w-[360px]' }) => {
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
      <div 
        ref={overlayRef}
        className="absolute inset-0" 
        onClick={onClose}
      />
      <div className={`relative bg-[#1A1A1A] border border-[#2B2B2B] rounded-2xl shadow-2xl overflow-hidden flex flex-col ${width} max-h-[90vh] animate-in fade-in zoom-in-95 duration-200`}>
        <div className="flex justify-between items-center px-5 py-4 border-b border-[#2B2B2B]">
          <h2 className="text-white text-[15px] font-semibold">{title}</h2>
          <button 
            onClick={onClose}
            className="text-[#888] hover:text-white transition-colors p-1"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
