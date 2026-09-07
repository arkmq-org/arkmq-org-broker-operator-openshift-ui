import * as React from 'react';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../../reducers/brokerapp/reducer';
import { ResourcesSection } from './ResourcesSection';

const Wrapper: React.FC = () => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <ResourcesSection />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

describe('ResourcesSection', () => {
  it('renders all four input fields', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('brokerapp-cpu-request')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-cpu-limit')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-memory-request')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-memory-limit')).toBeInTheDocument();
  });

  it('all four fields start empty', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('brokerapp-cpu-request')).toHaveValue('');
    expect(screen.getByTestId('brokerapp-cpu-limit')).toHaveValue('');
    expect(screen.getByTestId('brokerapp-memory-request')).toHaveValue('');
    expect(screen.getByTestId('brokerapp-memory-limit')).toHaveValue('');
  });

  it('shows a validation error for an invalid CPU request value', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-cpu-request'), {
      target: { value: 'bad!' },
    });
    expect(
      screen.getByText('Invalid CPU quantity. Use standard format (e.g., 250m, 1, 0.5)'),
    ).toBeInTheDocument();
  });

  it('shows a validation error when a memory suffix is used in a CPU field (2Gi)', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-cpu-request'), {
      target: { value: '2Gi' },
    });
    expect(
      screen.getByText('Invalid CPU quantity. Use standard format (e.g., 250m, 1, 0.5)'),
    ).toBeInTheDocument();
  });

  it('accepts a valid CPU request value without showing an error', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-cpu-request'), {
      target: { value: '250m' },
    });
    expect(
      screen.queryByText('Invalid CPU quantity. Use standard format (e.g., 250m, 1, 0.5)'),
    ).not.toBeInTheDocument();
  });

  it('shows a validation error for an invalid memory limit value', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-memory-limit'), {
      target: { value: '512xyz' },
    });
    expect(
      screen.getByText('Invalid memory quantity. Use standard format (e.g., 256Mi, 2Gi, 512M)'),
    ).toBeInTheDocument();
  });

  it('shows a validation error when CPU milli suffix is used in a memory field (500m)', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-memory-limit'), {
      target: { value: '500m' },
    });
    expect(
      screen.getByText('Invalid memory quantity. Use standard format (e.g., 256Mi, 2Gi, 512M)'),
    ).toBeInTheDocument();
  });

  it('accepts a valid memory limit value without showing an error', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-memory-limit'), {
      target: { value: '512Mi' },
    });
    expect(
      screen.queryByText('Invalid memory quantity. Use standard format (e.g., 256Mi, 2Gi, 512M)'),
    ).not.toBeInTheDocument();
  });
});
