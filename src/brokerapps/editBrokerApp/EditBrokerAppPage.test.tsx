import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  k8sUpdate,
  useAccessReview,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR } from '../../k8s/types';
import EditBrokerAppPage from './EditBrokerAppPage';

const mockNavigate = jest.fn();
jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ ns: 'test-ns', name: 'my-app' })),
  useNavigate: jest.fn(() => mockNavigate),
  useLocation: jest.fn(() => ({ search: '' })),
}));

jest.mock('../../shared-components/ResourceFormEditor', () => ({
  ResourceFormEditor: ({
    children,
    createButtonTestId,
    cancelButtonTestId,
    reloadButtonTestId,
    onReload,
    onCancel,
    onFormSubmit,
    submitLabel,
  }: {
    children: React.ReactNode;
    createButtonTestId?: string;
    cancelButtonTestId?: string;
    reloadButtonTestId?: string;
    onReload?: () => void;
    onCancel: () => void;
    onFormSubmit: () => Promise<void>;
    submitLabel?: string;
    hasChanges?: boolean;
    resourceName?: string;
  }) => (
    <>
      {children}
      <button data-test={createButtonTestId} onClick={() => void onFormSubmit()}>
        {submitLabel}
      </button>
      {onReload && (
        <button data-test={reloadButtonTestId} onClick={onReload}>
          Reload
        </button>
      )}
      <button data-test={cancelButtonTestId} onClick={onCancel}>
        Cancel
      </button>
    </>
  ),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockUseAccessReview = useAccessReview as jest.Mock;
const mockK8sUpdate = k8sUpdate as jest.Mock;

const sampleBrokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: {
    name: 'my-app',
    namespace: 'test-ns',
    resourceVersion: '12345',
  },
  spec: {
    selector: { matchLabels: { tier: 'production' } },
    capabilities: [
      {
        producerOf: [{ address: 'orders.created' }],
        consumerOf: [{ address: 'payments.pending' }],
      },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAccessReview.mockReturnValue([true, false]);
  mockUseK8sWatchResource.mockReturnValue([sampleBrokerApp, true, undefined]);
  mockK8sUpdate.mockResolvedValue(sampleBrokerApp);
});

describe('EditBrokerAppPage', () => {
  it('renders the page title', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByTestId('edit-brokerapp-title')).toHaveTextContent('Edit BrokerApp');
  });

  it('renders a Save button instead of Create', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-save-btn')).toHaveTextContent('Save');
  });

  it('renders the Reload button', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-reload-btn')).toBeInTheDocument();
  });

  it('renders the Cancel button', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-cancel-btn')).toBeInTheDocument();
  });

  it('pre-populates the name field from the watched resource', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-name')).toHaveValue('my-app');
  });

  it('disables the name field in edit mode', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-name')).toBeDisabled();
  });

  it('shows read-only name helper text', () => {
    render(<EditBrokerAppPage />);
    expect(screen.getByText('Resource name cannot be changed after creation.')).toBeInTheDocument();
  });

  it('calls k8sUpdate on Save', async () => {
    const user = userEvent.setup();
    render(<EditBrokerAppPage />);

    await user.click(screen.getByTestId('brokerapp-save-btn'));

    await waitFor(() => {
      expect(mockK8sUpdate).toHaveBeenCalled();
    });
  });

  it('navigates to list page on Cancel when no changes', async () => {
    const user = userEvent.setup();
    render(<EditBrokerAppPage />);

    await user.click(screen.getByTestId('brokerapp-cancel-btn'));

    expect(mockNavigate).toHaveBeenCalledWith('/k8s/ns/test-ns/broker.arkmq.org~v1beta2~BrokerApp');
  });

  it('shows a spinner while loading', () => {
    mockUseK8sWatchResource.mockReturnValue([{}, false, undefined]);
    render(<EditBrokerAppPage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows access denied when user cannot update', () => {
    mockUseAccessReview.mockReturnValue([false, false]);
    render(<EditBrokerAppPage />);
    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to update BrokerApps in this namespace.'),
    ).toBeInTheDocument();
  });

  it('shows error state when resource fails to load', () => {
    mockUseK8sWatchResource.mockReturnValue([{}, true, new Error('Not found')]);
    render(<EditBrokerAppPage />);
    expect(screen.getByText('BrokerApp not found')).toBeInTheDocument();
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });
});
