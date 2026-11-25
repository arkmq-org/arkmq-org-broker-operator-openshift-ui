import { render, screen } from '@testing-library/react';
import { K8sResourceConditionStatus } from '../../k8s/types';
import { ResourceStatusBadge } from './ResourceStatusBadge';

const statusLabels = {
  Running: 'Running',
  Warning: 'Warning',
  Failed: 'Failed',
  Pending: 'Pending',
  Draining: 'Draining',
};

describe('ResourceStatusBadge', () => {
  it('shows Running when the Ready condition is True', () => {
    render(
      <ResourceStatusBadge
        conditions={[{ type: 'Ready', status: K8sResourceConditionStatus.True }]}
        statusLabels={statusLabels}
        dataTest="status-badge"
      />,
    );
    expect(screen.getByTestId('status-badge')).toHaveTextContent('Running');
  });

  it('shows Pending when no matching condition exists', () => {
    render(<ResourceStatusBadge conditions={[]} statusLabels={statusLabels} />);
    expect(screen.getByTestId('resource-status-badge')).toHaveTextContent('Pending');
  });

  it('shows Failed when the condition reason indicates an error', () => {
    render(
      <ResourceStatusBadge
        conditions={[
          {
            type: 'Ready',
            status: K8sResourceConditionStatus.False,
            reason: 'ReconcileFailed',
          },
        ]}
        statusLabels={statusLabels}
      />,
    );
    expect(screen.getByTestId('resource-status-badge')).toHaveTextContent('Failed');
  });

  it('maps False without error to Warning by default for BrokerService', () => {
    render(
      <ResourceStatusBadge
        conditions={[
          {
            type: 'Ready',
            status: K8sResourceConditionStatus.False,
            reason: 'NotReady',
          },
        ]}
        statusLabels={statusLabels}
      />,
    );
    expect(screen.getByTestId('resource-status-badge')).toHaveTextContent('Warning');
  });

  it('shows Draining when isDraining is true', () => {
    render(
      <ResourceStatusBadge
        conditions={[{ type: 'Ready', status: K8sResourceConditionStatus.True }]}
        statusLabels={statusLabels}
        isDraining
      />,
    );
    expect(screen.getByTestId('resource-status-badge')).toHaveTextContent('Draining');
  });
});
