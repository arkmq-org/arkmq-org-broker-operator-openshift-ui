import { render, screen } from '@testing-library/react';
import type { BrokerAppCR } from '../../../../k8s/types';
import { K8sResourceConditionStatus } from '../../../../k8s/types';
import { BrokerAppOverviewTab } from './BrokerAppOverviewTab';

jest.mock('react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));

const brokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: {
    name: 'my-payment-app',
    namespace: 'default',
    labels: { app: 'payment' },
    resourceVersion: '42',
  },
  spec: {
    serviceSelector: {},
    addresses: [{ address: 'payment.transactions' }],
    capabilities: [
      {
        producerOf: [{ address: 'payment.transactions' }],
        consumerOf: [{ address: 'payment.requests', appName: 'orders', appNamespace: 'prod' }],
      },
    ],
  },
  status: {
    service: {
      name: 'ex-aao',
      namespace: 'default',
      assignedPort: 61617,
    },
    conditions: [
      {
        type: 'Deployed',
        status: K8sResourceConditionStatus.True,
        reason: 'Provisioned',
        message: 'Application provisioned to broker',
      },
    ],
  },
};

describe('BrokerAppOverviewTab', () => {
  it('renders all sections when the CR is provided', () => {
    render(<BrokerAppOverviewTab obj={brokerApp} />);

    expect(screen.getByTestId('broker-app-overview-tab')).toBeInTheDocument();
    expect(screen.getByText('BrokerApp details')).toBeInTheDocument();
    expect(screen.getByTestId('resource-labels-and-annotations')).toBeInTheDocument();
    expect(screen.getByText('app=payment')).toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByTestId('broker-app-connection-information')).toBeInTheDocument();
    expect(screen.getByTestId('broker-app-addresses-section')).toBeInTheDocument();
    expect(screen.getByTestId('resource-conditions-table')).toBeInTheDocument();
    expect(screen.getByText('Provisioned')).toBeInTheDocument();
    expect(screen.getByText('Application provisioned to broker')).toBeInTheDocument();
  });

  it('skips labels and addresses sections when obj is not provided', () => {
    render(<BrokerAppOverviewTab />);

    expect(screen.getByTestId('broker-app-overview-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-labels-and-annotations')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broker-app-addresses-section')).not.toBeInTheDocument();
    expect(screen.getByText('Metrics')).toBeInTheDocument();
    expect(screen.getByText('No conditions')).toBeInTheDocument();
  });

  it('shows connection information when the app is provisioned', () => {
    render(<BrokerAppOverviewTab obj={brokerApp} />);
    expect(screen.getByDisplayValue('ex-aao.default.svc.cluster.local')).toBeInTheDocument();
  });

  it('displays hydrated addresses with ownership and direction', () => {
    render(<BrokerAppOverviewTab obj={brokerApp} />);
    expect(screen.getByText('payment.transactions')).toBeInTheDocument();
    expect(screen.getByText('payment.requests')).toBeInTheDocument();
    expect(screen.getByText('Owned')).toBeInTheDocument();
    expect(screen.getByText('External')).toBeInTheDocument();
  });

  it('shows drain alert when deletionTimestamp is set', () => {
    const draining: BrokerAppCR = {
      ...brokerApp,
      metadata: { ...brokerApp.metadata, deletionTimestamp: '2026-01-01T00:00:00Z' },
    };
    render(<BrokerAppOverviewTab obj={draining} />);
    expect(screen.getByTestId('drain-in-progress-alert')).toBeInTheDocument();
    expect(screen.getByText('View drain progress')).toHaveAttribute(
      'href',
      '/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService/ex-aao',
    );
  });

  it('does not show drain alert when deletionTimestamp is absent', () => {
    render(<BrokerAppOverviewTab obj={brokerApp} />);
    expect(screen.queryByTestId('drain-in-progress-alert')).not.toBeInTheDocument();
  });

  it('renders without crashing when serviceSelector is missing from the CR', () => {
    const crWithoutSelector = {
      ...brokerApp,
      spec: { ...brokerApp.spec, serviceSelector: undefined },
    } as unknown as BrokerAppCR;

    render(<BrokerAppOverviewTab obj={crWithoutSelector} />);

    expect(screen.getByTestId('broker-app-overview-tab')).toBeInTheDocument();
    expect(screen.getByTestId('resource-labels-and-annotations')).toBeInTheDocument();
  });
});
