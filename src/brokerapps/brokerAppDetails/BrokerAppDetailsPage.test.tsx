import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useParams } from 'react-router';
import { BrokerAppModel } from '../../k8s/models';
import type { BrokerAppCR } from '../../k8s/types';
import { K8sResourceConditionStatus } from '../../k8s/types';
import BrokerAppDetailsPage from './BrokerAppDetailsPage';

jest.mock('react-router', () => ({
  useParams: jest.fn(),
  useNavigate: jest.fn(() => jest.fn()),
  useLocation: () => ({
    pathname: '/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerApp/my-payment-app',
  }),
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;
const mockUseParams = useParams as jest.Mock;

const brokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'my-payment-app', namespace: 'default' },
  spec: {},
  status: {
    service: {
      name: 'ex-aao',
      namespace: 'default',
      assignedPort: 61617,
    },
    conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ name: 'my-payment-app' });
  mockUseK8sWatchResource.mockImplementation((query: { isList?: boolean }) => {
    if (query.isList) {
      return [[], true, undefined];
    }
    return [brokerApp, true, undefined];
  });
});

describe('BrokerAppDetailsPage', () => {
  it('shows not found when the route name is missing', () => {
    mockUseParams.mockReturnValue({});
    render(<BrokerAppDetailsPage namespace="default" model={BrokerAppModel} />);
    expect(screen.getByText('BrokerApp not found')).toBeInTheDocument();
  });

  it('shows a spinner while the BrokerApp watch is loading', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, false, undefined]);
    render(<BrokerAppDetailsPage namespace="default" model={BrokerAppModel} />);
    expect(screen.getByRole('progressbar', { name: 'Loading BrokerApp' })).toBeInTheDocument();
  });

  it('shows not found when the watch returns an error', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, true, new Error('not found')]);
    render(<BrokerAppDetailsPage namespace="default" model={BrokerAppModel} />);
    expect(screen.getByText('BrokerApp not found')).toBeInTheDocument();
  });

  it('renders title, status badge, tabs, and breadcrumb when loaded', () => {
    render(<BrokerAppDetailsPage namespace="default" model={BrokerAppModel} />);

    expect(screen.getByTestId('broker-app-details-title')).toHaveTextContent('my-payment-app');
    expect(
      screen.getByTestId('broker-app-details-status-default-my-payment-app'),
    ).toHaveTextContent('Provisioned');
    expect(screen.getByTestId('broker-app-details-breadcrumb')).toBeInTheDocument();
    expect(screen.getByTestId('nav-tab-Overview')).toBeInTheDocument();
    expect(screen.getByTestId('nav-tab-YAML')).toBeInTheDocument();
    expect(screen.getByTestId('nav-tab-Resources')).toBeInTheDocument();
    expect(screen.getByTestId('broker-app-overview-tab')).toBeInTheDocument();
    expect(screen.getByTestId('resource-details-favorite-button')).toBeInTheDocument();
    expect(
      screen.getByTestId('broker-app-details-actions-default-my-payment-app'),
    ).toHaveTextContent('Actions');
  });

  it('shows the provisioned service link when bound to a service', () => {
    render(<BrokerAppDetailsPage namespace="default" model={BrokerAppModel} />);
    expect(screen.getByTestId('broker-app-provisioned-service')).toHaveTextContent(
      'Provisioned to Service: ex-aao',
    );
    expect(screen.getByRole('link', { name: 'ex-aao' })).toHaveAttribute(
      'href',
      '/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService/ex-aao',
    );
  });

  it('does not show the service link when the app is not provisioned', () => {
    const unprovisioned: BrokerAppCR = {
      ...brokerApp,
      status: { conditions: [] },
    };
    mockUseK8sWatchResource.mockImplementation((query: { isList?: boolean }) => {
      if (query.isList) return [[], true, undefined];
      return [unprovisioned, true, undefined];
    });
    render(<BrokerAppDetailsPage namespace="default" model={BrokerAppModel} />);
    expect(screen.queryByTestId('broker-app-provisioned-service')).not.toBeInTheDocument();
  });
});
