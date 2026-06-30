import { render, screen } from '@testing-library/react';
import {
  useK8sWatchResource,
  useActiveNamespace,
  isAllNamespacesKey,
} from '@openshift-console/dynamic-plugin-sdk';
import { ALL_NAMESPACES_KEY } from '../../../__mocks__/dynamic-plugin-sdk';
import { K8sResourceConditionStatus, type BrokerAppCR } from '../../k8s/types';
import { BrokerAppModel } from '../../k8s/models';
import BrokerAppListPage from './BrokerAppListPage';

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockUseActiveNamespace = useActiveNamespace as jest.Mock;
const mockIsAllNamespacesKey = isAllNamespacesKey as unknown as jest.Mock;

const makeApp = (name: string, namespace = 'my-namespace'): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace, creationTimestamp: '2026-07-07T00:00:00Z' },
  spec: { selector: { matchLabels: { tier: 'production' } } },
  status: { conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }] },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseActiveNamespace.mockReturnValue(['my-namespace', jest.fn()]);
  mockIsAllNamespacesKey.mockImplementation((ns: string) => ns === ALL_NAMESPACES_KEY);
  mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);
});

describe('BrokerAppListPage', () => {
  it('renders the page header with the BrokerApps title', () => {
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    expect(screen.getAllByText('BrokerApps').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: 'Create BrokerApp' })).toBeInTheDocument();
  });

  it('renders the Create BrokerApp link pointing to the correct namespace path', () => {
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    const createLink = screen.getByRole('link', { name: 'Create BrokerApp' });
    expect(createLink).toHaveAttribute('href', '/k8s/ns/my-namespace/brokerapps/~new');
  });

  it('falls back to the active namespace when the page namespace is all-namespaces', () => {
    mockUseActiveNamespace.mockReturnValue(['test-namespace', jest.fn()]);
    render(<BrokerAppListPage namespace={ALL_NAMESPACES_KEY} model={BrokerAppModel} />);
    expect(screen.getByRole('link', { name: 'Create BrokerApp' })).toHaveAttribute(
      'href',
      '/k8s/ns/test-namespace/brokerapps/~new',
    );
  });

  it('falls back to "default" when both namespace and activeNamespace are all-namespaces', () => {
    mockUseActiveNamespace.mockReturnValue([ALL_NAMESPACES_KEY, jest.fn()]);
    render(<BrokerAppListPage namespace={ALL_NAMESPACES_KEY} model={BrokerAppModel} />);
    expect(screen.getByRole('link', { name: 'Create BrokerApp' })).toHaveAttribute(
      'href',
      '/k8s/ns/default/brokerapps/~new',
    );
  });

  it('shows a loading spinner while the watch is pending', () => {
    mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows an empty state when loaded with no apps', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    expect(screen.getByText('No BrokerApps found')).toBeInTheDocument();
  });

  it('renders app rows when data is loaded', () => {
    const apps = [makeApp('order-processor'), makeApp('notification-service')];
    mockUseK8sWatchResource.mockReturnValue([apps, true, undefined]);
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    expect(screen.getByText('order-processor')).toBeInTheDocument();
    expect(screen.getByText('notification-service')).toBeInTheDocument();
  });

  it('calls useK8sWatchResource with the correct GVK and namespace', () => {
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    expect(mockUseK8sWatchResource).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'my-namespace',
        groupVersionKind: {
          group: 'broker.arkmq.org',
          version: 'v1beta2',
          kind: 'BrokerApp',
        },
        isList: true,
      }),
    );
  });

  it('shows an error state when the watch returns a load error', () => {
    mockUseK8sWatchResource.mockReturnValue([[], false, new Error('Watch failed')]);
    render(<BrokerAppListPage namespace="my-namespace" model={BrokerAppModel} />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });
});
