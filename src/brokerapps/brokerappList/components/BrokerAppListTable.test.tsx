import { createContext, createElement, useContext } from 'react';
import { render, screen } from '@testing-library/react';
import { BrokerAppListTable } from './BrokerAppListTable';
import type { BrokerAppCR } from '../../../k8s/types';

jest.mock('@openshift-console/dynamic-plugin-sdk', () => ({
  Timestamp: ({ timestamp }: { timestamp?: string }) =>
    timestamp ? <span>{timestamp}</span> : <span>{'—'}</span>,
  ResourceLink: ({
    name,
    namespace,
    groupVersionKind,
  }: {
    name?: string;
    namespace?: string;
    groupVersionKind?: { kind: string };
  }) => (
    <a
      href={`/k8s/ns/${namespace ?? ''}/${groupVersionKind?.kind ?? ''}/${name ?? ''}`}
      data-test={`resource-link-${name ?? ''}`}
    >
      {name}
    </a>
  ),
}));

jest.mock('../../../shared-components/StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}));

jest.mock('../../../shared-components/LabelList', () => ({
  LabelList: ({ labels }: { labels?: Record<string, string> }) => (
    <span data-testid="label-list">{JSON.stringify(labels)}</span>
  ),
}));

// Stub DataView so the table renders without needing the full PatternFly
// DataView internals (portals, ResizeObserver, etc.).
jest.mock('@patternfly/react-data-view', () => {
  const DataViewState = { loading: 'loading', error: 'error', empty: 'empty' } as const;

  // Shared context so DataView can pass activeState down to DataViewTable.
  const ActiveStateContext = createContext<string | undefined>(undefined);

  const DataView = ({
    children,
    activeState,
  }: {
    children?: React.ReactNode;
    activeState?: string;
  }) => createElement(ActiveStateContext.Provider, { value: activeState }, children);

  const DataViewTable = ({
    rows,
    bodyStates,
  }: {
    columns?: unknown[];
    rows?: { id?: string; props?: Record<string, unknown>; row: unknown[] }[];
    bodyStates?: Record<string, React.ReactNode>;
    'aria-label'?: string;
  }) => {
    const activeState = useContext(ActiveStateContext);
    if (activeState && bodyStates?.[activeState]) {
      return createElement('table', null, bodyStates[activeState]);
    }
    return createElement(
      'table',
      null,
      createElement(
        'tbody',
        null,
        (rows ?? []).map((row) =>
          createElement(
            'tr',
            { key: row.id, ...(row.props ?? {}) },
            row.row.map((cell, i) => createElement('td', { key: i }, cell as React.ReactNode)),
          ),
        ),
      ),
    );
  };

  return { DataViewState, DataView, DataViewTable };
});

import { DataView, DataViewState } from '@patternfly/react-data-view';

const makeApp = (overrides: Partial<BrokerAppCR> = {}): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: {
    name: 'my-app',
    namespace: 'test-ns',
    creationTimestamp: '2025-06-30T08:22:14.123Z',
  },
  spec: {
    selector: { matchLabels: { tier: 'production' } },
  },
  ...overrides,
});

describe('BrokerAppListTable', () => {
  it('renders a row for each BrokerApp', () => {
    render(
      <DataView>
        <BrokerAppListTable
          apps={[
            makeApp({ metadata: { name: 'app-one', namespace: 'test-ns' } }),
            makeApp({ metadata: { name: 'app-two', namespace: 'test-ns' } }),
          ]}
          emptyMessage="No BrokerApps found"
        />
      </DataView>,
    );
    expect(screen.getByTestId('brokerapp-row-app-one')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-row-app-two')).toBeInTheDocument();
  });

  it('shows a spinner while loading', () => {
    render(
      <DataView activeState={DataViewState.loading}>
        <BrokerAppListTable apps={[]} emptyMessage="No BrokerApps found" />
      </DataView>,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error alert when loading fails', () => {
    render(
      <DataView activeState={DataViewState.error}>
        <BrokerAppListTable apps={[]} emptyMessage="No BrokerApps found" />
      </DataView>,
    );
    expect(screen.getByTestId('brokerapp-load-error')).toBeInTheDocument();
  });

  it('shows the empty state with the provided message', () => {
    render(
      <DataView activeState={DataViewState.empty}>
        <BrokerAppListTable apps={[]} emptyMessage="Custom empty message" />
      </DataView>,
    );
    expect(screen.getByTestId('brokerapp-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('renders a ResourceLink with the correct name and namespace for each app', () => {
    render(
      <DataView>
        <BrokerAppListTable
          apps={[makeApp({ metadata: { name: 'my-app', namespace: 'test-ns' } })]}
          emptyMessage="No BrokerApps found"
        />
      </DataView>,
    );
    const link = screen.getByTestId('resource-link-my-app');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('my-app'));
  });

  it('renders a ResourceLink for the provisioned service', () => {
    render(
      <DataView>
        <BrokerAppListTable
          apps={[
            makeApp({
              metadata: { name: 'my-app', namespace: 'test-ns' },
              status: {
                conditions: [{ type: 'Provisioned', status: 'True' }],
                provisionedService: 'prod-cluster',
              },
            }),
          ]}
          emptyMessage="No BrokerApps found"
        />
      </DataView>,
    );
    expect(screen.getByTestId('resource-link-prod-cluster')).toBeInTheDocument();
  });

  it('shows an em-dash when no provisioned service is present', () => {
    render(
      <DataView>
        <BrokerAppListTable
          apps={[
            makeApp({ metadata: { name: 'my-app', namespace: 'test-ns' }, status: undefined }),
          ]}
          emptyMessage="No BrokerApps found"
        />
      </DataView>,
    );
    expect(screen.getByTestId('brokerapp-no-service-my-app')).toBeInTheDocument();
  });

  it('renders the creation timestamp via the SDK Timestamp component', () => {
    render(
      <DataView>
        <BrokerAppListTable
          apps={[
            makeApp({
              metadata: {
                name: 'my-app',
                namespace: 'test-ns',
                creationTimestamp: '2025-06-30T08:22:14.123Z',
              },
            }),
          ]}
          emptyMessage="No BrokerApps found"
        />
      </DataView>,
    );
    expect(screen.getByText('2025-06-30T08:22:14.123Z')).toBeInTheDocument();
  });
});
