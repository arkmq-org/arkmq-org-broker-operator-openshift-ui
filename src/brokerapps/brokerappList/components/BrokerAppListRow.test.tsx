import { render, screen } from '@testing-library/react';
import { DataViewTable } from '@patternfly/react-data-view';
import { K8sResourceConditionStatus, type BrokerAppCR } from '../../../k8s/types';
import { BrokerAppListRow } from './BrokerAppListRow';

const DEFAULT_OPTIONS = {
  editActionLabel: 'Edit BrokerApp',
  deleteActionLabel: 'Delete BrokerApp',
  nameError: 'Name is required.',
  namespaceError: 'Namespace is required.',
  statusLabels: {
    Running: 'Deployed',
    Warning: 'Warning',
    Failed: 'Failed',
    Pending: 'Pending',
  },
};

const TEST_COLUMNS = [
  'Name',
  'Namespace',
  'Status',
  'Provisioned To',
  'Created',
  { cell: '', props: { screenReaderText: 'Actions' } },
] as const;

const renderRow = (app: BrokerAppCR) => {
  const rows = [BrokerAppListRow(app, DEFAULT_OPTIONS)];
  render(
    <DataViewTable aria-label="test table" ouiaId="test" columns={[...TEST_COLUMNS]} rows={rows} />,
  );
};

const makeApp = (overrides: Partial<BrokerAppCR> = {}): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: {
    name: 'my-app',
    namespace: 'test-namespace',
    creationTimestamp: '2026-07-07T00:00:00Z',
  },
  spec: { selector: { matchLabels: { tier: 'production' } } },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BrokerAppListRow', () => {
  it('renders the resource link for an app with name and namespace', () => {
    renderRow(makeApp());
    expect(screen.getByText('my-app')).toBeInTheDocument();
  });

  it('renders the namespace resource link', () => {
    renderRow(makeApp());
    expect(screen.getByText('test-namespace')).toBeInTheDocument();
  });

  it('renders an ErrorStatus in the name cell when metadata.name is missing', () => {
    renderRow(makeApp({ metadata: { namespace: 'test-namespace' } }));
    expect(screen.getByText('Name is required.')).toBeInTheDocument();
  });

  it('renders an ErrorStatus in the namespace cell when metadata.namespace is missing', () => {
    renderRow(makeApp({ metadata: { name: 'my-app' } }));
    expect(screen.getByText('Namespace is required.')).toBeInTheDocument();
  });

  it('shows the Deployed label when the Deployed condition is True', () => {
    renderRow(
      makeApp({
        status: { conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }] },
      }),
    );
    expect(screen.getByText('Deployed')).toBeInTheDocument();
  });

  it('shows the Pending label when there are no conditions', () => {
    renderRow(makeApp({ status: { conditions: [] } }));
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows the Pending label when the Deployed condition is False without an error reason', () => {
    renderRow(
      makeApp({
        status: { conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.False }] },
      }),
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows the Pending label when there is no status', () => {
    renderRow(makeApp({ status: undefined }));
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders a ResourceLink to the provisioned BrokerService when present', () => {
    renderRow(
      makeApp({
        status: {
          conditions: [{ type: 'Deployed', status: K8sResourceConditionStatus.True }],
          service: { name: 'prod-cluster', namespace: 'test-namespace' },
        },
      }),
    );
    expect(screen.getByText('prod-cluster')).toBeInTheDocument();
  });

  it('renders an em-dash in the provisioned-to cell when no service is bound', () => {
    renderRow(makeApp({ status: undefined }));
    expect(screen.getByTestId('brokerapp-no-service-test-namespace-my-app')).toBeInTheDocument();
  });

  it('renders the creation timestamp when present', () => {
    renderRow(makeApp());
    expect(screen.getByText('2026-07-07T00:00:00Z')).toBeInTheDocument();
  });

  it('renders a dash in the created cell when creationTimestamp is absent', () => {
    renderRow(
      makeApp({
        metadata: { name: 'my-app', namespace: 'test-namespace' },
      }),
    );
    expect(screen.queryByText('2026-07-07T00:00:00Z')).not.toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('renders the actions menu toggle for an app with name and namespace', () => {
    renderRow(makeApp());
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
  });
});
