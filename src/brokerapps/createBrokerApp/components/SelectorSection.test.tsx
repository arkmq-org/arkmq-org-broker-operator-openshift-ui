import * as React from 'react';
import { useReducer } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../../reducers/brokerapp/reducer';
import { SelectorSection } from './SelectorSection';

let nowCounter = 0;

beforeEach(() => {
  nowCounter = 0;
  jest.spyOn(global.Date, 'now').mockImplementation(() => ++nowCounter);
  (useK8sWatchResource as jest.Mock).mockReturnValue([
    [
      { metadata: { labels: { env: 'production' }, name: 'svc-1', namespace: 'default' } },
      {
        metadata: {
          labels: { env: 'staging', tier: 'messaging' },
          name: 'svc-2',
          namespace: 'default',
        },
      },
    ],
    true,
    undefined,
  ]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

const SelectorSectionWrapper: React.FC = () => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <SelectorSection namespace="default" />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

describe('SelectorSection', () => {
  it('renders separate key and value inputs', () => {
    render(<SelectorSectionWrapper />);
    expect(screen.getByRole('textbox', { name: 'Label key' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Label value' })).toBeInTheDocument();
  });

  it('shows BrokerService label keys as options in the key dropdown', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);
    await user.click(screen.getByRole('textbox', { name: 'Label key' }));
    expect(screen.getByRole('option', { name: 'env' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'tier' })).toBeInTheDocument();
  });

  it('shows values for the selected key in the value dropdown', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);

    // Select 'env' key from the key dropdown
    await user.click(screen.getByRole('textbox', { name: 'Label key' }));
    await user.click(screen.getByRole('option', { name: 'env' }));

    // Open the value dropdown and verify values for 'env' are shown
    await user.click(screen.getByRole('textbox', { name: 'Label value' }));
    expect(screen.getByRole('option', { name: 'production' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'staging' })).toBeInTheDocument();
  });

  it('filters key options as the user types', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);
    const keyInput = screen.getByRole('textbox', { name: 'Label key' });
    await user.click(keyInput);
    await user.type(keyInput, 'tier');
    expect(screen.getByRole('option', { name: 'tier' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'env' })).not.toBeInTheDocument();
  });

  it('filters value options as the user types', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);

    // Select key first so values are available
    await user.click(screen.getByRole('textbox', { name: 'Label key' }));
    await user.click(screen.getByRole('option', { name: 'env' }));

    // Type in the value input to filter
    const valueInput = screen.getByRole('textbox', { name: 'Label value' });
    await user.click(valueInput);
    await user.type(valueInput, 'prod');
    expect(screen.getByRole('option', { name: 'production' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'staging' })).not.toBeInTheDocument();
  });

  it('shows "No matching keys found" when key filter matches nothing', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);
    const keyInput = screen.getByRole('textbox', { name: 'Label key' });
    await user.click(keyInput);
    await user.type(keyInput, 'zzz-nonexistent');
    expect(screen.getByText('No matching keys found')).toBeInTheDocument();
  });

  it('shows a loading message when BrokerServices have not loaded yet', async () => {
    const user = userEvent.setup();
    (useK8sWatchResource as jest.Mock).mockReturnValue([[], false, undefined]);
    render(<SelectorSectionWrapper />);
    await user.click(screen.getByRole('textbox', { name: 'Label key' }));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows an error message in the key dropdown when the watch fails', async () => {
    const user = userEvent.setup();
    (useK8sWatchResource as jest.Mock).mockReturnValue([[], true, new Error('Forbidden')]);
    render(<SelectorSectionWrapper />);
    await user.click(screen.getByRole('textbox', { name: 'Label key' }));
    expect(screen.getByText('Error loading services')).toBeInTheDocument();
  });

  it('shows an error message in the value dropdown when the watch fails', async () => {
    const user = userEvent.setup();
    (useK8sWatchResource as jest.Mock).mockReturnValue([[], true, new Error('Forbidden')]);
    render(<SelectorSectionWrapper />);
    await user.click(screen.getByRole('textbox', { name: 'Label value' }));
    expect(screen.getByText('Error loading services')).toBeInTheDocument();
  });

  it('selecting a key option clears the value field', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);

    // Select 'env' — this sets key='env' and resets value=''
    await user.click(screen.getByRole('textbox', { name: 'Label key' }));
    await user.click(screen.getByRole('option', { name: 'env' }));

    expect(screen.getByRole('textbox', { name: 'Label key' })).toHaveValue('env');
    expect(screen.getByRole('textbox', { name: 'Label value' })).toHaveValue('');
  });

  it('Add Match Label button adds a new label row', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);
    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Add Match Label' }));
    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(2);
    expect(screen.getAllByRole('textbox', { name: 'Label value' })).toHaveLength(2);
  });

  it('Remove label button is disabled when only one empty row remains', () => {
    render(<SelectorSectionWrapper />);
    expect(screen.getByRole('button', { name: 'Remove label' })).toBeDisabled();
  });

  it('clears the only row instead of removing it when X is clicked with content', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);
    const keyInput = screen.getByRole('textbox', { name: 'Label key' });
    await user.type(keyInput, 'env');

    const removeButton = screen.getByRole('button', { name: 'Remove label' });
    expect(removeButton).not.toBeDisabled();
    await user.click(removeButton);

    expect(screen.getByRole('textbox', { name: 'Label key' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Label value' })).toHaveValue('');
    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(1);
  });

  it('removes a row when X is clicked and multiple rows exist', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);
    await user.click(screen.getByRole('button', { name: 'Add Match Label' }));

    // Fill in the first row so its X button is enabled
    const keyInputs = screen.getAllByRole('textbox', { name: 'Label key' });
    await user.type(keyInputs[0], 'env');

    const removeButtons = screen.getAllByRole('button', { name: 'Remove label' });
    await user.click(removeButtons[0]);

    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(1);
  });

  it('excludes already-selected keys from the key dropdown of other rows', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);

    // Select 'env' in the first row via the dropdown
    await user.click(screen.getAllByRole('textbox', { name: 'Label key' })[0]);
    await user.click(screen.getByRole('option', { name: 'env' }));

    // Add a second row
    await user.click(screen.getByRole('button', { name: 'Add Match Label' }));

    // Open the key dropdown of the second row
    const keyInputs = screen.getAllByRole('textbox', { name: 'Label key' });
    await user.click(keyInputs[1]);

    // 'env' is already used in row 1, so it must not appear in row 2's dropdown
    expect(screen.queryByRole('option', { name: 'env' })).not.toBeInTheDocument();
    // 'tier' is not yet used, so it must still appear
    expect(screen.getByRole('option', { name: 'tier' })).toBeInTheDocument();
  });

  it('shows a validation error when duplicate match label keys are typed', async () => {
    const user = userEvent.setup();
    render(<SelectorSectionWrapper />);

    await user.click(screen.getByRole('button', { name: 'Add Match Label' }));

    const keyInputs = screen.getAllByRole('textbox', { name: 'Label key' });
    await user.type(keyInputs[0], 'env');
    await user.type(keyInputs[1], 'env');

    expect(screen.getByText('Duplicate label key "env"')).toBeInTheDocument();
  });
});
