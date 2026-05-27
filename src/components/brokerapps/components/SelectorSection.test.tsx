import * as React from 'react';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
});

afterEach(() => {
  jest.restoreAllMocks();
});

const SelectorSectionWrapper: React.FC = () => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <SelectorSection />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

describe('SelectorSection', () => {
  it('removing a selector label row removes it from matchLabels state', () => {
    render(<SelectorSectionWrapper />);

    const keyInputs = screen.getAllByRole('textbox', { name: 'Label key' });
    const valueInputs = screen.getAllByRole('textbox', { name: 'Label value' });
    fireEvent.change(keyInputs[0], { target: { value: 'env' } });
    fireEvent.change(valueInputs[0], { target: { value: 'prod' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Match Label' }));

    const keyInputsAfterAdd = screen.getAllByRole('textbox', { name: 'Label key' });
    const valueInputsAfterAdd = screen.getAllByRole('textbox', { name: 'Label value' });
    fireEvent.change(keyInputsAfterAdd[1], { target: { value: 'tier' } });
    fireEvent.change(valueInputsAfterAdd[1], { target: { value: 'web' } });

    const removeButtons = screen.getAllByRole('button', { name: 'Remove label' });
    fireEvent.click(removeButtons[0]);

    const remainingKeyInputs = screen.getAllByRole('textbox', { name: 'Label key' });
    const remainingValueInputs = screen.getAllByRole('textbox', { name: 'Label value' });
    expect(remainingKeyInputs).toHaveLength(1);
    expect(remainingKeyInputs[0]).toHaveValue('tier');
    expect(remainingValueInputs[0]).toHaveValue('web');
  });

  it('Add Match Label button adds a new empty label row', () => {
    render(<SelectorSectionWrapper />);

    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Add Match Label' }));

    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(2);
  });

  it('Remove label button is disabled when only one label row remains', () => {
    render(<SelectorSectionWrapper />);

    const removeButton = screen.getByRole('button', { name: 'Remove label' });
    expect(removeButton).toBeDisabled();
  });

  it('clicking X on the only row when it has content clears the row instead of removing it', () => {
    render(<SelectorSectionWrapper />);

    const keyInput = screen.getByRole('textbox', { name: 'Label key' });
    fireEvent.change(keyInput, { target: { value: 'env' } });

    // With content the button becomes enabled; clicking it clears the row
    const removeButton = screen.getByRole('button', { name: 'Remove label' });
    expect(removeButton).not.toBeDisabled();
    fireEvent.click(removeButton);

    expect(screen.getByRole('textbox', { name: 'Label key' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Label value' })).toHaveValue('');
    // Still only one row — the row was cleared, not removed
    expect(screen.getAllByRole('textbox', { name: 'Label key' })).toHaveLength(1);
  });
});
