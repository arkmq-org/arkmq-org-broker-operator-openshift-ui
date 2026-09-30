import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR, BrokerService } from '../../../../../k8s/types';
import { K8sResourceConditionStatus } from '../../../../../k8s/types';
import { filterLoadedBrokerApps, LoadedAppsSection } from './LoadedAppsSection';

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

const brokerService: BrokerService = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-messaging-service', namespace: 'default' },
};

const makeApp = (name: string, service?: { name: string; namespace: string }): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace: 'default' },
  spec: {},
  status: {
    service: service ? { ...service, assignedPort: 0 } : undefined,
    conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }],
  },
});

describe('filterLoadedBrokerApps', () => {
  it('returns an empty list when service identity is incomplete', () => {
    expect(filterLoadedBrokerApps([makeApp('app-1')], '', 'default')).toEqual([]);
    expect(filterLoadedBrokerApps([makeApp('app-1')], 'my-messaging-service', '')).toEqual([]);
  });

  it('keeps only apps bound to the given service name and namespace', () => {
    const apps = [
      makeApp('bound', { name: 'my-messaging-service', namespace: 'default' }),
      makeApp('other-service', { name: 'other', namespace: 'default' }),
      makeApp('other-ns', { name: 'my-messaging-service', namespace: 'other' }),
      makeApp('unbound'),
    ];

    expect(
      filterLoadedBrokerApps(apps, 'my-messaging-service', 'default').map(
        (app) => app.metadata?.name,
      ),
    ).toEqual(['bound']);
  });
});

describe('LoadedAppsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a spinner while BrokerApps are loading', () => {
    mockUseK8sWatchResource.mockReturnValue([[], false, undefined]);
    render(<LoadedAppsSection brokerService={brokerService} />);
    expect(screen.getByRole('progressbar', { name: 'Loading BrokerApps' })).toBeInTheDocument();
  });

  it('shows an empty state when no apps are bound', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
    render(<LoadedAppsSection brokerService={brokerService} />);
    expect(screen.getByText('No loaded apps')).toBeInTheDocument();
  });

  it('shows an error row when the watch fails', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, new Error('forbidden')]);
    render(<LoadedAppsSection brokerService={brokerService} />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });

  it('renders bound apps with status and consumer-count placeholder', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeApp('my-messaging-app', { name: 'my-messaging-service', namespace: 'default' }),
        makeApp('ignored', { name: 'other', namespace: 'default' }),
      ],
      true,
      undefined,
    ]);

    render(<LoadedAppsSection brokerService={brokerService} />);

    expect(screen.getByTestId('loaded-app-link-default-my-messaging-app')).toHaveTextContent(
      'my-messaging-app',
    );
    expect(screen.getByTestId('loaded-app-status-default-my-messaging-app')).toHaveTextContent(
      'Provisioned',
    );
    expect(
      screen.getByTestId('loaded-app-consumer-count-default-my-messaging-app'),
    ).toHaveTextContent('-');
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('lists apps bound from another namespace, watching every namespace', () => {
    const tenantApp = makeApp('tenant-app', { name: 'my-messaging-service', namespace: 'default' });
    tenantApp.metadata = { name: 'tenant-app', namespace: 'tenant-a' };
    mockUseK8sWatchResource.mockReturnValue([[tenantApp], true, undefined]);

    render(<LoadedAppsSection brokerService={brokerService} />);

    expect(screen.getByTestId('loaded-app-link-tenant-a-tenant-app')).toHaveTextContent(
      'tenant-app',
    );
    const [lastWatch] = mockUseK8sWatchResource.mock.calls[
      mockUseK8sWatchResource.mock.calls.length - 1
    ] as [{ namespace?: string }];
    expect(lastWatch.namespace).toBeUndefined();
  });
});
