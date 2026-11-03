import { render, screen } from '@testing-library/react';
import type { BrokerAppCR } from '../../../../../k8s/types';
import { AddressesSection } from './AddressesSection';

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
          {
            address: 'external.queue',
            appName: 'other-app',
            appNamespace: 'other-ns',
          },
        ],
        consumerOf: [
          {
            address: 'external.queue',
            appName: 'other-app',
            appNamespace: 'other-ns',
          },
        ],
      },
    ],
  },
};

const emptyBrokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'empty-app', namespace: 'default', resourceVersion: '1' },
  spec: { serviceSelector: {} },
};

describe('AddressesSection', () => {
  it('renders the section with the Addresses heading', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.getByTestId('broker-app-addresses-section')).toBeInTheDocument();
  });

  it('shows an empty state when no addresses are configured', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.getByTestId('address-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No addresses')).toBeInTheDocument();
    expect(screen.queryByTestId('address-list')).not.toBeInTheDocument();
  });

  it('hydrates owned, gated and referenced addresses from the CR', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('orders.internal')).toBeInTheDocument();
    expect(screen.getByText('events.shared')).toBeInTheDocument();
    expect(screen.getByText('external.queue')).toBeInTheDocument();
  });

  it('shows kind labels for each address', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getAllByText('Owned')).toHaveLength(2);
    expect(screen.getByText('Referenced')).toBeInTheDocument();
  });

  it('flags the gated role of an owned address', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('Consumers gated')).toBeInTheDocument();
    expect(screen.queryByText('Producers gated')).not.toBeInTheDocument();
  });

  it('shows direction labels on hydrated addresses', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getAllByText('Produces').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Consumes').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the owner app reference label', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('other-ns/other-app')).toBeInTheDocument();
  });

  it('shows Pub/Sub label for an address with pubSub enabled', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('Pub/Sub')).toBeInTheDocument();
  });

  it('does not render add-address button in read-only mode', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.queryByTestId('add-address-btn')).not.toBeInTheDocument();
  });

  it('does not render edit or remove buttons on address cards', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.queryByTestId('edit-address-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remove-address-0')).not.toBeInTheDocument();
  });
});
