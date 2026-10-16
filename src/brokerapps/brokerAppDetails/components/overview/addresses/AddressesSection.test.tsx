import { act, fireEvent, render, screen } from '@testing-library/react';
import { k8sUpdate, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR } from '../../../../../k8s/types';
import { AddressesSection } from './AddressesSection';

const mockAccessReview = useAccessReview as jest.Mock;
const mockK8sUpdate = k8sUpdate as jest.Mock;

const brokerAppWithAddresses: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'test-app', namespace: 'default', resourceVersion: '100' },
  spec: {
    addresses: [{ address: 'orders.internal' }],
    sharedAddresses: [{ address: 'events.shared', pubSub: true }],
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
  spec: {},
};

describe('AddressesSection', () => {
  beforeEach(() => {
    mockAccessReview.mockReturnValue([true, false]);
    mockK8sUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    mockAccessReview.mockReset();
    mockK8sUpdate.mockReset();
  });

  it('renders the section with the Addresses heading', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.getByTestId('broker-app-addresses-section')).toBeInTheDocument();
    expect(screen.getByTestId('address-list')).toBeInTheDocument();
  });

  it('renders the add-address button', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.getByTestId('add-address-btn')).toBeInTheDocument();
  });

  it('hydrates all three address types from the CR', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('orders.internal')).toBeInTheDocument();
    expect(screen.getByText('events.shared')).toBeInTheDocument();
    expect(screen.getByText('external.queue')).toBeInTheDocument();
  });

  it('shows ownership labels for each address type', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
    expect(screen.getByText('External')).toBeInTheDocument();
  });

  it('shows direction labels on hydrated addresses', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getAllByText('Produces').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Consumes').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the external app reference label', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('other-ns/other-app')).toBeInTheDocument();
  });

  it('shows Pub/Sub label for shared address with pubSub enabled', () => {
    render(<AddressesSection brokerApp={brokerAppWithAddresses} />);
    expect(screen.getByText('Pub/Sub')).toBeInTheDocument();
  });

  it('does not show save/cancel buttons before any changes', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    expect(screen.queryByTestId('addresses-save-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('addresses-cancel-btn')).not.toBeInTheDocument();
  });

  it('shows save/cancel buttons after adding an address', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    fireEvent.click(screen.getByTestId('add-address-btn'));
    fireEvent.click(screen.getByTestId('modal-done-btn'));
    expect(screen.getByTestId('addresses-save-btn')).toBeInTheDocument();
    expect(screen.getByTestId('addresses-cancel-btn')).toBeInTheDocument();
  });

  it('calls k8sUpdate when save is clicked', async () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    fireEvent.click(screen.getByTestId('add-address-btn'));
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'new.address' },
    });
    fireEvent.click(screen.getByTestId('modal-done-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('addresses-save-btn'));
      await Promise.resolve();
    });

    expect(mockK8sUpdate).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const savedCR = mockK8sUpdate.mock.calls[0][0].data as BrokerAppCR;
    expect(savedCR.spec.addresses).toEqual([{ address: 'new.address' }]);
  });

  it('resets state when cancel is clicked', () => {
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    fireEvent.click(screen.getByTestId('add-address-btn'));
    fireEvent.click(screen.getByTestId('modal-done-btn'));
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('addresses-cancel-btn'));
    expect(screen.queryByTestId('address-list-item-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('addresses-save-btn')).not.toBeInTheDocument();
  });

  it('shows an error alert when save fails', async () => {
    mockK8sUpdate.mockRejectedValue(new Error('Conflict'));
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    fireEvent.click(screen.getByTestId('add-address-btn'));
    fireEvent.click(screen.getByTestId('modal-done-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('addresses-save-btn'));
      await Promise.resolve();
    });

    expect(screen.getByTestId('addresses-save-error')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
  });

  it('disables save when the user lacks update permission', () => {
    mockAccessReview.mockReturnValue([false, false]);
    render(<AddressesSection brokerApp={emptyBrokerApp} />);
    fireEvent.click(screen.getByTestId('add-address-btn'));
    fireEvent.click(screen.getByTestId('modal-done-btn'));
    expect(screen.getByTestId('addresses-save-btn')).toBeDisabled();
  });
});
