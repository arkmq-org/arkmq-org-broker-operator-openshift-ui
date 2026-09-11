import { render, screen } from '@testing-library/react';
import type { BrokerService } from '../../../k8s/types';
import { K8sResourceConditionStatus } from '../../../k8s/types';
import { BrokerServiceListTable } from './BrokerServiceListTable';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => jest.fn()),
}));

const myMessagingService1 = 'my-messaging-service-1';

const makeService = (name: string, namespace = 'test-namespace'): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name, namespace, creationTimestamp: '2026-07-07T00:00:00Z' },
  status: { conditions: [{ type: 'Ready', status: K8sResourceConditionStatus.True }] },
});

describe('BrokerServiceListTable', () => {
  it('renders the BrokerService table column headers when data is loaded', () => {
    render(
      <BrokerServiceListTable
        data={[makeService(myMessagingService1)]}
        loaded={true}
        loadError={undefined}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Namespace' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Labels' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
  });

  it('renders BrokerService rows with the Running status label for a Ready=True service', () => {
    render(
      <BrokerServiceListTable
        data={[makeService(myMessagingService1)]}
        loaded={true}
        loadError={undefined}
      />,
    );
    expect(screen.getByText(myMessagingService1)).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
  });
});
