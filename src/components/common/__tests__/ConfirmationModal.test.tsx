import { fireEvent, render, screen } from '@testing-library/react';

import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmationModal } from '../ConfirmationModal';

describe('ConfirmationModal', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal with title, message, and button texts', () => {
    render(<ConfirmationModal {...defaultProps} />);

    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders custom confirm and cancel button text', () => {
    render(
      <ConfirmationModal {...defaultProps} confirmText="Yes, delete" cancelText="No, keep it" />
    );

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, keep it' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirmMock = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirmMock} />);

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });
    await user.click(confirmButton);

    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancelMock = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancelMock} />);

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelButton);

    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when clicking on the background backdrop', async () => {
    const onCancelMock = vi.fn();
    const { container } = render(<ConfirmationModal {...defaultProps} onCancel={onCancelMock} />);

    // The first child is the backdrop container div
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);

    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when clicking inside the modal content box', async () => {
    const onCancelMock = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancelMock} />);

    // Click the dialog content itself
    const modalContent = screen.getByRole('dialog');
    fireEvent.click(modalContent);

    expect(onCancelMock).not.toHaveBeenCalled();
  });

  it('calls onCancel when pressing the Escape key', () => {
    const onCancelMock = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancelMock} />);

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });
});
