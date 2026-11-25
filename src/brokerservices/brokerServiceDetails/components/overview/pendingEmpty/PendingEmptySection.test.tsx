import { render, screen } from '@testing-library/react';
import type { BrokerService } from '../../../../../k8s/types';
import { PendingEmptySection } from './PendingEmptySection';

const makeService = (status?: BrokerService['status']): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-messaging-service', namespace: 'default' },
  status,
});

describe('PendingEmptySection', () => {
  it('renders nothing when pendingEmpty is absent', () => {
    const { container } = render(<PendingEmptySection brokerService={makeService()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('broker-service-pending-empty')).not.toBeInTheDocument();
  });

  it('renders nothing when pendingEmpty is empty', () => {
    const { container } = render(
      <PendingEmptySection brokerService={makeService({ pendingEmpty: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('broker-service-pending-empty')).not.toBeInTheDocument();
  });

  it('renders a single app with queue message counts', () => {
    render(
      <PendingEmptySection
        brokerService={makeService({
          pendingEmpty: [
            {
              app: 'tenant-a/app-b',
              messages: {
                'orders::orders': '42',
                'events::events': '7',
              },
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('broker-service-pending-empty')).toBeInTheDocument();
    expect(screen.getByText('Addresses Pending Empty')).toBeInTheDocument();

    expect(
      screen.getByTestId('pending-empty-queue-tenant-a/app-b-orders::orders'),
    ).toHaveTextContent('orders::orders');
    expect(
      screen.getByTestId('pending-empty-count-tenant-a/app-b-orders::orders'),
    ).toHaveTextContent('42');
    expect(
      screen.getByTestId('pending-empty-count-tenant-a/app-b-events::events'),
    ).toHaveTextContent('7');
  });

  it('renders multiple apps draining simultaneously', () => {
    render(
      <PendingEmptySection
        brokerService={makeService({
          pendingEmpty: [
            {
              app: 'ns-a/app-one',
              messages: { 'addr1::q1': '10' },
            },
            {
              app: 'ns-b/app-two',
              messages: { 'addr2::q2': '3' },
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('pending-empty-row-ns-a/app-one-addr1::q1')).toBeInTheDocument();
    expect(screen.getByTestId('pending-empty-count-ns-a/app-one-addr1::q1')).toHaveTextContent(
      '10',
    );
    expect(screen.getByTestId('pending-empty-row-ns-b/app-two-addr2::q2')).toBeInTheDocument();
    expect(screen.getByTestId('pending-empty-count-ns-b/app-two-addr2::q2')).toHaveTextContent('3');
  });

  it('renders a spinner with Querying... for unknown message counts', () => {
    render(
      <PendingEmptySection
        brokerService={makeService({
          pendingEmpty: [
            {
              app: 'default/app-c',
              messages: { 'pricing::pricing': 'unknown' },
            },
          ],
        })}
      />,
    );

    const countCell = screen.getByTestId('pending-empty-count-default/app-c-pricing::pricing');
    expect(countCell).toHaveTextContent('Querying...');
    expect(countCell.querySelector('[role="progressbar"]')).toBeInTheDocument();
  });

  it('renders a placeholder row when messages map is absent', () => {
    render(
      <PendingEmptySection
        brokerService={makeService({
          pendingEmpty: [{ app: 'default/app-d' }],
        })}
      />,
    );

    expect(screen.getByTestId('pending-empty-row-default/app-d')).toBeInTheDocument();
  });

  it('falls back to plain text when app identity has no slash', () => {
    render(
      <PendingEmptySection
        brokerService={makeService({
          pendingEmpty: [
            {
              app: 'malformed-app',
              messages: { 'q::q': '1' },
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('pending-empty-app-text-malformed-app')).toHaveTextContent(
      'malformed-app',
    );
  });
});
