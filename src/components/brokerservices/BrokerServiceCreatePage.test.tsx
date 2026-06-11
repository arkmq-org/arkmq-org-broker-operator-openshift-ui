import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { useParams } from 'react-router';
import BrokerServiceCreatePage from './BrokerServiceCreatePage';

const TEST_NAMESPACE = 'test-namespace';

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ ns: TEST_NAMESPACE })),
  useNavigate: jest.fn(() => jest.fn()),
}));

jest.mock('../../shared-components/ResourceFormEditor', () => ({
  ResourceFormEditor: ({
    children,
    createButtonTestId,
    cancelButtonTestId,
  }: {
    children: React.ReactNode;
    createButtonTestId?: string;
    cancelButtonTestId?: string;
  }) => (
    <>
      {children}
      <button data-test={createButtonTestId}>Create</button>
      <button data-test={cancelButtonTestId}>Cancel</button>
    </>
  ),
}));

const mockUseParams = useParams as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ ns: TEST_NAMESPACE });
});

describe('BrokerServiceCreatePage', () => {
  it('renders the page title and description', () => {
    render(<BrokerServiceCreatePage />);

    expect(screen.getByTestId('create-brokerservice-title')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Provision a shared messaging infrastructure broker cluster. This resource defines the underlying broker deployment that applications will connect to via BrokerApp resources.',
      ),
    ).toBeInTheDocument();
  });

  it('pre-populates the name field with the default value', () => {
    render(<BrokerServiceCreatePage />);

    expect(screen.getByTestId('broker-service-name-input')).toHaveValue('my-messaging-service');
  });

  it('renders form sections inside ResourceFormEditor', () => {
    render(<BrokerServiceCreatePage />);

    expect(screen.getByTestId('broker-service-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('memory-value-input')).toBeInTheDocument();
  });

  it('renders create and cancel buttons', () => {
    render(<BrokerServiceCreatePage />);

    expect(screen.getByTestId('create-broker-service-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-broker-service-button')).toBeInTheDocument();
  });
});
