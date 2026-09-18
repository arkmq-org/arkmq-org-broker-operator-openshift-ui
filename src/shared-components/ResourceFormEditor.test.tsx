import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceFormEditor } from './ResourceFormEditor';

jest.mock('./YamlEditorWrapper', () => ({
  YamlEditorWrapper: () => <div data-test="yaml-editor-mock" />,
}));

const mockOnCancel = jest.fn();
const mockOnReload = jest.fn().mockResolvedValue(undefined);
const mockOnFormSubmit = jest.fn().mockResolvedValue(undefined);
const mockOnYamlSave = jest.fn().mockResolvedValue(undefined);
const mockOnSwitchToForm = jest.fn(() => ({ ok: true as const }));

const defaultProps = {
  initialResource: { apiVersion: 'v1', kind: 'Test' },
  onFormSubmit: mockOnFormSubmit,
  onYamlSave: mockOnYamlSave,
  onSwitchToForm: mockOnSwitchToForm,
  onCancel: mockOnCancel,
  cancelButtonTestId: 'cancel-btn',
  reloadButtonTestId: 'reload-btn',
  children: <div>form content</div>,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnFormSubmit.mockResolvedValue(undefined);
  mockOnYamlSave.mockResolvedValue(undefined);
  mockOnReload.mockResolvedValue(undefined);
  mockOnSwitchToForm.mockReturnValue({ ok: true as const });
});

describe('ResourceFormEditor', () => {
  describe('cancel confirmation', () => {
    it('calls onCancel directly when hasChanges is false', async () => {
      const user = userEvent.setup();
      render(<ResourceFormEditor {...defaultProps} hasChanges={false} />);

      await user.click(screen.getByTestId('cancel-btn'));

      expect(mockOnCancel).toHaveBeenCalled();
      expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    });

    it('shows confirmation modal when hasChanges is true', async () => {
      const user = userEvent.setup();
      render(<ResourceFormEditor {...defaultProps} hasChanges={true} />);

      await user.click(screen.getByTestId('cancel-btn'));

      expect(mockOnCancel).not.toHaveBeenCalled();
      expect(screen.getByText('Discard changes?')).toBeInTheDocument();
      expect(
        screen.getByText(
          'You are about to leave the editor. Changes that are not saved will be lost.',
        ),
      ).toBeInTheDocument();
    });

    it('calls onCancel when discard is confirmed', async () => {
      const user = userEvent.setup();
      render(<ResourceFormEditor {...defaultProps} hasChanges={true} />);

      await user.click(screen.getByTestId('cancel-btn'));
      await user.click(screen.getByTestId('confirm-cancel-btn'));

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('keeps editing when dismiss is clicked', async () => {
      const user = userEvent.setup();
      render(<ResourceFormEditor {...defaultProps} hasChanges={true} />);

      await user.click(screen.getByTestId('cancel-btn'));
      await user.click(screen.getByText('Keep editing'));

      expect(mockOnCancel).not.toHaveBeenCalled();
      expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    });
  });

  describe('reload confirmation', () => {
    it('does not show reload button when onReload is not provided', () => {
      render(<ResourceFormEditor {...defaultProps} />);
      expect(screen.queryByTestId('reload-btn')).not.toBeInTheDocument();
    });

    it('calls onReload directly when hasChanges is false', async () => {
      const user = userEvent.setup();
      render(<ResourceFormEditor {...defaultProps} onReload={mockOnReload} hasChanges={false} />);

      await user.click(screen.getByTestId('reload-btn'));

      await waitFor(() => {
        expect(mockOnReload).toHaveBeenCalled();
      });
    });

    it('shows confirmation modal when hasChanges is true', async () => {
      const user = userEvent.setup();
      render(
        <ResourceFormEditor
          {...defaultProps}
          onReload={mockOnReload}
          hasChanges={true}
          resourceName="BrokerApp"
        />,
      );

      await user.click(screen.getByTestId('reload-btn'));

      expect(mockOnReload).not.toHaveBeenCalled();
      expect(screen.getByText('Reload {{resourceName}}?')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Upon reloading, local modifications will be lost. The form will be reset to the current state of the resource on the cluster.',
        ),
      ).toBeInTheDocument();
    });

    it('shows generic title when resourceName is not provided', async () => {
      const user = userEvent.setup();
      render(<ResourceFormEditor {...defaultProps} onReload={mockOnReload} hasChanges={true} />);

      await user.click(screen.getByTestId('reload-btn'));

      expect(screen.getByText('Reload resource?')).toBeInTheDocument();
    });

    it('calls onReload when reload is confirmed', async () => {
      const user = userEvent.setup();
      render(
        <ResourceFormEditor
          {...defaultProps}
          onReload={mockOnReload}
          hasChanges={true}
          resourceName="BrokerApp"
        />,
      );

      await user.click(screen.getByTestId('reload-btn'));
      await user.click(screen.getByTestId('confirm-reload-btn'));

      await waitFor(() => {
        expect(mockOnReload).toHaveBeenCalled();
      });
    });

    it('dismisses modal without reloading when cancel is clicked', async () => {
      const user = userEvent.setup();
      render(
        <ResourceFormEditor
          {...defaultProps}
          onReload={mockOnReload}
          hasChanges={true}
          resourceName="BrokerApp"
        />,
      );

      await user.click(screen.getByTestId('reload-btn'));

      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByText('Cancel'));

      expect(mockOnReload).not.toHaveBeenCalled();
      expect(screen.queryByText('Reload {{resourceName}}?')).not.toBeInTheDocument();
    });
  });
});
