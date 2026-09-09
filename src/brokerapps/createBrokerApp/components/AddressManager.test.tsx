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

const PrivateWrapper: React.FC = () => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <AddressManager addressKind="private" />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

const SharedWrapper: React.FC = () => {
  const [state, dispatch] = useReducer(brokerAppReducer, createInitialBrokerAppState('default'));
  return (
    <BrokerAppFormStateContext.Provider value={state}>
      <BrokerAppFormDispatchContext.Provider value={dispatch}>
        <AddressManager addressKind="shared" />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

const addEntryWithPubSub = () => {
  fireEvent.click(screen.getByTestId('add-private-address-btn'));
  fireEvent.click(screen.getByTestId('private-address-pubsub-0'));
};

const addSub = (name: string) => {
  fireEvent.click(screen.getByText('Add subscription'));
  const input = screen.getByPlaceholderText('e.g., my-subscription');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('AddressManager (private) — add and remove entries', () => {
  beforeEach(() => render(<PrivateWrapper />));

  it('renders no address inputs before any entry is added', () => {
    expect(screen.queryByTestId('private-address-input-0')).not.toBeInTheDocument();
  });

  it('renders an address input after clicking Add private address', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    expect(screen.getByTestId('private-address-input-0')).toBeInTheDocument();
  });

  it('renders two entries after adding twice', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    expect(screen.getByTestId('private-address-input-0')).toBeInTheDocument();
    expect(screen.getByTestId('private-address-input-1')).toBeInTheDocument();
  });

  it('removes the entry after clicking the remove button', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('remove-private-address-0'));
    expect(screen.queryByTestId('private-address-input-0')).not.toBeInTheDocument();
  });

  it('reflects a typed value in the address input', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'orders.private' },
    });
    expect(screen.getByTestId('private-address-input-0')).toHaveValue('orders.private');
  });

  it('preserves the second entry value at index 0 after removing the first entry', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'first.address' },
    });
    fireEvent.change(screen.getByTestId('private-address-input-1'), {
      target: { value: 'second.address' },
    });
    fireEvent.click(screen.getByTestId('remove-private-address-0'));
    expect(screen.getByTestId('private-address-input-0')).toHaveValue('second.address');
  });

  it('does not carry validation error from a removed entry to the surviving entry', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.blur(screen.getByTestId('private-address-input-0'));
    fireEvent.change(screen.getByTestId('private-address-input-1'), {
      target: { value: 'valid.address' },
    });
    fireEvent.click(screen.getByTestId('remove-private-address-0'));
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });
});

describe('AddressManager (private) — pubSub toggle', () => {
  beforeEach(() => {
    render(<PrivateWrapper />);
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
  });

  it('renders the pubSub switch', () => {
    expect(screen.getByTestId('private-address-pubsub-0')).toBeInTheDocument();
  });

  it('does not render the Subscriptions label before pubSub is enabled', () => {
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });

  it('renders the Subscriptions label after enabling pubSub', () => {
    fireEvent.click(screen.getByTestId('private-address-pubsub-0'));
    expect(
      screen.getByText('Durable subscription queue names for this address.'),
    ).toBeInTheDocument();
  });

  it('hides the Subscriptions label after disabling pubSub', () => {
    fireEvent.click(screen.getByTestId('private-address-pubsub-0'));
    fireEvent.click(screen.getByTestId('private-address-pubsub-0'));
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });
});

describe('SubscriptionListInput — add subscriptions', () => {
  beforeEach(() => {
    render(<PrivateWrapper />);
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
    render(<PrivateWrapper />);
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

describe('AddressManager (private) — duplicate address validation', () => {
  beforeEach(() => render(<PrivateWrapper />));

  it('shows a duplicate error on the second entry after blurring with the same address', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('private-address-input-1'), {
      target: { value: 'orders.private' },
    });
    fireEvent.blur(screen.getByTestId('private-address-input-1'));
    expect(screen.getByText('Duplicate address')).toBeInTheDocument();
  });

  it('does not show a duplicate error before the field is blurred', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('private-address-input-1'), {
      target: { value: 'orders.private' },
    });
    expect(screen.queryByText('Duplicate address')).not.toBeInTheDocument();
  });

  it('clears the duplicate error when the value is changed to be unique', () => {
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('private-address-input-1'), {
      target: { value: 'orders.private' },
    });
    fireEvent.blur(screen.getByTestId('private-address-input-1'));
    fireEvent.change(screen.getByTestId('private-address-input-1'), {
      target: { value: 'events.topic' },
    });
    expect(screen.queryByText('Duplicate address')).not.toBeInTheDocument();
  });
});

describe('AddressManager (private) — address required validation', () => {
  beforeEach(() => {
    render(<PrivateWrapper />);
    fireEvent.click(screen.getByTestId('add-private-address-btn'));
  });

  it('does not show a required error before the field is blurred', () => {
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error after blurring a blank entry', () => {
    fireEvent.blur(screen.getByTestId('private-address-input-0'));
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });

  it('clears the error once a value is typed', () => {
    fireEvent.blur(screen.getByTestId('private-address-input-0'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'orders.private' },
    });
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error again if the value is cleared after being set', () => {
    fireEvent.blur(screen.getByTestId('private-address-input-0'));
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: 'orders.private' },
    });
    fireEvent.change(screen.getByTestId('private-address-input-0'), {
      target: { value: '' },
    });
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });
});

describe('AddressManager (shared) — add and remove entries', () => {
  beforeEach(() => render(<SharedWrapper />));

  it('renders the Shared Addresses section title', () => {
    expect(screen.getByText('Shared Addresses')).toBeInTheDocument();
  });

  it('renders no address inputs before any entry is added', () => {
    expect(screen.queryByTestId('shared-address-input-0')).not.toBeInTheDocument();
  });

  it('renders an address input after clicking Add shared address', () => {
    fireEvent.click(screen.getByTestId('add-shared-address-btn'));
    expect(screen.getByTestId('shared-address-input-0')).toBeInTheDocument();
  });

  it('removes the entry after clicking the remove button', () => {
    fireEvent.click(screen.getByTestId('add-shared-address-btn'));
    fireEvent.click(screen.getByTestId('remove-shared-address-0'));
    expect(screen.queryByTestId('shared-address-input-0')).not.toBeInTheDocument();
  });

  it('reflects a typed value in the address input', () => {
    fireEvent.click(screen.getByTestId('add-shared-address-btn'));
    fireEvent.change(screen.getByTestId('shared-address-input-0'), {
      target: { value: 'orders.shared' },
    });
    expect(screen.getByTestId('shared-address-input-0')).toHaveValue('orders.shared');
  });
});

describe('AddressManager (shared) — duplicate address validation', () => {
  beforeEach(() => render(<SharedWrapper />));

  it('shows a duplicate error on the second entry after blurring with the same address', () => {
    fireEvent.click(screen.getByTestId('add-shared-address-btn'));
    fireEvent.click(screen.getByTestId('add-shared-address-btn'));
    fireEvent.change(screen.getByTestId('shared-address-input-0'), {
      target: { value: 'orders.shared' },
    });
    fireEvent.change(screen.getByTestId('shared-address-input-1'), {
      target: { value: 'orders.shared' },
    });
    fireEvent.blur(screen.getByTestId('shared-address-input-1'));
    expect(screen.getByText('Duplicate address')).toBeInTheDocument();
  });
});
