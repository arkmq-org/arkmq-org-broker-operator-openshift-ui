import { render, screen } from '@testing-library/react';
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR } from '../../../../../k8s/types';
import { AddressesSection } from './AddressesSection';

const mockUseK8sWatchResources = useK8sWatchResources as jest.Mock;

const brokerAppWithAddresses: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'test-app', namespace: 'default', resourceVersion: '100' },
  spec: {
    serviceSelector: {},
    addresses: [
      { address: 'orders.internal' },
      {
        address: 'events.shared',
        pubSub: true,
        consumerOfAppSelector: "app.metadata.namespace == 'other-ns'",
      },
    ],
    capabilities: [
      {
        producerOf: [
          { address: 'orders.internal' },
          { address: 'events.shared' },
          { address: 'external.queue', appName: 'other-app', appNamespace: 'other-ns' },
        ],
        consumerOf: [{ address: 'external.queue', appName: 'other-app', appNamespace: 'other-ns' }],
      },
    ],
  },
};

const ownerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'other-app', namespace: 'other-ns' },
  spec: {
    serviceSelector: {},
    addresses: [
      { address: 'external.queue', consumerOfAppSelector: "app.metadata.namespace == 'default'" },
    ],
  },
};

const emptyBrokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'empty-app', namespace: 'default', resourceVersion: '1' },
  spec: { serviceSelector: {} },
};

const node = (id: string) => screen.getByTestId(`dataflow-node-${id}`);
const edge = (id: string) => screen.getByTestId(`dataflow-edge-${id}`);

describe('AddressesSection', () => {
  afterEach(() => {
    mockUseK8sWatchResources.mockReset();
    mockUseK8sWatchResources.mockReturnValue({});
  });

  it('renders the section heading', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.getByTestId('broker-app-addresses-section')).toBeInTheDocument();
    expect(screen.getByText('Data flows')).toBeInTheDocument();
  });

  it('shows an empty state when no addresses are configured', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.getByTestId('address-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No addresses')).toBeInTheDocument();
    expect(screen.queryByTestId('address-list')).not.toBeInTheDocument();
  });

  it('draws every address as a box', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(node('addr:orders.internal')).toHaveTextContent('orders.internal');
    expect(node('addr:events.shared')).toHaveTextContent('events.shared');
    expect(node('addr:external.queue')).toHaveTextContent('external.queue');
    expect(screen.getByTestId('address-list')).toBeInTheDocument();
  });

  it('draws the declared flows from and to the app box inside its namespace', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(edge('produce:app:default/test-app->addr:orders.internal')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(edge('produce:app:default/test-app->addr:external.queue')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(edge('consume:addr:external.queue->app:default/test-app')).toHaveAttribute(
      'data-kind',
      'declared',
    );
  });

  it('draws the gate of an owned address as an allowed flow to the admitted namespace', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    // other-ns owns external.queue, so it is a group: the gate lands on its any-app box
    expect(node('ns:other-ns')).toHaveAttribute('data-kind', 'namespace');
    expect(node('app:other-ns/*')).toHaveAttribute('data-kind', 'app');
    expect(edge('consume:addr:events.shared->app:other-ns/*')).toHaveAttribute(
      'data-kind',
      'allowed',
    );
  });

  it('watches the owners of referenced addresses in their own namespaces', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    const calls = mockUseK8sWatchResources.mock.calls as [
      Record<string, { name?: string; namespace?: string }>,
    ][];
    expect(calls[calls.length - 1][0]).toMatchObject({
      'other-ns/other-app': { name: 'other-app', namespace: 'other-ns' },
    });
  });

  it('reports a referenced owner that could not be read', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByTestId('dataflow-issue-ownerMissing')).toBeInTheDocument();
  });

  it('checks the owner gate once the owner is read', () => {
    mockUseK8sWatchResources.mockReturnValue({
      'other-ns/other-app': { data: ownerApp, loaded: true },
    });
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    // the owner admits `default` as a consumer but not as a producer
    expect(edge('produce:app:default/test-app->addr:external.queue')).toHaveAttribute(
      'data-kind',
      'broken',
    );
    expect(edge('consume:addr:external.queue->app:default/test-app')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(screen.getByTestId('dataflow-issue-refused')).toBeInTheDocument();
    expect(screen.queryByTestId('dataflow-issue-ownerMissing')).not.toBeInTheDocument();
  });

  it('warns when an owner watch fails', () => {
    mockUseK8sWatchResources.mockReturnValue({
      'other-ns/other-app': { data: undefined, loaded: false, loadError: new Error('forbidden') },
    });
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByTestId('dataflow-owners-warning')).toBeInTheDocument();
  });

  it('shows the legend next to the diagram', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByTestId('dataflow-legend')).toBeInTheDocument();
  });

  it('does not render editing controls in read-only mode', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.queryByTestId('add-address-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('edit-address-0')).not.toBeInTheDocument();
  });
});
