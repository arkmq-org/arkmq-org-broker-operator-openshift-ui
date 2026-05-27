import { render, screen, fireEvent } from '@testing-library/react';
import { AddressListInput } from './AddressListInput';

describe('AddressListInput', () => {
  const defaultProps = {
    addresses: [],
    onAdd: jest.fn(),
    onRemove: jest.fn(),
    placeholder: 'e.g., QUEUE.TEST',
    inputId: 'test-input',
    categoryName: 'Test Category',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a text input and confirms address on Enter after clicking the add control', () => {
    const onAdd = jest.fn();
    render(<AddressListInput {...defaultProps} onAdd={onAdd} />);

    // Click the 'Add address' control to reveal the text input
    fireEvent.click(screen.getByText('Add address'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'QUEUE.A' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onAdd).toHaveBeenCalledWith('QUEUE.A');
  });

  it('calls onRemove with the correct address when the chip close button is clicked', () => {
    const onRemove = jest.fn();
    render(
      <AddressListInput
        {...defaultProps}
        onRemove={onRemove}
        addresses={['QUEUE.KEEP', 'QUEUE.REMOVE']}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove QUEUE.REMOVE' }));
    expect(onRemove).toHaveBeenCalledWith('QUEUE.REMOVE');
    expect(onRemove).not.toHaveBeenCalledWith('QUEUE.KEEP');
  });

  it('renders all provided addresses as chips', () => {
    render(<AddressListInput {...defaultProps} addresses={['QUEUE.PAYMENTS', 'TOPIC.EVENTS']} />);

    expect(screen.getByText('QUEUE.PAYMENTS')).toBeInTheDocument();
    expect(screen.getByText('TOPIC.EVENTS')).toBeInTheDocument();
  });

  it('confirms address on blur after typing', () => {
    const onAdd = jest.fn();
    render(<AddressListInput {...defaultProps} onAdd={onAdd} />);

    fireEvent.click(screen.getByText('Add address'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'QUEUE.BLUR' } });
    fireEvent.blur(input);

    expect(onAdd).toHaveBeenCalledWith('QUEUE.BLUR');
  });

  it('cancels adding without calling onAdd when Escape is pressed', () => {
    const onAdd = jest.fn();
    render(<AddressListInput {...defaultProps} onAdd={onAdd} />);

    fireEvent.click(screen.getByText('Add address'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'QUEUE.CANCELLED' } });
    fireEvent.keyDown(input, { key: 'Escape', code: 'Escape' });

    expect(onAdd).not.toHaveBeenCalled();
    // Input is gone; the 'Add address' control is shown again
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Add address')).toBeInTheDocument();
  });

  it('does not call onAdd when Enter is pressed with blank input', () => {
    const onAdd = jest.fn();
    render(<AddressListInput {...defaultProps} onAdd={onAdd} />);

    fireEvent.click(screen.getByText('Add address'));
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onAdd).not.toHaveBeenCalled();
  });
});
