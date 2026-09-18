import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation, useNavigate, useParams } from 'react-router';
import {
  k8sGet,
  k8sUpdate,
  useAccessReview,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerService } from '../../k8s/types';
import EditBrokerServicePage from './EditBrokerServicePage';

const TEST_NAMESPACE = 'test-namespace';
const SERVICE_NAME = 'my-broker';
const DETAILS_PATH = `/k8s/ns/${TEST_NAMESPACE}/broker.arkmq.org~v1beta2~BrokerService/${SERVICE_NAME}`;

const mockBrokerService: BrokerService = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: {
    name: SERVICE_NAME,
    namespace: TEST_NAMESPACE,
    resourceVersion: '12345',
    labels: { app: 'messaging', env: 'test' },
  },
  spec: { resources: { limits: { memory: '2Gi' } } },
};

const mockNavigate = jest.fn();

jest.mock('react-router', () => ({
  useParams: jest.fn(),
  useNavigate: jest.fn(),
  useLocation: jest.fn(),
}));

jest.mock('../../shared-components/YamlEditorWrapper', () => ({
  YamlEditorWrapper: () => <div data-test="yaml-editor-mock" />,
}));

const mockUseParams = useParams as jest.Mock;
const mockUseNavigate = useNavigate as jest.Mock;
const mockUseLocation = useLocation as jest.Mock;
const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockUseAccessReview = useAccessReview as jest.Mock;
const mockK8sGet = k8sGet as jest.Mock;
const mockK8sUpdate = k8sUpdate as jest.Mock;

const renderEditPage = () => render(<EditBrokerServicePage />);

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ ns: TEST_NAMESPACE, name: SERVICE_NAME });
  mockUseNavigate.mockReturnValue(mockNavigate);
  mockUseLocation.mockReturnValue({ search: '' });
  mockUseAccessReview.mockReturnValue([true, false]);
  mockUseK8sWatchResource.mockReturnValue([mockBrokerService, true, undefined]);
  mockK8sGet.mockResolvedValue(mockBrokerService);
  mockK8sUpdate.mockResolvedValue(mockBrokerService);
});

describe('EditBrokerServicePage', () => {
  it('renders the edit page title and description', () => {
    renderEditPage();

    expect(screen.getByTestId('edit-brokerservice-title')).toHaveTextContent('Edit BrokerService');
    expect(
      screen.getByText(
        'Modify the configuration of an existing BrokerService. Changes will be applied to the running broker cluster after saving.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a loading spinner while the resource is loading', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, false, undefined]);

    renderEditPage();

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('shows access denied when the user cannot update BrokerServices', () => {
    mockUseAccessReview.mockReturnValue([false, false]);

    renderEditPage();

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(
      screen.getByText('You do not have permission to update BrokerServices in this namespace.'),
    ).toBeInTheDocument();
  });

  it('shows not found when the BrokerService cannot be loaded', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, true, new Error('not found')]);

    renderEditPage();

    expect(screen.getByText('BrokerService not found')).toBeInTheDocument();
  });

  it('renders name as read-only and namespace as disabled', () => {
    renderEditPage();

    const nameInput = screen.getByTestId('broker-service-name-input');
    expect(nameInput).toHaveValue(SERVICE_NAME);
    expect(nameInput).toBeDisabled();

    const namespaceInput = screen.getByTestId('broker-service-namespace-input');
    expect(namespaceInput).toHaveValue(TEST_NAMESPACE);
    expect(namespaceInput).toBeDisabled();
  });

  it('renders save, reload, and cancel action buttons', () => {
    renderEditPage();

    expect(screen.getByTestId('save-broker-service-button')).toBeInTheDocument();
    expect(screen.getByTestId('reload-broker-service-button')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-broker-service-button')).toBeInTheDocument();
  });

  it('reloads from the cluster without a confirmation modal when there are no changes', async () => {
    const user = userEvent.setup();
    renderEditPage();

    await user.click(screen.getByTestId('reload-broker-service-button'));

    await waitFor(() => {
      expect(mockK8sGet).toHaveBeenCalledWith(
        expect.objectContaining({ name: SERVICE_NAME, ns: TEST_NAMESPACE }),
      );
    });
    expect(screen.queryByTestId('confirm-reload-btn')).not.toBeInTheDocument();
  });

  it('prompts before reload and restores cluster values after confirmation', async () => {
    const user = userEvent.setup();
    const clusterBroker: BrokerService = {
      ...mockBrokerService,
      spec: { resources: { limits: { memory: '2Gi' } } },
    };
    mockK8sGet.mockResolvedValue(clusterBroker);

    renderEditPage();

    const memoryInput = screen.getByTestId('memory-value-input');
    await user.clear(memoryInput);
    await user.type(memoryInput, '8');
    expect(memoryInput).toHaveValue('8');

    await user.click(screen.getByTestId('reload-broker-service-button'));
    expect(screen.getByTestId('confirm-reload-btn')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-reload-btn'));

    await waitFor(() => {
      expect(mockK8sGet).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('memory-value-input')).toHaveValue('2');
    });
  });

  it('restores deleted labels after reload confirm', async () => {
    const user = userEvent.setup();
    mockK8sGet.mockResolvedValue(mockBrokerService);

    renderEditPage();

    expect(screen.getAllByLabelText('Label key')).toHaveLength(2);

    const removeButtons = screen.getAllByLabelText('Remove label');
    await user.click(removeButtons[1]);
    expect(screen.getAllByLabelText('Label key')).toHaveLength(1);

    await user.click(screen.getByTestId('reload-broker-service-button'));
    expect(screen.getByTestId('confirm-reload-btn')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-reload-btn'));

    await waitFor(() => {
      expect(mockK8sGet).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getAllByLabelText('Label key')).toHaveLength(2);
    });
  });

  it('navigates back without a confirmation modal when cancel is clicked with no changes', async () => {
    const user = userEvent.setup();
    renderEditPage();

    await user.click(screen.getByTestId('cancel-broker-service-button'));

    expect(screen.queryByTestId('confirm-cancel-btn')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith(DETAILS_PATH, { replace: true });
  });

  it('prompts before cancel and navigates away after confirmation', async () => {
    const user = userEvent.setup();
    renderEditPage();

    const memoryInput = screen.getByTestId('memory-value-input');
    await user.clear(memoryInput);
    await user.type(memoryInput, '4');

    await user.click(screen.getByTestId('cancel-broker-service-button'));
    expect(screen.getByTestId('confirm-cancel-btn')).toBeInTheDocument();

    await user.click(screen.getByTestId('confirm-cancel-btn'));

    expect(mockNavigate).toHaveBeenCalledWith(DETAILS_PATH, { replace: true });
  });

  it('uses returnUrl from the query string for cancel and save navigation', async () => {
    const user = userEvent.setup();
    const returnPath = '/k8s/ns/test-namespace/broker.arkmq.org~v1beta2~BrokerService';
    mockUseLocation.mockReturnValue({
      search: `?returnUrl=${encodeURIComponent(returnPath)}`,
    });

    renderEditPage();

    await user.click(screen.getByTestId('cancel-broker-service-button'));
    expect(mockNavigate).toHaveBeenCalledWith(returnPath, { replace: true });

    mockNavigate.mockClear();
    let mockK8sUpdateArgs: { ns: string; name: string; data: BrokerService } | undefined;
    mockK8sUpdate.mockImplementationOnce(
      (args: { ns: string; name: string; data: BrokerService }) => {
        mockK8sUpdateArgs = args;
        return Promise.resolve(mockBrokerService);
      },
    );

    await user.click(screen.getByTestId('save-broker-service-button'));

    await waitFor(() => {
      expect(mockK8sUpdateArgs?.ns).toBe(TEST_NAMESPACE);
      expect(mockK8sUpdateArgs?.name).toBe(SERVICE_NAME);
      expect(mockK8sUpdateArgs?.data.metadata?.resourceVersion).toBe('12345');
    });
    expect(mockNavigate).toHaveBeenCalledWith(returnPath);
  });

  it('submits the resourceVersion from the reloaded CR, not the initial prop', async () => {
    const user = userEvent.setup();
    const reloadedBroker: BrokerService = {
      ...mockBrokerService,
      metadata: { ...mockBrokerService.metadata, resourceVersion: '99999' },
    };
    mockK8sGet.mockResolvedValue(reloadedBroker);

    renderEditPage();

    // Trigger a reload (no unsaved changes, so no confirm modal)
    await user.click(screen.getByTestId('reload-broker-service-button'));
    await waitFor(() => {
      expect(mockK8sGet).toHaveBeenCalled();
    });

    let mockK8sUpdateArgs: { data: BrokerService } | undefined;
    mockK8sUpdate.mockImplementationOnce((args: { data: BrokerService }) => {
      mockK8sUpdateArgs = args;
      return Promise.resolve(reloadedBroker);
    });

    await user.click(screen.getByTestId('save-broker-service-button'));

    await waitFor(() => {
      expect(mockK8sUpdateArgs?.data.metadata?.resourceVersion).toBe('99999');
    });
  });

  it('shows a reload error alert when k8sGet fails', async () => {
    const user = userEvent.setup();
    mockK8sGet.mockRejectedValueOnce(new Error('cluster fetch failed'));

    renderEditPage();

    await user.click(screen.getByTestId('reload-broker-service-button'));

    await waitFor(() => {
      expect(screen.getByTestId('reload-error-alert')).toHaveTextContent('cluster fetch failed');
    });
  });
});
