import * as React from 'react';
import { useReducer } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const openEditModal = (index = 0) => {
  fireEvent.click(screen.getByTestId(`edit-address-${String(index)}`));
};

const saveModal = () => {
  fireEvent.click(screen.getByTestId('modal-done-btn'));
};

const cancelModal = () => {
  fireEvent.click(screen.getByTestId('modal-cancel-btn'));
};

const enablePubSub = () => {
  openEditModal(0);
  fireEvent.click(screen.getByTestId('address-pubsub-0'));
};

const addSub = (name: string) => {
  fireEvent.click(screen.getByText('Add subscription'));
  const input = screen.getByPlaceholderText('e.g., my-subscription');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('AddressManager — card layout', () => {
  beforeEach(() => render(<Wrapper />));

  it('renders one blank address card on initial load', () => {
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();
    expect(screen.getByText('New address')).toBeInTheDocument();
  });

  it('shows ownership and direction labels on the card', () => {
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Produces')).toBeInTheDocument();
  });

  it('shows edit and remove buttons on the card', () => {
    expect(screen.getByTestId('edit-address-0')).toBeInTheDocument();
    expect(screen.getByTestId('remove-address-0')).toBeInTheDocument();
  });
});

describe('AddressManager — edit modal', () => {
  beforeEach(() => render(<Wrapper />));

  it('opens the edit modal when the edit button is clicked', () => {
    openEditModal(0);
    expect(screen.getByText('Edit address')).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-0')).toBeInTheDocument();
  });

  it('shows form controls inside the modal', () => {
    openEditModal(0);
    expect(screen.getByTestId('address-ownership-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-direction-produces-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-direction-consumes-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-pubsub-0')).toBeInTheDocument();
  });

  it('closes the modal when Done is clicked', () => {
    openEditModal(0);
    saveModal();
    expect(screen.queryByText('Edit address')).not.toBeInTheDocument();
  });

  it('reflects typed address name on the card after saving', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.created' },
    });
    saveModal();
    expect(screen.getByText('orders.created')).toBeInTheDocument();
  });

  it('auto-opens the modal when adding a new address', () => {
    addEntry();
    expect(screen.getByText('Edit address')).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-1')).toBeInTheDocument();
  });
});

describe('AddressManager — cancel discards changes', () => {
  beforeEach(() => render(<Wrapper />));

  it('discards typed address name when cancel is clicked', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'should-not-persist' },
    });
    cancelModal();
    expect(screen.queryByText('should-not-persist')).not.toBeInTheDocument();
    expect(screen.getByText('New address')).toBeInTheDocument();
  });

  it('removes a newly added entry when cancel is clicked', () => {
    addEntry();
    cancelModal();
    expect(screen.queryByTestId('address-list-item-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();
  });

  it('preserves original values of an existing entry when cancel is clicked', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'saved.name' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'unsaved.name' },
    });
    cancelModal();
    expect(screen.getByText('saved.name')).toBeInTheDocument();
    expect(screen.queryByText('unsaved.name')).not.toBeInTheDocument();
  });

  it('discards subscription changes when cancel is clicked', () => {
    enablePubSub();
    addSub('temp-sub');
    cancelModal();
    expect(screen.queryByText('temp-sub')).not.toBeInTheDocument();
  });
});

describe('AddressManager — add and remove entries', () => {
  beforeEach(() => render(<Wrapper />));

  it('renders a second address card after clicking Add address', () => {
    addEntry();
    saveModal();
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-list-item-1')).toBeInTheDocument();
  });

  it('renders three address cards after adding twice', () => {
    addEntry();
    saveModal();
    addEntry();
    saveModal();
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-list-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('address-list-item-2')).toBeInTheDocument();
  });

  it('clears the last remaining entry to blank instead of removing it', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.getByText('New address')).toBeInTheDocument();
  });

  it('disables the remove button when the sole entry is already blank', () => {
    expect(screen.getByTestId('remove-address-0')).toBeDisabled();
  });

  it('enables the remove button once the sole entry has content', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    expect(screen.getByTestId('remove-address-0')).toBeEnabled();
  });

  it('removes a non-last entry normally', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'second.address' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'first.address' },
    });
    saveModal();
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.getByText('second.address')).toBeInTheDocument();
    expect(screen.queryByTestId('address-list-item-1')).not.toBeInTheDocument();
  });

  it('reflects a typed value on the card after saving', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    expect(screen.getByText('orders.private')).toBeInTheDocument();
  });

  it('does not carry validation error from a removed entry to the surviving entry', () => {
    addEntry();
    saveModal();
    openEditModal(0);
    fireEvent.blur(screen.getByTestId('address-name-input-0'));
    saveModal();
    openEditModal(1);
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'valid.address' },
    });
    saveModal();
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });
});

describe('AddressManager — pubSub toggle', () => {
  beforeEach(() => {
    render(<Wrapper />);
    enablePubSub();
  });

  it('renders the pubSub switch in the modal', () => {
    expect(screen.getByTestId('address-pubsub-0')).toBeInTheDocument();
  });

  it('does not render the Subscriptions label before pubSub is enabled', () => {
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });

  it('renders the Subscriptions label after enabling pubSub', () => {
    expect(
      screen.getByText('Durable subscription queue names for this address.'),
    ).toBeInTheDocument();
  });

  it('hides the Subscriptions label after disabling pubSub', () => {
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });

  it('shows Pub/Sub label on the card after saving', () => {
    saveModal();
    expect(screen.getByText('Pub/Sub')).toBeInTheDocument();
  });

  it('disables Done when pubSub consumer has no subscriptions', () => {
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    expect(
      screen.getByText('At least one subscription is required for pub/sub consumers'),
    ).toBeInTheDocument();
  });

  it('enables Done once a subscription is added for a pubSub consumer', () => {
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    addSub('my-sub');
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
    expect(
      screen.queryByText('At least one subscription is required for pub/sub consumers'),
    ).not.toBeInTheDocument();
  });

  it('disables Done again when the last subscription is removed', () => {
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    addSub('only-sub');
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Remove only-sub'));
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
  });
});

describe('AddressManager — direction validation', () => {
  beforeEach(() => render(<Wrapper />));

  it('shows error and disables Done when both directions are unchecked for a private address', () => {
    openEditModal(0);
    // Default state has Produces checked — uncheck it
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    expect(
      screen.getByText('At least one direction is required for non-shared addresses'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
  });
});

describe('AddressManager — external ownership hides pubSub', () => {
  beforeEach(() => {
    render(<Wrapper />);
  });

  it('hides the pubSub switch when ownership is changed to external', () => {
    openEditModal(0);
    fireEvent.click(screen.getByTestId('address-ownership-0'));
    fireEvent.click(screen.getByText('External'));
    expect(screen.queryByTestId('address-pubsub-0')).not.toBeInTheDocument();
  });
});

describe('SubscriptionListInput — add subscriptions', () => {
  beforeEach(() => {
    render(<Wrapper />);
    enablePubSub();
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
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryAllByLabelText(/^Remove /)).toHaveLength(0);
  });

  it('rejects a duplicate subscription name', () => {
    addSub('sub-a');
    addSub('sub-a');
    expect(screen.getAllByText('sub-a')).toHaveLength(1);
  });

  it('shows subscription labels on the card after saving', () => {
    addSub('sub-card');
    saveModal();
    expect(screen.getByText('sub-card')).toBeInTheDocument();
  });

  it('rejects a subscription name containing "::" and shows an error', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    const input = screen.getByPlaceholderText('e.g., my-subscription');
    fireEvent.change(input, { target: { value: 'addr::sub' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(
      screen.getByText('Subscription name must not contain "::" (FQQN format)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('addr::sub')).not.toBeInTheDocument();
  });

  it('clears the FQQN error when the input value is corrected', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    const input = screen.getByPlaceholderText('e.g., my-subscription');
    fireEvent.change(input, { target: { value: 'addr::sub' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(
      screen.getByText('Subscription name must not contain "::" (FQQN format)'),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'valid-sub' } });
    expect(
      screen.queryByText('Subscription name must not contain "::" (FQQN format)'),
    ).not.toBeInTheDocument();
  });
});

describe('SubscriptionListInput — remove subscriptions', () => {
  beforeEach(() => {
    render(<Wrapper />);
    enablePubSub();
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

  it('shows a duplicate error on the card after saving with the same address', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    expect(screen.getByText('Duplicate address')).toBeInTheDocument();
  });

  it('does not show a duplicate error in the modal before the name field is blurred', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Duplicate address')).not.toBeInTheDocument();
    saveModal();
  });

  it('clears the duplicate error when the value is changed to be unique', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'events.topic' },
    });
    saveModal();
    expect(screen.queryByText('Duplicate address')).not.toBeInTheDocument();
  });
});

describe('AddressManager — address required validation', () => {
  beforeEach(() => {
    render(<Wrapper />);
  });

  it('does not show a required error before the modal is opened and closed', () => {
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error on the card after saving with blank address', () => {
    openEditModal(0);
    fireEvent.blur(screen.getByTestId('address-name-input-0'));
    saveModal();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });

  it('clears the error once a value is typed and saved', () => {
    openEditModal(0);
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error again if the value is cleared', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: '' },
    });
    saveModal();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });
});
