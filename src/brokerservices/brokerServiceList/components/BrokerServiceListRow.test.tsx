import { render, screen } from '@testing-library/react';
import { K8sResourceConditionStatus } from '../../../k8s/types';
import type { BrokerService } from '../../../k8s/types';
import { BrokerServiceListRow } from './BrokerServiceListRow';
import { DataViewTable } from '@patternfly/react-data-view';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => jest.fn()),
}));

const STATUS_LABELS = {
  Running: 'Running',
  Warning: 'Warning',
  Failed: 'Failed',
  Pending: 'Pending',
};

const DEFAULT_OPTIONS = {
  editActionLabel: 'Edit BrokerService',
  deleteActionLabel: 'Delete BrokerService',
  nameError: 'Name is required.',
  namespaceError: 'Namespace is required.',
  statusLabels: STATUS_LABELS,
};

const TEST_COLUMNS = [
  'Name',
  'Namespace',
  'Status',
  'Labels',
  'Created',
  { cell: '', props: { screenReaderText: 'Actions' } },
] as const;

const renderRow = (service: BrokerService) => {
  const rows = [BrokerServiceListRow(service, DEFAULT_OPTIONS)];
  render(
    <DataViewTable aria-label="test table" ouiaId="test" columns={[...TEST_COLUMNS]} rows={rows} />,
  );
};

const makeService = (overrides: Partial<BrokerService> = {}): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: {
    name: 'my-messaging-service',
    namespace: 'test-namespace',
    creationTimestamp: '2026-07-07T00:00:00Z',
  },
  ...overrides,
});

describe('BrokerServiceListRow', () => {
  it('renders the resource link for a service with name and namespace', () => {
    renderRow(makeService());
    expect(screen.getByText('my-messaging-service')).toBeInTheDocument();
  });

  it('renders the namespace resource link', () => {
    renderRow(makeService());
    expect(screen.getByText('test-namespace')).toBeInTheDocument();
  });

  it('renders an ErrorStatus in the name cell when metadata.name is missing', () => {
    const service = makeService({ metadata: { namespace: 'test-namespace' } });
    renderRow(service);
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
  });

  it('renders an ErrorStatus in the namespace cell when metadata.namespace is missing', () => {
    const service = makeService({ metadata: { name: 'my-messaging-service' } });
    renderRow(service);
    expect(screen.getByText('Namespace is required.')).toBeInTheDocument();
  });

  it('shows the Running status label when the Ready condition is True', () => {
    const service = makeService({
      status: {
        conditions: [{ type: 'Ready', status: K8sResourceConditionStatus.True }],
      },
    });
    renderRow(service);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('shows the Pending status label when there are no conditions', () => {
    renderRow(makeService({ status: { conditions: [] } }));
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows the Failed status label when the Ready condition is False with a Fail reason', () => {
    const service = makeService({
      status: {
        conditions: [
          {
            type: 'Ready',
            status: K8sResourceConditionStatus.False,
            reason: 'DeploymentFailed',
          },
        ],
      },
    });
    renderRow(service);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('shows the Warning status label when the Ready condition is False without a Fail reason', () => {
    const service = makeService({
      status: {
        conditions: [
          { type: 'Ready', status: K8sResourceConditionStatus.False, reason: 'Reconciling' },
        ],
      },
    });
    renderRow(service);
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('renders a dash in the labels cell when there are no labels', () => {
    renderRow(
      makeService({
        metadata: {
          name: 'my-messaging-service',
          namespace: 'test-namespace',
          creationTimestamp: '2026-07-07T00:00:00Z',
        },
      }),
    );
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders label key=value pairs when labels are present', () => {
    const service = makeService({
      metadata: {
        name: 'my-messaging-service',
        namespace: 'test-namespace',
        labels: { app: 'messaging', env: 'prod' },
      },
    });
    renderRow(service);
    expect(screen.getByText(/app: "messaging"/)).toBeInTheDocument();
    expect(screen.getByText(/env: "prod"/)).toBeInTheDocument();
  });

  it('renders the creation timestamp when present', () => {
    renderRow(makeService());
    expect(screen.getByText('2026-07-07T00:00:00Z')).toBeInTheDocument();
  });

  it('renders a dash in the created cell when creationTimestamp is absent', () => {
    const service = makeService({
      metadata: {
        name: 'my-messaging-service',
        namespace: 'test-namespace',
        labels: { app: 'messaging' },
      },
    });
    renderRow(service);
    expect(screen.queryByText('2026-07-07T00:00:00Z')).not.toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders the actions menu toggle for a service with name and namespace', () => {
    renderRow(makeService());
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
  });
});
