import React, { useEffect } from 'react';

export interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  message: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  confirmButtonType?: 'primary' | 'danger' | 'success';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmButtonType = 'primary',
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onCancel]);

  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm sm:max-w-md bg-secondary rounded-xl shadow-lg border border-color animate-slide-up overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        onClick={handleModalClick}
      >
        <div className="p-6 space-y-3">
          {title && (
            <h3 id="modal-title" className="text-xl font-semibold text-primary">
              {title}
            </h3>
          )}
          <div className="text-secondary text-sm md:text-base leading-relaxed">
            {message}
          </div>
        </div>

        <div className="px-6 py-4 bg-tertiary border-t border-color flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onCancel}
            className="btn btn-ghost"
            type="button"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`btn btn-${confirmButtonType}`}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
