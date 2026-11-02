import { type FC, useReducer } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerService } from '../../../k8s/types';
import {
  brokerAppReducer,
  BrokerAppFormDispatchContext,
  BrokerAppFormStateContext,
  createInitialBrokerAppState,
  type BrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import { CopyLabelsFromServiceModal } from './CopyLabelsFromServiceModal';

const mockUseK8sWatchResource = useK8sWatchResource as jest.Mock;

const TEST_NAMESPACE = 'test-namespace';

const makeService = (name: string, labels?: Record<string, string>): BrokerService => ({
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name, namespace: TEST_NAMESPACE, labels },
  spec: { resources: { limits: { memory: '2Gi' } } },
});

/**
 * Builds form state with the given match labels already applied via the reducer,
 * so CR sync matches real form use when asserting post-confirm results.
 */
const stateWithMatchLabels = (labels: { key: string; value: string }[]): BrokerAppFormState => {
  let state = createInitialBrokerAppState(TEST_NAMESPACE);
  labels.forEach((label, index) => {
    if (index === 0) {
      state = brokerAppReducer(state, {
        type: 'UPDATE_MATCH_LABEL',
        payload: { id: state.matchLabels[0].id, key: label.key, value: label.value },
      });
    } else {
      state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
      state = brokerAppReducer(state, {
        type: 'UPDATE_MATCH_LABEL',
        payload: {
          id: state.matchLabels[state.matchLabels.length - 1].id,
          key: label.key,
          value: label.value,
        },
      });
    }
  });
  return state;
};

/**
 * Provides BrokerApp form context around the modal and surfaces match-label rows
 * so tests can assert which labels were merged after confirm.
 */
const CopyLabelsFromServiceModalWrapper: FC<{
  onClose?: () => void;
  initialState?: BrokerAppFormState;
}> = ({ onClose = jest.fn(), initialState }) => {
  const [state, dispatch] = useReducer(
    brokerAppReducer,
    initialState ?? createInitialBrokerAppState(TEST_NAMESPACE),
  );

  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <div data-test="label-count">{state.matchLabels.length}</div>
        {state.matchLabels.map((label) => (
          <div key={label.id} data-test={`copied-label-${label.key || 'empty'}`}>
            {label.key}={label.value}
          </div>
        ))}
        <CopyLabelsFromServiceModal namespace={TEST_NAMESPACE} onClose={onClose} />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseK8sWatchResource.mockReturnValue([[], true, undefined]);
});

describe('BrokerApp CopyLabelsFromServiceModal', () => {
  it('shows an empty state when no BrokerServices exist', () => {
    render(<CopyLabelsFromServiceModalWrapper />);

    expect(screen.getByText('No BrokerServices found')).toBeInTheDocument();
  });

  it('shows checkboxes after selecting a service and copies only checked labels', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    mockUseK8sWatchResource.mockReturnValue([
      [
        makeService('my-messaging-service', {
          tier: 'production',
          forWorkQueue: 'true',
          env: 'prod',
        }),
      ],
      true,
      undefined,
    ]);

    render(<CopyLabelsFromServiceModalWrapper onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'my-messaging-service' }));

    expect(screen.getByTestId('copy-labels-checkbox-step')).toBeInTheDocument();
    expect(screen.getByTestId('copy-label-checkbox-tier')).toBeChecked();
    expect(screen.getByTestId('copy-label-checkbox-forWorkQueue')).toBeChecked();
    expect(screen.getByTestId('copy-label-checkbox-env')).toBeChecked();

    await user.click(screen.getByTestId('copy-label-checkbox-forWorkQueue'));
    await user.click(screen.getByTestId('copy-labels-modal-confirm'));

    expect(screen.getByTestId('label-count')).toHaveTextContent('2');
    expect(screen.getByTestId('copied-label-tier')).toHaveTextContent('tier=production');
    expect(screen.getByTestId('copied-label-env')).toHaveTextContent('env=prod');
    expect(screen.queryByTestId('copied-label-forWorkQueue')).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('skips keys that already exist in the service selector when confirming', async () => {
    const user = userEvent.setup();
    mockUseK8sWatchResource.mockReturnValue([
      [makeService('my-messaging-service', { tier: 'production', env: 'prod' })],
      true,
      undefined,
    ]);

    render(
      <CopyLabelsFromServiceModalWrapper
        initialState={stateWithMatchLabels([{ key: 'tier', value: 'staging' }])}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'my-messaging-service' }));
    await user.click(screen.getByTestId('copy-labels-modal-confirm'));

    expect(screen.getByTestId('copied-label-tier')).toHaveTextContent('tier=staging');
    expect(screen.getByTestId('copied-label-env')).toHaveTextContent('env=prod');
  });

  it('disables confirm until a service is selected with at least one label checked', async () => {
    const user = userEvent.setup();
    mockUseK8sWatchResource.mockReturnValue([
      [makeService('my-messaging-service', { tier: 'production' })],
      true,
      undefined,
    ]);

    render(<CopyLabelsFromServiceModalWrapper />);

    expect(screen.getByTestId('copy-labels-modal-confirm')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'my-messaging-service' }));
    expect(screen.getByTestId('copy-labels-modal-confirm')).toBeEnabled();

    await user.click(screen.getByTestId('copy-label-checkbox-tier'));
    expect(screen.getByTestId('copy-labels-modal-confirm')).toBeDisabled();
  });

  it('closes without copying when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    mockUseK8sWatchResource.mockReturnValue([
      [makeService('my-messaging-service', { tier: 'production' })],
      true,
      undefined,
    ]);

    render(<CopyLabelsFromServiceModalWrapper onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'my-messaging-service' }));
    await user.click(screen.getByTestId('copy-labels-modal-cancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('label-count')).toHaveTextContent('1');
    expect(screen.getByTestId('copied-label-empty')).toHaveTextContent('=');
  });
});
