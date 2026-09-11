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
const Wrapper: React.FC<{ namespace?: string; isEditMode?: boolean }> = ({
  namespace = 'default',
  isEditMode,
}) => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <GeneralDetailsSection namespace={namespace} isEditMode={isEditMode} />
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

  it('disables the name field when isEditMode is true', () => {
    render(<Wrapper isEditMode />);
    expect(screen.getByTestId('brokerapp-name')).toBeDisabled();
  });

  it('shows read-only helper text for name in edit mode', () => {
    render(<Wrapper isEditMode />);
    expect(screen.getByText('Resource name cannot be changed after creation.')).toBeInTheDocument();
  });

  it('shows read-only helper text for namespace in edit mode', () => {
    render(<Wrapper isEditMode />);
    expect(
      screen.getByText('Resource namespace cannot be changed after creation.'),
    ).toBeInTheDocument();
  });
});
