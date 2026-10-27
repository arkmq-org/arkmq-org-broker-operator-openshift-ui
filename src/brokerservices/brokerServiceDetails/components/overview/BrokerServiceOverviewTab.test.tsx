import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerService } from '../../../../k8s/types';
import { K8sResourceConditionStatus } from '../../../../k8s/types';
import { BrokerServiceOverviewTab } from './BrokerServiceOverviewTab';

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

const brokerService: BrokerService = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: {
    name: 'my-messaging-service',
    namespace: 'default',
    labels: { app: 'broker' },
  },
  status: {
    conditions: [
      {
        type: 'Ready',
        status: K8sResourceConditionStatus.True,
        reason: 'Deployed',
        message: 'Broker is ready',
      },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  // LoadedAppsSection watches BrokerApps; Overview also mounts Metrics (no watch).
  mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
});

describe('BrokerServiceOverviewTab', () => {
  it('renders details, metrics, loaded apps, and conditions sections', () => {
    render(<BrokerServiceOverviewTab obj={brokerService} />);

    expect(screen.getByTestId('broker-service-overview-tab')).toBeInTheDocument();
    expect(screen.getByText('BrokerService details')).toBeInTheDocument();
    expect(screen.getByTestId('resource-labels-and-annotations')).toBeInTheDocument();
    expect(screen.getByText('app=broker')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-loaded-apps')).toBeInTheDocument();
    expect(screen.getByTestId('resource-conditions-table')).toBeInTheDocument();
    expect(screen.getByText('Deployed')).toBeInTheDocument();
    expect(screen.getByText('Broker is ready')).toBeInTheDocument();
  });

  it('skips labels and loaded apps when the CR is not yet available', () => {
    render(<BrokerServiceOverviewTab />);

    expect(screen.getByTestId('broker-service-overview-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-labels-and-annotations')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broker-service-loaded-apps')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broker-service-rejected-apps')).not.toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('No conditions')).toBeInTheDocument();
  });

  it('hides rejected apps when status.rejectedApps is absent', () => {
    render(<BrokerServiceOverviewTab obj={brokerService} />);
    expect(screen.queryByTestId('broker-service-rejected-apps')).not.toBeInTheDocument();
  });

  it('shows rejected apps when status.rejectedApps has entries', () => {
    render(
      <BrokerServiceOverviewTab
        obj={{
          ...brokerService,
          status: {
            ...brokerService.status,
            rejectedApps: [
              {
                name: 'app-b',
                namespace: 'default',
                reason: 'does not match service labels',
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByTestId('broker-service-rejected-apps')).toBeInTheDocument();
    expect(screen.getByTestId('rejected-app-reason-default-app-b')).toHaveTextContent(
      'does not match service labels',
    );
  });
});
