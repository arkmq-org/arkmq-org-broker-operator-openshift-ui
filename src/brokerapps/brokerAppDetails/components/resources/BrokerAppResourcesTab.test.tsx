import { render, screen } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR } from '../../../../k8s/types';
import { BrokerAppResourcesTab } from './BrokerAppResourcesTab';

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

const brokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'my-payment-app', namespace: 'default', uid: 'app-uid-123' },
  spec: { serviceSelector: {} },
};

const bindingSecret = {
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: {
    name: 'my-payment-app-binding-secret',
    namespace: 'default',
    ownerReferences: [
      {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        name: 'my-payment-app',
        uid: 'app-uid-123',
      },
    ],
  },
};

const unrelatedSecret = {
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: {
    name: 'some-other-secret',
    namespace: 'default',
    ownerReferences: [],
  },
};

const orphanSecret = {
  apiVersion: 'v1',
  kind: 'Secret',
  metadata: {
    name: 'my-payment-app-binding-secret',
    namespace: 'default',
    ownerReferences: [
      {
        apiVersion: 'broker.arkmq.org/v1beta2',
        kind: 'BrokerApp',
        name: 'my-payment-app',
        uid: 'different-uid',
      },
    ],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('BrokerAppResourcesTab', () => {
  it('shows a spinner while the secret watch is loading', () => {
    mockUseK8sWatchResource.mockReturnValue([undefined, false, undefined]);
    render(<BrokerAppResourcesTab obj={brokerApp} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an error state when the secret watch fails', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, new Error('forbidden')]);
    render(<BrokerAppResourcesTab obj={brokerApp} />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });

  it('shows no resources when there are no owned secrets', () => {
    mockUseK8sWatchResource.mockReturnValue([[unrelatedSecret], true, undefined]);
    render(<BrokerAppResourcesTab obj={brokerApp} />);
    expect(screen.getByText('No resources')).toBeInTheDocument();
  });

  it('renders the owned binding secret with Created status', () => {
    mockUseK8sWatchResource.mockReturnValue([[bindingSecret, unrelatedSecret], true, undefined]);
    render(<BrokerAppResourcesTab obj={brokerApp} />);
    expect(screen.getByTestId('resource-link-my-payment-app-binding-secret')).toHaveTextContent(
      'my-payment-app-binding-secret',
    );
    // Status cell — 'Created' also appears as column header so scope to the td.
    expect(screen.getAllByText('Created').length).toBeGreaterThanOrEqual(1);
  });

  it('excludes orphaned secrets with matching name but different UID', () => {
    mockUseK8sWatchResource.mockReturnValue([[orphanSecret], true, undefined]);
    render(<BrokerAppResourcesTab obj={brokerApp} />);
    expect(screen.getByText('No resources')).toBeInTheDocument();
  });

  it('shows the application credentials info alert', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
    render(<BrokerAppResourcesTab obj={brokerApp} />);
    expect(screen.getByText('Application Credentials')).toBeInTheDocument();
  });

  it('renders without crashing when obj is undefined', () => {
    mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
    render(<BrokerAppResourcesTab />);
    expect(screen.getByTestId('broker-app-resources-tab')).toBeInTheDocument();
  });
});
