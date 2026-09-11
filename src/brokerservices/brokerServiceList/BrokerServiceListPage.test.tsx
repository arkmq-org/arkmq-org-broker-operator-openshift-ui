import { render, screen } from '@testing-library/react';
import {
  useK8sWatchResource,
  useActiveNamespace,
  isAllNamespacesKey,
} from '@openshift-console/dynamic-plugin-sdk';
import { ALL_NAMESPACES_KEY } from '../../../__mocks__/dynamic-plugin-sdk';
import type { BrokerService } from '../../k8s/types';
import { K8sResourceConditionStatus } from '../../k8s/types';
import BrokerServiceListPage from './BrokerServiceListPage';
import { BrokerServiceModel } from '../../k8s/models';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => jest.fn()),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockUseActiveNamespace = useActiveNamespace as jest.Mock;
const mockIsAllNamespacesKey = isAllNamespacesKey as unknown as jest.Mock;

const myMessagingService1 = 'my-messaging-service-1';
const myMessagingService2 = 'my-messaging-service-2';

const makeService = (name: string, namespace = 'my-namespace'): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name, namespace, creationTimestamp: '2026-07-07T00:00:00Z' },
  status: { conditions: [{ type: 'Ready', status: K8sResourceConditionStatus.True }] },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseActiveNamespace.mockReturnValue(['my-namespace', jest.fn()]);
  mockIsAllNamespacesKey.mockImplementation((ns: string) => ns === ALL_NAMESPACES_KEY);
  mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);
});

describe('BrokerServiceListPage', () => {
  it('renders the page header with the BrokerServices title', () => {
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    expect(screen.getAllByText('BrokerServices').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: 'Create BrokerService' })).toBeInTheDocument();
  });

  it('renders the Create BrokerService link pointing to the correct namespace path', () => {
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    const createLink = screen.getByRole('link', { name: 'Create BrokerService' });
    expect(createLink).toBeInTheDocument();
    expect(createLink).toHaveAttribute('href', '/k8s/ns/my-namespace/brokerservices/~new');
  });

  it('falls back to the active namespace when the page namespace is all-namespaces', () => {
    mockUseActiveNamespace.mockReturnValue(['test-namespace', jest.fn()]);
    render(<BrokerServiceListPage namespace={ALL_NAMESPACES_KEY} model={BrokerServiceModel} />);
    expect(screen.getByRole('link', { name: 'Create BrokerService' })).toHaveAttribute(
      'href',
      '/k8s/ns/test-namespace/brokerservices/~new',
    );
  });

  it('falls back to "default" when both namespace and activeNamespace are all-namespaces', () => {
    mockUseActiveNamespace.mockReturnValue([ALL_NAMESPACES_KEY, jest.fn()]);
    render(<BrokerServiceListPage namespace={ALL_NAMESPACES_KEY} model={BrokerServiceModel} />);
    expect(screen.getByRole('link', { name: 'Create BrokerService' })).toHaveAttribute(
      'href',
      '/k8s/ns/default/brokerservices/~new',
    );
  });

  it('shows a loading spinner while the watch is pending', () => {
    mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an empty state when loaded with no services', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    expect(screen.getByText('No BrokerServices found')).toBeInTheDocument();
  });

  it('renders service rows when data is loaded', () => {
    const services = [makeService(myMessagingService1), makeService(myMessagingService2)];
    mockUseK8sWatchResource.mockReturnValue([services, true, undefined]);
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    expect(screen.getByText(myMessagingService1)).toBeInTheDocument();
    expect(screen.getByText(myMessagingService2)).toBeInTheDocument();
  });

  it('calls useK8sWatchResource with the correct GVK and namespace', () => {
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    expect(mockUseK8sWatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'my-namespace',
        groupVersionKind: {
          group: 'broker.arkmq.org',
          version: 'v1beta2',
          kind: 'BrokerService',
        },
        isList: true,
      }),
    );
  });

  it('shows an error state when the watch returns a load error', () => {
    mockUseK8sWatchResource.mockReturnValue([[], false, new Error('Watch failed')]);
    render(<BrokerServiceListPage namespace="my-namespace" model={BrokerServiceModel} />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });
});
