import { render, screen } from '@testing-library/react';
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerAppCR, BrokerService } from '../../../../../k8s/types';
import { K8sResourceConditionStatus } from '../../../../../k8s/types';
import { DataflowSection } from './DataflowSection';

const mockUseK8sWatchResources = useK8sWatchResources as jest.Mock;

const service = (...refs: { name: string; namespace: string }[]): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'core-prd', namespace: 'platform' },
  status: { provisionedApps: refs.map((ref) => `${ref.namespace}/${ref.name}@1`) },
});

const app = (
  namespace: string,
  name: string,
  spec: Partial<BrokerAppCR['spec']>,
  deployedMessage?: string,
): BrokerAppCR => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name, namespace },
  spec: { serviceSelector: {}, ...spec },
  status: {
    conditions: [
      deployedMessage
        ? {
            type: 'Deployed',
            status: K8sResourceConditionStatus.False,
            reason: 'ValidationFailed',
            message: deployedMessage,
          }
        : { type: 'Deployed', status: K8sResourceConditionStatus.True },
    ],
  },
});

const capture = app('acme-enroll', 'capture', {
  addresses: [
    {
      address: 'ENROLL.IN',
      consumerOfAppSelector:
        "app.metadata.namespace == 'acme-enroll' && app.metadata.name == 'scorer'",
    },
  ],
  capabilities: [{ producerOf: [{ address: 'ENROLL.IN' }] }],
});
const scorer = app('acme-enroll', 'scorer', {
  addresses: [
    { address: 'IDENT.REQUEST', consumerOfAppSelector: "app.metadata.namespace == 'acme-ident'" },
  ],
  capabilities: [
    {
      consumerOf: [{ address: 'ENROLL.IN', appNamespace: 'acme-enroll', appName: 'capture' }],
      producerOf: [{ address: 'IDENT.REQUEST' }],
    },
  ],
});
const matcher = app('acme-ident', 'matcher', {
  capabilities: [
    { consumerOf: [{ address: 'IDENT.REQUEST', appNamespace: 'acme-enroll', appName: 'scorer' }] },
  ],
});
const intruder = app(
  'acme-ident',
  'intruder',
  {
    capabilities: [
      { consumerOf: [{ address: 'ENROLL.IN', appNamespace: 'acme-enroll', appName: 'capture' }] },
    ],
  },
  "referenced app acme-enroll/capture does not share address 'ENROLL.IN' for role 'consumer'",
);

const watched = (apps: BrokerAppCR[], loaded = true) =>
  Object.fromEntries(
    apps.map((a) => [
      `${a.metadata?.namespace ?? ''}/${a.metadata?.name ?? ''}`,
      { data: a, loaded },
    ]),
  );

const refsOf = (apps: BrokerAppCR[]) =>
  apps.map((a) => ({ namespace: a.metadata?.namespace ?? '', name: a.metadata?.name ?? '' }));

const edge = (id: string) => screen.getByTestId(`dataflow-edge-${id}`);

describe('DataflowSection', () => {
  afterEach(() => {
    mockUseK8sWatchResources.mockReset();
    mockUseK8sWatchResources.mockReturnValue({});
  });

  it('shows a spinner until the bound apps have loaded', () => {
    mockUseK8sWatchResources.mockReturnValue(watched([capture], false));
    render(<DataflowSection brokerService={service(...refsOf([capture]))} />);
    expect(screen.getByLabelText('Loading BrokerApps')).toBeInTheDocument();
  });

  it('shows an empty state when no bound app declares an address', () => {
    render(<DataflowSection brokerService={service()} />);
    expect(screen.getByTestId('dataflow-empty')).toBeInTheDocument();
  });

  it('draws the tutorial chain across namespaces with every gate realised', () => {
    const apps = [capture, scorer, matcher];
    mockUseK8sWatchResources.mockReturnValue(watched(apps));
    render(<DataflowSection brokerService={service(...refsOf(apps))} />);
    expect(screen.getByTestId('dataflow-node-addr:ENROLL.IN')).toBeInTheDocument();
    expect(screen.getByTestId('dataflow-node-addr:IDENT.REQUEST')).toBeInTheDocument();
    expect(screen.getByTestId('dataflow-node-app:acme-enroll/scorer')).toHaveAttribute(
      'data-kind',
      'app',
    );
    expect(edge('produce:cred:acme-enroll/capture->addr:ENROLL.IN')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(edge('consume:addr:ENROLL.IN->cred:acme-enroll/scorer')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(edge('produce:cred:acme-enroll/scorer->addr:IDENT.REQUEST')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(edge('consume:addr:IDENT.REQUEST->cred:acme-ident/matcher')).toHaveAttribute(
      'data-kind',
      'declared',
    );
    expect(screen.queryByTestId('dataflow-issues')).not.toBeInTheDocument();
  });

  it('draws an admitted namespace that declares nothing as an open door', () => {
    const apps = [capture, scorer];
    mockUseK8sWatchResources.mockReturnValue(watched(apps));
    render(<DataflowSection brokerService={service(...refsOf(apps))} />);
    // matcher is not bound here, so acme-ident holds no box and the door is the namespace itself
    expect(edge('consume:addr:IDENT.REQUEST->ns:acme-ident')).toHaveAttribute(
      'data-kind',
      'unused',
    );
  });

  it('draws a refused flow as broken and lists the operator message', () => {
    const apps = [capture, scorer, matcher, intruder];
    mockUseK8sWatchResources.mockReturnValue(watched(apps));
    render(<DataflowSection brokerService={service(...refsOf(apps))} />);
    expect(edge('consume:addr:ENROLL.IN->cred:acme-ident/intruder')).toHaveAttribute(
      'data-kind',
      'broken',
    );
    expect(screen.getByTestId('dataflow-issue-refused')).toBeInTheDocument();
    expect(screen.getByTestId('dataflow-issue-notDeployed')).toHaveTextContent(
      'does not share address',
    );
  });

  it('warns when a bound app cannot be read', () => {
    mockUseK8sWatchResources.mockReturnValue({
      ...watched([capture]),
      'acme-ident/matcher': { data: undefined, loaded: false, loadError: new Error('forbidden') },
    });
    render(<DataflowSection brokerService={service(...refsOf([capture, matcher]))} />);
    expect(screen.getByTestId('dataflow-apps-warning')).toBeInTheDocument();
    expect(screen.getByTestId('dataflow-node-addr:ENROLL.IN')).toBeInTheDocument();
  });
});
