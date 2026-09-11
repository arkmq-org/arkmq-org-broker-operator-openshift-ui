import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useParams } from 'react-router';
import { BrokerServiceModel } from '../../k8s/models';
import type { BrokerService } from '../../k8s/types';
import { K8sResourceConditionStatus } from '../../k8s/types';
import BrokerServiceDetailsPage from './BrokerServiceDetailsPage';

jest.mock('react-router', () => ({
  useParams: jest.fn(),
  useNavigate: jest.fn(() => jest.fn()),
  useLocation: () => ({
    pathname: '/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService/my-messaging-service',
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

const brokerService: BrokerService = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-messaging-service', namespace: 'default' },
  status: {
    conditions: [{ type: 'Ready', status: K8sResourceConditionStatus.True }],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseParams.mockReturnValue({ name: 'my-messaging-service' });
  mockUseK8sWatchResource.mockImplementation((query: { isList?: boolean }) => {
    if (query.isList) {
      return [[], true, undefined];
    }
    return [brokerService, true, undefined];
  });
});

describe('BrokerServiceDetailsPage', () => {
  it('shows not found when the route name is missing', () => {
    mockUseParams.mockReturnValue({});
    render(<BrokerServiceDetailsPage namespace="default" model={BrokerServiceModel} />);
    expect(screen.getByText('BrokerService not found')).toBeInTheDocument();
  });

  it('shows a spinner while the BrokerService watch is loading', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, false, undefined]);
    render(<BrokerServiceDetailsPage namespace="default" model={BrokerServiceModel} />);
    expect(screen.getByRole('progressbar', { name: 'Loading BrokerService' })).toBeInTheDocument();
  });

  it('shows not found when the watch returns an error', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, true, new Error('not found')]);
    render(<BrokerServiceDetailsPage namespace="default" model={BrokerServiceModel} />);
    expect(screen.getByText('BrokerService not found')).toBeInTheDocument();
  });

  it('renders title, status, tabs, and Overview content when loaded', () => {
    render(<BrokerServiceDetailsPage namespace="default" model={BrokerServiceModel} />);

    expect(screen.getByTestId('broker-service-details-title')).toHaveTextContent(
      'my-messaging-service',
    );
    expect(
      screen.getByTestId('broker-service-details-status-default-my-messaging-service'),
    ).toHaveTextContent('Running');
    expect(screen.getByTestId('broker-service-details-breadcrumb')).toBeInTheDocument();
    expect(screen.getByTestId('nav-tab-Overview')).toBeInTheDocument();
    expect(screen.getByTestId('nav-tab-YAML')).toBeInTheDocument();
    expect(screen.getByTestId('nav-tab-Resources')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-overview-tab')).toBeInTheDocument();
    expect(screen.getByTestId('resource-details-favorite-button')).toBeInTheDocument();
    expect(
      screen.getByTestId('broker-service-details-actions-default-my-messaging-service'),
    ).toHaveTextContent('Actions');
  });
});
