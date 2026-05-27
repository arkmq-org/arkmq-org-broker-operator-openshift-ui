import * as React from 'react';
import { useReducer } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
  type BrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import { CapabilitiesSection } from './CapabilitiesSection';

const makeStateWithAddresses = (): BrokerAppFormState => {
  let state = createInitialBrokerAppState('default');
  state = brokerAppReducer(state, {
    type: 'ADD_ADDRESS',
    field: 'producerOf',
    payload: 'QUEUE.OUT',
  });
  state = brokerAppReducer(state, {
    type: 'ADD_ADDRESS',
    field: 'consumerOf',
    payload: 'QUEUE.IN',
  });
  state = brokerAppReducer(state, {
    type: 'ADD_ADDRESS',
    field: 'subscriberOf',
    payload: 'TOPIC.EVENTS',
  });
  return state;
};

const CapabilitiesSectionWrapper: React.FC<{ initialState?: BrokerAppFormState }> = ({
  initialState,
}) => {
  const [state, dispatch] = useReducer(
    brokerAppReducer,
    initialState ?? createInitialBrokerAppState('default'),
  );
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <CapabilitiesSection />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

describe('CapabilitiesSection', () => {
  it('renders existing producerOf, consumerOf, and subscriberOf addresses from state', () => {
    render(<CapabilitiesSectionWrapper initialState={makeStateWithAddresses()} />);

    expect(screen.getByText('QUEUE.OUT')).toBeInTheDocument();
    expect(screen.getByText('QUEUE.IN')).toBeInTheDocument();
    expect(screen.getByText('TOPIC.EVENTS')).toBeInTheDocument();
  });

  it('adding an address to producerOf updates the label group', () => {
    render(<CapabilitiesSectionWrapper />);

    const producerList = screen.getByRole('list', { name: 'Produces To' });
    fireEvent.click(within(producerList).getByText('Add address'));

    const input = within(producerList).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'QUEUE.ORDERS' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(within(producerList).getByText('QUEUE.ORDERS')).toBeInTheDocument();
  });

  it('adding an address to consumerOf does not affect producerOf or subscriberOf', () => {
    render(<CapabilitiesSectionWrapper />);

    const consumerList = screen.getByRole('list', { name: 'Consumes From' });
    fireEvent.click(within(consumerList).getByText('Add address'));

    const input = within(consumerList).getByRole('textbox');
    fireEvent.change(input, { target: { value: 'QUEUE.PAYMENTS' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(within(consumerList).getByText('QUEUE.PAYMENTS')).toBeInTheDocument();

    const producerList = screen.getByRole('list', { name: 'Produces To' });
    const subscriberList = screen.getByRole('list', { name: 'Subscribes To' });
    expect(within(producerList).queryByText('QUEUE.PAYMENTS')).not.toBeInTheDocument();
    expect(within(subscriberList).queryByText('QUEUE.PAYMENTS')).not.toBeInTheDocument();
  });

  it('removing a subscriberOf address removes only that label', () => {
    render(<CapabilitiesSectionWrapper initialState={makeStateWithAddresses()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove TOPIC.EVENTS' }));

    expect(screen.queryByText('TOPIC.EVENTS')).not.toBeInTheDocument();
    // Other addresses are untouched
    expect(screen.getByText('QUEUE.OUT')).toBeInTheDocument();
    expect(screen.getByText('QUEUE.IN')).toBeInTheDocument();
  });
});
