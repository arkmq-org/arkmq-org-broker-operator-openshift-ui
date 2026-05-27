import * as React from 'react';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../../reducers/brokerapp/reducer';
import { GeneralDetailsSection } from './GeneralDetailsSection';

/**
 * Provides the form state and dispatch contexts required by GeneralDetailsSection.
 * Mirrors the context setup in CreateBrokerAppPage without the router/SDK dependencies.
 */
const Wrapper: React.FC<{ namespace?: string }> = ({ namespace = 'default' }) => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <GeneralDetailsSection namespace={namespace} />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

describe('GeneralDetailsSection', () => {
  it('pre-populates the name field with the default value', () => {
    render(<Wrapper />);
    expect(screen.getByTestId('brokerapp-name')).toHaveValue('my-messaging-app');
  });

  it('shows a validation error when the name is cleared', () => {
    render(<Wrapper />);
    fireEvent.change(screen.getByTestId('brokerapp-name'), { target: { value: '' } });
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('renders the namespace field as disabled', () => {
    render(<Wrapper namespace="my-project" />);
    expect(screen.getByDisplayValue('my-project')).toBeDisabled();
  });
});
