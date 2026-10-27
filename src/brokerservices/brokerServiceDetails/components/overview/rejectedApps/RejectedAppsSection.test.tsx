import { render, screen } from '@testing-library/react';
import type { BrokerService } from '../../../../../k8s/types';
import { RejectedAppsSection } from './RejectedAppsSection';

/**
 * Minimal BrokerService fixture for RejectedAppsSection tests.
 *
 * @param status - Optional status; omit or leave rejectedApps empty to assert hiding
 */
const makeService = (status?: BrokerService['status']): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-messaging-service', namespace: 'default' },
  status,
});

describe('RejectedAppsSection', () => {
  it('renders nothing when rejectedApps is absent', () => {
    const { container } = render(<RejectedAppsSection brokerService={makeService()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('broker-service-rejected-apps')).not.toBeInTheDocument();
  });

  it('renders nothing when rejectedApps is empty', () => {
    const { container } = render(
      <RejectedAppsSection brokerService={makeService({ rejectedApps: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('broker-service-rejected-apps')).not.toBeInTheDocument();
  });

  it('renders name, namespace, and reason for each rejected app', () => {
    render(
      <RejectedAppsSection
        brokerService={makeService({
          rejectedApps: [
            {
              name: 'app-b',
              namespace: 'tenant-a',
              reason: 'does not match service labels',
            },
            {
              name: 'app-c',
              namespace: 'default',
              reason: 'does not match appSelectorExpression',
            },
          ],
        })}
      />,
    );

    expect(screen.getByTestId('broker-service-rejected-apps')).toBeInTheDocument();
    expect(screen.getByText('Rejected Apps')).toBeInTheDocument();

    expect(screen.getByTestId('rejected-app-link-tenant-a-app-b')).toHaveTextContent('app-b');
    expect(screen.getByTestId('rejected-app-namespace-tenant-a-app-b')).toHaveTextContent(
      'tenant-a',
    );
    expect(screen.getByTestId('rejected-app-reason-tenant-a-app-b')).toHaveTextContent(
      'does not match service labels',
    );

    expect(screen.getByTestId('rejected-app-link-default-app-c')).toHaveTextContent('app-c');
    expect(screen.getByTestId('rejected-app-namespace-default-app-c')).toHaveTextContent('default');
    expect(screen.getByTestId('rejected-app-reason-default-app-c')).toHaveTextContent(
      'does not match appSelectorExpression',
    );
  });
});
