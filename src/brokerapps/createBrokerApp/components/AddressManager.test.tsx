import * as React from 'react';
import { useReducer } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../../reducers/brokerapp/reducer';
import { AddressManager } from './AddressManager';

const Wrapper: React.FC = () => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <AddressManager />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

const addEntry = () => {
  fireEvent.click(screen.getByTestId('add-address-btn'));
};

const addEntryWithPubSub = () => {
  addEntry();
  fireEvent.click(screen.getByTestId('address-pubsub-0'));
};

const addSub = (name: string) => {
  fireEvent.click(screen.getByText('Add subscription'));
  const input = screen.getByPlaceholderText('e.g., my-subscription');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('AddressManager — add and remove entries', () => {
  beforeEach(() => render(<Wrapper />));

  it('renders no address inputs before any entry is added', () => {
    expect(screen.queryByTestId('address-name-input-0')).not.toBeInTheDocument();
  });

  it('renders an address input after clicking Add address', () => {
    addEntry();
    expect(screen.getByTestId('address-name-input-0')).toBeInTheDocument();
  });

  it('renders two entries after adding twice', () => {
    addEntry();
    addEntry();
    expect(screen.getByTestId('address-name-input-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-1')).toBeInTheDocument();
  });

  it('removes the entry after clicking the remove button', () => {
    addEntry();
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.queryByTestId('address-name-input-0')).not.toBeInTheDocument();
  });

  it('reflects a typed value in the address input', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    expect(screen.getByTestId('address-name-input-0')).toHaveValue('orders.private');
  });

  it('preserves the second entry value at index 0 after removing the first entry', () => {
    addEntry();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'first.address' },
    });
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'second.address' },
    });
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.getByTestId('address-name-input-0')).toHaveValue('second.address');
  });

  it('does not carry validation error from a removed entry to the surviving entry', () => {
    addEntry();
    addEntry();
    fireEvent.blur(screen.getByTestId('address-name-input-0'));
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'valid.address' },
    });
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });
});

describe('AddressManager — pubSub toggle', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
  });

  it('renders the pubSub switch', () => {
    expect(screen.getByTestId('address-pubsub-0')).toBeInTheDocument();
  });

  it('does not render the Subscriptions label before pubSub is enabled', () => {
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });

  it('renders the Subscriptions label after enabling pubSub', () => {
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(
      screen.getByText('Durable subscription queue names for this address.'),
    ).toBeInTheDocument();
  });

  it('hides the Subscriptions label after disabling pubSub', () => {
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });
});

describe('AddressManager — external ownership hides pubSub', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
  });

  it('hides the pubSub switch when ownership is changed to external', () => {
    fireEvent.click(screen.getByTestId('address-ownership-0'));
    fireEvent.click(screen.getByText('External'));
    expect(screen.queryByTestId('address-pubsub-0')).not.toBeInTheDocument();
  });
});

describe('SubscriptionListInput — add subscriptions', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntryWithPubSub();
  });

  it('clicking "Add subscription" shows a text input', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    expect(screen.getByPlaceholderText('e.g., my-subscription')).toBeInTheDocument();
  });

  it('pressing Enter confirms the subscription and renders a chip', () => {
    addSub('sub-a');
    expect(screen.getByText('sub-a')).toBeInTheDocument();
  });

  it('blurring the input confirms the subscription', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    const input = screen.getByPlaceholderText('e.g., my-subscription');
    fireEvent.change(input, { target: { value: 'sub-blur' } });
    fireEvent.blur(input);
    expect(screen.getByText('sub-blur')).toBeInTheDocument();
  });

  it('pressing Escape cancels without adding a subscription', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    const input = screen.getByPlaceholderText('e.g., my-subscription');
    fireEvent.change(input, { target: { value: 'should-not-appear' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('should-not-appear')).not.toBeInTheDocument();
  });

  it('does not add a subscription with an empty or whitespace-only value', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    const input = screen.getByPlaceholderText('e.g., my-subscription');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('group')?.querySelectorAll('.pf-v6-c-label__close')).toHaveLength(0);
  });

  it('rejects a duplicate subscription name', () => {
    addSub('sub-a');
    addSub('sub-a');
    expect(screen.getAllByText('sub-a')).toHaveLength(1);
  });
});

describe('SubscriptionListInput — remove subscriptions', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntryWithPubSub();
  });

  it('clicking the close button removes the subscription chip', () => {
    addSub('sub-remove');
    fireEvent.click(screen.getByLabelText('Remove sub-remove'));
    expect(screen.queryByText('sub-remove')).not.toBeInTheDocument();
  });

  it('removing one chip does not affect other chips', () => {
    addSub('keep-me');
    addSub('remove-me');
    fireEvent.click(screen.getByLabelText('Remove remove-me'));
    expect(screen.getByText('keep-me')).toBeInTheDocument();
    expect(screen.queryByText('remove-me')).not.toBeInTheDocument();
  });
});

describe('AddressManager — duplicate address validation', () => {
  beforeEach(() => render(<Wrapper />));

  it('shows a duplicate error on the second entry after blurring with the same address', () => {
    addEntry();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    fireEvent.blur(screen.getByTestId('address-name-input-1'));
    expect(screen.getByText('Duplicate address')).toBeInTheDocument();
  });

  it('does not show a duplicate error before the field is blurred', () => {
    addEntry();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    expect(screen.queryByText('Duplicate address')).not.toBeInTheDocument();
  });

  it('clears the duplicate error when the value is changed to be unique', () => {
    addEntry();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    fireEvent.blur(screen.getByTestId('address-name-input-1'));
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'events.topic' },
    });
    expect(screen.queryByText('Duplicate address')).not.toBeInTheDocument();
  });
});

describe('AddressManager — address required validation', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
  });

  it('does not show a required error before the field is blurred', () => {
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error after blurring a blank entry', () => {
    fireEvent.blur(screen.getByTestId('address-name-input-0'));
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });

  it('clears the error once a value is typed', () => {
    fireEvent.blur(screen.getByTestId('address-name-input-0'));
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error again if the value is cleared after being set', () => {
    fireEvent.blur(screen.getByTestId('address-name-input-0'));
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: '' },
    });
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });
});
