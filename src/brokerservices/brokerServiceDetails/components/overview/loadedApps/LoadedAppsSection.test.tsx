import { render, screen } from '@testing-library/react';
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR, BrokerService } from '../../../../../k8s/types';
import { K8sResourceConditionStatus } from '../../../../../k8s/types';
import { LoadedAppsSection } from './LoadedAppsSection';
import { boundAppNamespaces } from './useBoundBrokerApps';

const mockUseK8sWatchResources = useK8sWatchResources as jest.Mock;

const serviceServing = (...refs: { name: string; namespace: string }[]): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-messaging-service', namespace: 'default' },
  status: { provisionedApps: refs.map((ref) => `${ref.namespace}/${ref.name}`) },
});

const makeApp = (name: string, namespace = 'default'): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace },
  spec: {},
  status: {
    service: { name: 'my-messaging-service', namespace: 'default', assignedPort: 0 },
    conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }],
  },
});

const watched = (app: BrokerAppCR, loaded = true, loadError?: unknown) => ({
  [`${app.metadata?.namespace ?? ''}/${app.metadata?.name ?? ''}`]: {
    data: app,
    loaded,
    loadError,
  },
});

describe('boundAppNamespaces', () => {
  it('lists each namespace the service has apps in, once', () => {
    expect(
      boundAppNamespaces(
        serviceServing(
          { name: 'b', namespace: 'tenant-b' },
          { name: 'a', namespace: 'tenant-a' },
          { name: 'a2', namespace: 'tenant-a' },
        ),
      ),
    ).toEqual(['tenant-a', 'tenant-b']);
  });

  it('is empty before the service reports any app', () => {
    expect(boundAppNamespaces(serviceServing())).toEqual([]);
  });
});

describe('LoadedAppsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseK8sWatchResources.mockReturnValue({});
  });

  it('shows a spinner while BrokerApps are loading', () => {
    mockUseK8sWatchResources.mockReturnValue(watched(makeApp('my-messaging-app'), false));
    render(
      <LoadedAppsSection
        brokerService={serviceServing({ name: 'my-messaging-app', namespace: 'default' })}
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Loading BrokerApps' })).toBeInTheDocument();
  });

  it('shows an empty state when no apps are bound', () => {
    render(<LoadedAppsSection brokerService={serviceServing()} />);
    expect(screen.getByText('No loaded apps')).toBeInTheDocument();
  });

  it('shows an error row when a watch fails', () => {
    mockUseK8sWatchResources.mockReturnValue(
      watched(makeApp('my-messaging-app'), true, new Error('forbidden')),
    );
    render(
      <LoadedAppsSection
        brokerService={serviceServing({ name: 'my-messaging-app', namespace: 'default' })}
      />,
    );
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });

  it('renders bound apps with status and consumer-count placeholder', () => {
    mockUseK8sWatchResources.mockReturnValue(watched(makeApp('my-messaging-app')));

    render(
      <LoadedAppsSection
        brokerService={serviceServing({ name: 'my-messaging-app', namespace: 'default' })}
      />,
    );

    expect(screen.getByTestId('loaded-app-link-default-my-messaging-app')).toHaveTextContent(
      'my-messaging-app',
    );
    expect(screen.getByTestId('loaded-app-status-default-my-messaging-app')).toHaveTextContent(
      'Provisioned',
    );
    expect(
      screen.getByTestId('loaded-app-consumer-count-default-my-messaging-app'),
    ).toHaveTextContent('-');
  });

  it('shows a spinner rather than failing while a named app has not loaded', () => {
    mockUseK8sWatchResources.mockReturnValue({
      'tenant-a/tenant-app': { data: null, loaded: false, loadError: undefined },
    });
    render(
      <LoadedAppsSection
        brokerService={serviceServing({ name: 'tenant-app', namespace: 'tenant-a' })}
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Loading BrokerApps' })).toBeInTheDocument();
  });

  it('watches each app the service names in its own namespace', () => {
    mockUseK8sWatchResources.mockReturnValue(watched(makeApp('tenant-app', 'tenant-a')));

    render(
      <LoadedAppsSection
        brokerService={serviceServing({ name: 'tenant-app', namespace: 'tenant-a' })}
      />,
    );

    expect(screen.getByTestId('loaded-app-link-tenant-a-tenant-app')).toHaveTextContent(
      'tenant-app',
    );
    const [resources] = mockUseK8sWatchResources.mock.calls[
      mockUseK8sWatchResources.mock.calls.length - 1
    ] as [Record<string, { name: string; namespace: string }>];
    expect(Object.values(resources)).toEqual([
      expect.objectContaining({ name: 'tenant-app', namespace: 'tenant-a' }),
    ]);
  });
});
