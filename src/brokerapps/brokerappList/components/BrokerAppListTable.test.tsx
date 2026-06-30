import { render, screen } from '@testing-library/react';
import { K8sResourceConditionStatus, type BrokerAppCR } from '../../../k8s/types';
import { BrokerAppListTable } from './BrokerAppListTable';

const makeApp = (name: string, namespace = 'test-namespace'): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace, creationTimestamp: '2026-07-07T00:00:00Z' },
  spec: { selector: { matchLabels: { tier: 'production' } } },
  status: { conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }] },
});

describe('BrokerAppListTable', () => {
  it('renders the BrokerApp table column headers when data is loaded', () => {
    render(<BrokerAppListTable data={[makeApp('my-app')]} loaded={true} loadError={undefined} />);

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Namespace' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Provisioned To' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Created' })).toBeInTheDocument();
  });

  it('renders BrokerApp rows with the Deployed status label for a Deployed=True app', () => {
    render(<BrokerAppListTable data={[makeApp('my-app')]} loaded={true} loadError={undefined} />);
    expect(screen.getByText('my-app')).toBeInTheDocument();
    expect(screen.getByText('Deployed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
  });
});
