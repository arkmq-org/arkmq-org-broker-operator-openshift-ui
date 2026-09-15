import * as React from 'react';
import { useReducer } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
  type BrokerAppFormState,
} from '../reducers/brokerapp/reducer';
import { BrokerAppFormPage } from './BrokerAppFormPage';

let nowCounter = 0;

beforeEach(() => {
  nowCounter = 0;
  jest.spyOn(global.Date, 'now').mockImplementation(() => ++nowCounter);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** YAML editor cannot run in jsdom — mock renders children and form action buttons. */
jest.mock('../shared-components/ResourceFormEditor', () => ({
  ResourceFormEditor: ({
    children,
    createButtonTestId,
    cancelButtonTestId,
    onCancel,
    onFormSubmit,
    onYamlSave,
    submitLabel,
    isFormValid,
  }: {
    children: React.ReactNode;
    createButtonTestId?: string;
    cancelButtonTestId?: string;
    onCancel: () => void;
    onFormSubmit: () => Promise<void>;
    onYamlSave: (yaml: string) => Promise<void>;
    submitLabel?: string;
    isFormValid?: boolean;
  }) => (
    <>
      {children}
      <button
        data-test={createButtonTestId}
        onClick={() => void onFormSubmit()}
        disabled={!isFormValid}
      >
        {submitLabel ?? 'Create'}
      </button>
      <button data-test={cancelButtonTestId} onClick={onCancel}>
        Cancel
      </button>
      <button
        data-test="yaml-save-btn"
        onClick={() => void onYamlSave('apiVersion: broker.arkmq.org/v1beta2\nkind: BrokerApp')}
      >
        YAML Save
      </button>
    </>
  ),
}));

const makeStateWithEmptyName = (): BrokerAppFormState => {
  let state = createInitialBrokerAppState('test-ns');
  state = brokerAppReducer(state, { type: 'SET_NAME', payload: '' });
  return state;
};

const makeStateWithDuplicateLabels = (): BrokerAppFormState => {
  let state = createInitialBrokerAppState('test-ns');
  const id1 = state.matchLabels[0].id;
  state = brokerAppReducer(state, {
    type: 'UPDATE_MATCH_LABEL',
    payload: { id: id1, key: 'env', value: 'prod' },
  });
  state = brokerAppReducer(state, { type: 'ADD_MATCH_LABEL' });
  const id2 = state.matchLabels[1].id;
  state = brokerAppReducer(state, {
    type: 'UPDATE_MATCH_LABEL',
    payload: { id: id2, key: 'env', value: 'staging' },
  });
  return state;
};

const mockOnSubmit = jest.fn().mockResolvedValue(undefined);
const mockOnCancel = jest.fn();
const Wrapper: React.FC<{
  initialState?: BrokerAppFormState;
  props?: Partial<React.ComponentProps<typeof BrokerAppFormPage>>;
}> = ({ initialState, props }) => {
  const [state, dispatch] = useReducer(
    brokerAppReducer,
    initialState ?? createInitialBrokerAppState('test-ns'),
  );
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <BrokerAppFormPage
          title="Test Title"
          namespace="test-ns"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          submitButtonTestId="submit-btn"
          cancelButtonTestId="cancel-btn"
          {...props}
        />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

describe('BrokerAppFormPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  it('renders the page title', () => {
    render(<Wrapper props={{ titleTestId: 'page-title' }} />);
    expect(screen.getByTestId('page-title')).toHaveTextContent('Test Title');
  });

  it('renders all form sections', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('brokerapp-name')).toBeInTheDocument();
    expect(screen.getByText('Service Selector')).toBeInTheDocument();
    expect(screen.getByText('Messaging Capabilities')).toBeInTheDocument();
  });

  it('disables the name field in edit mode', () => {
    render(<Wrapper props={{ isEditMode: true }} />);
    expect(screen.getByTestId('brokerapp-name')).toBeDisabled();
  });

  it('uses custom submit label when provided', () => {
    render(<Wrapper props={{ submitLabel: 'Save' }} />);
    expect(screen.getByTestId('submit-btn')).toHaveTextContent('Save');
  });

  describe('form validity', () => {
    it('enables submit when name and labels are valid in create mode', () => {
      render(<Wrapper />);
      expect(screen.getByTestId('submit-btn')).not.toBeDisabled();
    });

    it('disables submit when name is empty in create mode', () => {
      render(<Wrapper initialState={makeStateWithEmptyName()} />);
      expect(screen.getByTestId('submit-btn')).toBeDisabled();
    });

    it('enables submit in edit mode regardless of name', () => {
      render(<Wrapper props={{ isEditMode: true }} />);
      expect(screen.getByTestId('submit-btn')).not.toBeDisabled();
    });

    it('disables submit in edit mode when labels have duplicates', () => {
      render(
        <Wrapper initialState={makeStateWithDuplicateLabels()} props={{ isEditMode: true }} />,
      );
      expect(screen.getByTestId('submit-btn')).toBeDisabled();
    });
  });

  describe('YAML submit validation', () => {
    it('calls onSubmit with parsed CR on valid YAML', async () => {
      const user = userEvent.setup();
      render(<Wrapper />);

      await user.click(screen.getByTestId('yaml-save-btn'));

      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });
});
