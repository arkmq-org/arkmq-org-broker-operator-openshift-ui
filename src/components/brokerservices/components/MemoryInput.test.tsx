import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryInput, type MemoryInputProps } from './MemoryInput';

const defaultProps: MemoryInputProps = {
  value: '2',
  unit: 'Gi',
  onValueChange: jest.fn(),
  onUnitChange: jest.fn(),
};

const renderMemoryInput = (overrides: Partial<MemoryInputProps> = {}) =>
  render(<MemoryInput {...defaultProps} {...overrides} />);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MemoryInput', () => {
  it('renders the memory value input with the given value', () => {
    renderMemoryInput();

    expect(screen.getByTestId('memory-value-input')).toHaveValue('2');
  });

  it('renders the selected unit in the dropdown toggle', () => {
    renderMemoryInput({ unit: 'Mi' });

    expect(screen.getByText('Mi')).toBeInTheDocument();
  });

  it('renders the default helper text when no error is provided', () => {
    renderMemoryInput();

    expect(screen.getByText('Memory allocation per broker pod.')).toBeInTheDocument();
  });

  it('renders the error message instead of helper text when error is provided', () => {
    renderMemoryInput({ error: 'Memory must be a positive number' });

    expect(screen.getByText('Memory must be a positive number')).toBeInTheDocument();
    expect(screen.queryByText('Memory allocation per broker pod.')).not.toBeInTheDocument();
  });

  it('calls onValueChange when the user types in the input', async () => {
    const onValueChange = jest.fn();
    const user = userEvent.setup();
    renderMemoryInput({ value: '', onValueChange });

    await user.type(screen.getByTestId('memory-value-input'), '4');

    expect(onValueChange).toHaveBeenCalledWith('4');
  });

  it('opens the dropdown when the toggle is clicked', async () => {
    const user = userEvent.setup();
    renderMemoryInput();

    await user.click(screen.getByText('Gi'));

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('calls onUnitChange when a dropdown option is selected', async () => {
    const onUnitChange = jest.fn();
    const user = userEvent.setup();
    renderMemoryInput({ onUnitChange });

    await user.click(screen.getByText('Gi'));
    await user.click(screen.getByRole('menuitem', { name: 'Mi' }));

    expect(onUnitChange).toHaveBeenCalledWith('Mi');
  });
});
