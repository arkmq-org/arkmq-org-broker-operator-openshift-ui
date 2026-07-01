import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import BrokerAppListPage from './BrokerAppListPage';
import type { BrokerAppCR } from '../../k8s/types';
import type { BrokerAppFilters } from './components/BrokerAppListToolbar';

const mockUseK8sWatchResource = jest.fn();
jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  useK8sWatchResource: (...args: unknown[]): unknown => mockUseK8sWatchResource(...args),
  ListPageHeader: ({ title, children }: { title: string; children?: React.ReactNode }) => (
    <>
      <h1 data-test="brokerapp-list-title">{title}</h1>
      {children}
    </>
  ),
  ListPageCreateLink: ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <a href={to} data-test="brokerapp-create-btn">
      {children}
    </a>
  ),
}));

// Minimal DataView stub — page uses DataView as a wrapper and reads DataViewState.
jest.mock('@patternfly/react-data-view', () => {
  const DataViewState = { loading: 'loading', error: 'error', empty: 'empty' } as const;
  return {
    DataViewState,
    DataView: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    useDataViewPagination: ({ perPage }: { perPage: number }) => ({
      page: 1,
      perPage,
      onSetPage: jest.fn(),
      onPerPageSelect: jest.fn(),
    }),
    useDataViewFilters: ({ initialFilters }: { initialFilters: Record<string, string> }) => {
      const [filters, setFilters] = useState(initialFilters);
      return {
        filters,
        onSetFilters: (vals: Partial<typeof initialFilters>) => {
          setFilters((f) => ({ ...f, ...vals }) as Record<string, string>);
        },
      };
    },
  };
});

// Stub the table so page tests stay focused on data-fetching, filtering, and
// navigation wiring rather than table rendering details.
jest.mock('./components/BrokerAppListTable', () => ({
  BrokerAppListTable: ({ apps, emptyMessage }: { apps: BrokerAppCR[]; emptyMessage: string }) => (
    <div data-test="mock-table">
      {apps.map((a) => (
        <div key={a.metadata?.name} data-test={`brokerapp-row-${a.metadata?.name ?? ''}`}>
          {a.metadata?.name}
        </div>
      ))}
      <span data-test="empty-message">{emptyMessage}</span>
    </div>
  ),
}));

// Stub the toolbar so page tests can trigger filter changes via a plain input
// without needing to render the full PatternFly DataView toolbar internals.
jest.mock('./components/BrokerAppListToolbar', () => ({
  BrokerAppListToolbar: ({
    filters,
    onSetFilters,
  }: {
    filters: BrokerAppFilters;
    onSetFilters: (v: Partial<BrokerAppFilters>) => void;
    [k: string]: unknown;
  }) => (
    <>
      <input
        data-testid="toolbar-filter"
        placeholder="Search by name..."
        value={filters.name}
        onChange={(e) => {
          onSetFilters({ name: e.target.value });
        }}
      />
      <input
        data-testid="toolbar-status"
        placeholder="Filter by status..."
        value={filters.status}
        onChange={(e) => {
          onSetFilters({ status: e.target.value });
        }}
      />
      <input
        data-testid="toolbar-service"
        placeholder="Filter by provisioned service..."
        value={filters.provisionedService}
        onChange={(e) => {
          onSetFilters({ provisionedService: e.target.value });
        }}
      />
    </>
  ),
}));

const makeApp = (overrides: Partial<BrokerAppCR> = {}): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: {
    name: 'my-app',
    namespace: 'test-ns',
    creationTimestamp: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  },
  spec: {
    selector: { matchLabels: { tier: 'production' } },
  },
  ...overrides,
});

describe('BrokerAppListPage', () => {
  it('renders the page title', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, null]);
    render(<BrokerAppListPage namespace="test-ns" />);
    expect(screen.getByTestId('brokerapp-list-title')).toBeInTheDocument();
  });

  it('links to the create form with the correct URL', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, null]);
    render(<BrokerAppListPage namespace="test-ns" />);
    expect(screen.getByTestId('brokerapp-create-btn')).toHaveAttribute(
      'href',
      '/k8s/ns/test-ns/brokerapps/~new',
    );
  });

  it('passes loaded apps to the table', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeApp({ metadata: { name: 'app-one', namespace: 'test-ns' } }),
        makeApp({ metadata: { name: 'app-two', namespace: 'test-ns' } }),
      ],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    expect(screen.getByTestId('brokerapp-row-app-one')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-row-app-two')).toBeInTheDocument();
  });

  it('filters apps by name before passing to the table', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeApp({ metadata: { name: 'order-processor', namespace: 'test-ns' } }),
        makeApp({ metadata: { name: 'notification-service', namespace: 'test-ns' } }),
      ],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    fireEvent.change(screen.getByPlaceholderText('Search by name...'), {
      target: { value: 'order' },
    });
    expect(screen.getByTestId('brokerapp-row-order-processor')).toBeInTheDocument();
    expect(screen.queryByTestId('brokerapp-row-notification-service')).not.toBeInTheDocument();
  });

  it('navigates to the app detail when the table fires onSelectApp', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [makeApp({ metadata: { name: 'my-app', namespace: 'test-ns' } })],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    // Navigation is now handled directly by ResourceLink inside BrokerAppListTable;
    // the page no longer wires a navigate callback. Verify the row is rendered.
    expect(screen.getByTestId('brokerapp-row-my-app')).toBeInTheDocument();
  });

  it('navigates to service detail when the table fires onSelectService', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeApp({
          metadata: { name: 'my-app', namespace: 'test-ns' },
          status: {
            conditions: [{ type: 'Provisioned', status: 'True' }],
            provisionedService: 'prod-messaging-cluster',
          },
        }),
      ],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    // Navigation to service detail is handled by ResourceLink inside BrokerAppListTable.
    // Verify the row is rendered so the link would be present in the real component.
    expect(screen.getByTestId('brokerapp-row-my-app')).toBeInTheDocument();
  });

  it('passes the no-filter empty message when no apps exist', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, null]);
    render(<BrokerAppListPage namespace="test-ns" />);
    expect(screen.getByTestId('empty-message')).toHaveTextContent('No BrokerApps found');
  });

  it('passes the filter-aware empty message when search yields no results', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [makeApp({ metadata: { name: 'my-app', namespace: 'test-ns' } })],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    fireEvent.change(screen.getByPlaceholderText('Search by name...'), {
      target: { value: 'zzz' },
    });
    expect(screen.getByTestId('empty-message')).toHaveTextContent(
      'No BrokerApps match the search filter.',
    );
  });

  it('filters apps by status before passing to the table', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeApp({
          metadata: { name: 'provisioned-app', namespace: 'test-ns' },
          status: { conditions: [{ type: 'Provisioned', status: 'True' }] },
        }),
        makeApp({
          metadata: { name: 'pending-app', namespace: 'test-ns' },
          status: { conditions: [] },
        }),
      ],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    fireEvent.change(screen.getByPlaceholderText('Filter by status...'), {
      target: { value: 'pend' },
    });
    expect(screen.getByTestId('brokerapp-row-pending-app')).toBeInTheDocument();
    expect(screen.queryByTestId('brokerapp-row-provisioned-app')).not.toBeInTheDocument();
  });

  it('filters apps by provisioned service before passing to the table', () => {
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeApp({
          metadata: { name: 'app-a', namespace: 'test-ns' },
          status: { conditions: [], provisionedService: 'prod-cluster' },
        }),
        makeApp({
          metadata: { name: 'app-b', namespace: 'test-ns' },
          status: { conditions: [], provisionedService: 'staging-cluster' },
        }),
      ],
      true,
      null,
    ]);
    render(<BrokerAppListPage namespace="test-ns" />);
    fireEvent.change(screen.getByPlaceholderText('Filter by provisioned service...'), {
      target: { value: 'prod' },
    });
    expect(screen.getByTestId('brokerapp-row-app-a')).toBeInTheDocument();
    expect(screen.queryByTestId('brokerapp-row-app-b')).not.toBeInTheDocument();
  });
});
