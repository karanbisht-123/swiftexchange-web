import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SidePanelProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    width?: 'sm' | 'md' | 'lg';
}

const widthClasses = {
    sm: 'w-80',
    md: 'w-96',
    lg: 'w-[28rem]',
};

export const SidePanel: React.FC<SidePanelProps> = ({
    isOpen,
    onClose,
    title,
    children,
    width = 'md',
}) => {
    const panelRef = useRef<HTMLDivElement>(null);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        },
        [isOpen, onClose]
    );

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (typeof window === 'undefined') return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                }`}
        >
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div
                ref={panelRef}
                className={`absolute top-0 right-0 h-full ${widthClasses[width]} max-w-[90vw] bg-primary border-l border-color shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-color bg-secondary">
                    {title && (
                        <h2 className="text-sm font-semibold text-primary">{title}</h2>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-hover text-muted hover:text-primary transition-colors ml-auto"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-auto p-4">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SidePanel;
