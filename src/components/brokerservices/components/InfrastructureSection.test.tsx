import { render, screen, fireEvent } from '@testing-library/react';
import { InfrastructureSection } from './InfrastructureSection';

const mockDispatch = jest.fn();
const mockUseBrokerServiceFormState = jest.fn(() => ({
  memoryValue: '2',
  memoryUnit: 'Gi' as const,
}));

jest.mock('../../../reducers/brokerservice/reducer', () => ({
  useBrokerServiceFormState: () => mockUseBrokerServiceFormState(),
  useBrokerServiceFormDispatch: jest.fn(() => mockDispatch),
}));

jest.mock('./MemoryInput', () => ({
  MemoryInput: jest.fn(
    (props: {
      value: string;
      unit: string;
      onValueChange: (val: string) => void;
      onUnitChange: (unit: 'Mi' | 'Gi') => void;
      error?: string;
    }) => (
      <div data-test="mock-memory-input">
        <span data-test="memory-value">{props.value}</span>
        <span data-test="memory-unit">{props.unit}</span>
        {props.error && <span data-test="memory-error">{props.error}</span>}
        <button
          data-test="trigger-value-change"
          onClick={() => {
            props.onValueChange('4');
          }}
        />
        <button
          data-test="trigger-unit-change"
          onClick={() => {
            props.onUnitChange('Mi');
          }}
        />
      </div>
    ),
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseBrokerServiceFormState.mockReturnValue({
    memoryValue: '2',
    memoryUnit: 'Gi',
  });
});

describe('InfrastructureSection', () => {
  it('renders the section title and memory form label', () => {
    render(<InfrastructureSection />);

    expect(screen.getByText('Infrastructure & Capacity')).toBeInTheDocument();
    expect(screen.getByText('Memory (RAM)')).toBeInTheDocument();
  });

  it('passes memoryValue and memoryUnit from state to MemoryInput', () => {
    render(<InfrastructureSection />);

    expect(screen.getByTestId('memory-value')).toHaveTextContent('2');
    expect(screen.getByTestId('memory-unit')).toHaveTextContent('Gi');
  });

  it('passes memory validation error to MemoryInput when value is invalid', () => {
    mockUseBrokerServiceFormState.mockReturnValue({
      memoryValue: '',
      memoryUnit: 'Gi',
    });

    render(<InfrastructureSection />);

    expect(screen.getByTestId('memory-error')).toHaveTextContent('Memory value is required');
  });

  it('dispatches SET_MEMORY_VALUE when onValueChange is called', () => {
    render(<InfrastructureSection />);

    fireEvent.click(screen.getByTestId('trigger-value-change'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_MEMORY_VALUE',
      payload: '4',
    });
  });

  it('dispatches SET_MEMORY_UNIT when onUnitChange is called', () => {
    render(<InfrastructureSection />);

    fireEvent.click(screen.getByTestId('trigger-unit-change'));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_MEMORY_UNIT',
      payload: 'Mi',
    });
  });
});
