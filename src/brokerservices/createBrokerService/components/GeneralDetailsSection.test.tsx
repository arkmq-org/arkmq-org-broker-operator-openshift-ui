import { type FC, useReducer } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  brokerServiceReducer,
  BrokerServiceFormDispatchContext,
  BrokerServiceFormStateContext,
  createInitialBrokerServiceState,
  type BrokerServiceFormState,
} from '../../../reducers/brokerservice/reducer';
import { GeneralDetailsSection } from './GeneralDetailsSection';

const TEST_NAMESPACE = 'test-namespace';

interface GeneralDetailsSectionWrapperProps {
  namespace?: string;
  initialState?: BrokerServiceFormState;
}

const GeneralDetailsSectionWrapper: FC<GeneralDetailsSectionWrapperProps> = ({
  namespace = TEST_NAMESPACE,
  initialState,
}) => {
  const [state, dispatch] = useReducer(
    brokerServiceReducer,
    initialState ?? createInitialBrokerServiceState(namespace),
  );

  return (
    <BrokerServiceFormStateContext.Provider value={state}>
      <BrokerServiceFormDispatchContext.Provider value={dispatch}>
        <GeneralDetailsSection namespace={namespace} />
      </BrokerServiceFormDispatchContext.Provider>
    </BrokerServiceFormStateContext.Provider>
  );
};

const makeStateWithLabels = (): BrokerServiceFormState =>
  brokerServiceReducer(createInitialBrokerServiceState(TEST_NAMESPACE), {
    type: 'SET_MODEL',
    payload: {
      apiVersion: 'broker.arkmq.org/v1beta2',
      kind: 'BrokerService',
      metadata: {
        name: 'my-messaging-service',
        namespace: TEST_NAMESPACE,
        labels: { forWorkQueue: 'true', app: 'messaging' },
      },
      spec: { resources: { limits: { memory: '2Gi' } } },
    },
  });

describe('GeneralDetailsSection', () => {
  it('renders the general details section with name and namespace fields', () => {
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    expect(screen.getByText('General Details')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-name-input')).toHaveValue('my-messaging-service');
    expect(screen.getByTestId('broker-service-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('broker-service-namespace-input')).toBeInTheDocument();
    expect(screen.getByText('Unique name for the BrokerService resource.')).toBeInTheDocument();
    expect(
      screen.getByText('Use the project selector above to change the namespace.'),
    ).toBeInTheDocument();
  });

  it('displays the namespace as a disabled field', () => {
    render(<GeneralDetailsSectionWrapper namespace="my-project" />);

    const namespaceInput = screen.getByTestId('broker-service-namespace-input');
    expect(namespaceInput).toHaveValue('my-project');
    expect(namespaceInput).toBeDisabled();
  });

  it('updates the broker service name when the user types', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    const nameInput = screen.getByTestId('broker-service-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'my-broker');

    expect(nameInput).toHaveValue('my-broker');
  });

  it('displays a validation error when the name field is cleared', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    await user.clear(screen.getByTestId('broker-service-name-input'));

    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(
      screen.queryByText('Unique name for the BrokerService resource.'),
    ).not.toBeInTheDocument();
  });

  it('adds a label row when Add Label is clicked', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    expect(screen.queryByLabelText('Label key')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('add-label-button'));

    expect(screen.getByLabelText('Label key')).toBeInTheDocument();
    expect(screen.getByLabelText('Label value')).toBeInTheDocument();
    expect(screen.getByLabelText('Remove label')).toBeInTheDocument();
  });

  it('updates label key and value when the user types', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    await user.click(screen.getByTestId('add-label-button'));

    const keyInput = screen.getByLabelText('Label key');
    const valueInput = screen.getByLabelText('Label value');

    await user.type(keyInput, 'forWorkQueue');
    await user.type(valueInput, 'true');

    expect(keyInput).toHaveValue('forWorkQueue');
    expect(valueInput).toHaveValue('true');
  });

  it('removes a label row when the remove button is clicked', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    await user.click(screen.getByTestId('add-label-button'));
    expect(screen.getByLabelText('Label key')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Remove label'));

    expect(screen.queryByLabelText('Label key')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Label value')).not.toBeInTheDocument();
  });

  it('renders existing labels from the initial form state', () => {
    render(<GeneralDetailsSectionWrapper initialState={makeStateWithLabels()} />);

    const labelRows = screen.getAllByLabelText('Label key');
    expect(labelRows).toHaveLength(2);
    expect(labelRows[0]).toHaveValue('forWorkQueue');
    expect(labelRows[1]).toHaveValue('app');

    const valueInputs = screen.getAllByLabelText('Label value');
    expect(valueInputs[0]).toHaveValue('true');
    expect(valueInputs[1]).toHaveValue('messaging');
  });

  it('allows adding multiple labels', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    await user.click(screen.getByTestId('add-label-button'));
    await user.click(screen.getByTestId('add-label-button'));

    expect(screen.getAllByLabelText('Label key')).toHaveLength(2);
    expect(screen.getAllByLabelText('Label value')).toHaveLength(2);
  });

  it('shows a validation error when duplicate label keys are entered', async () => {
    const user = userEvent.setup();
    render(<GeneralDetailsSectionWrapper namespace={TEST_NAMESPACE} />);

    await user.click(screen.getByTestId('add-label-button'));
    await user.click(screen.getByTestId('add-label-button'));

    const keyInputs = screen.getAllByLabelText('Label key');
    await user.type(keyInputs[0], 'key1');
    await user.type(keyInputs[1], 'key1');

    expect(screen.getByText('Duplicate label key "key1"')).toBeInTheDocument();
  });
});
