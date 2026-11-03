import * as React from 'react';
import { useReducer } from 'react';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../../reducers/brokerapp/reducer';
import { AddressManager } from './AddressManager';

const waitForPopperUpdates = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};

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

  it('renders no address cards on initial load', () => {
    expect(screen.queryByTestId('address-list-item-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('add-address-btn')).toBeInTheDocument();
  });

  it('shows kind and direction labels on the card after adding', () => {
    addEntry();
    saveModal();
    expect(screen.getByText('Owned')).toBeInTheDocument();
    expect(screen.getByText('Produces')).toBeInTheDocument();
  });

  it('shows edit and remove buttons on the card', () => {
    addEntry();
    saveModal();
    expect(screen.getByTestId('edit-address-0')).toBeInTheDocument();
    expect(screen.getByTestId('remove-address-0')).toBeInTheDocument();
  });
});

describe('AddressManager — edit modal', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
  });

  it('auto-opens the modal when adding a new address', () => {
    expect(screen.getByText('Edit address')).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-0')).toBeInTheDocument();
  });

  it('shows form controls inside the modal', () => {
    expect(screen.getByTestId('address-kind-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-direction-produces-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-direction-consumes-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-pubsub-0')).toBeInTheDocument();
  });

  it('closes the modal when Done is clicked', () => {
    saveModal();
    expect(screen.queryByText('Edit address')).not.toBeInTheDocument();
  });

  it('reflects typed address name on the card after saving', () => {
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.created' },
    });
    saveModal();
    expect(screen.getByText('orders.created')).toBeInTheDocument();
  });

  it('opens the edit modal when the edit button is clicked', () => {
    saveModal();
    openEditModal(0);
    expect(screen.getByText('Edit address')).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-0')).toBeInTheDocument();
  });
});

describe('AddressManager — cancel discards changes', () => {
  beforeEach(() => render(<Wrapper />));

  it('removes a newly added entry when cancel is clicked', () => {
    addEntry();
    cancelModal();
    expect(screen.queryByTestId('address-list-item-0')).not.toBeInTheDocument();
  });

  it('preserves original values of an existing entry when cancel is clicked', () => {
    addEntry();
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
    addEntry();
    saveModal();
    enablePubSub();
    addSub('temp-sub');
    cancelModal();
    expect(screen.queryByText('temp-sub')).not.toBeInTheDocument();
  });
});

describe('AddressManager — add and remove entries', () => {
  beforeEach(() => render(<Wrapper />));

  it('renders one address card after clicking Add address', () => {
    addEntry();
    saveModal();
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();
  });

  it('renders two address cards after adding twice', () => {
    addEntry();
    saveModal();
    addEntry();
    saveModal();
    expect(screen.getByTestId('address-list-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-list-item-1')).toBeInTheDocument();
  });

  it('removes the last remaining entry completely', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.queryByTestId('address-list-item-0')).not.toBeInTheDocument();
  });

  it('removes a non-last entry normally', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'first.address' },
    });
    saveModal();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'second.address' },
    });
    saveModal();
    fireEvent.click(screen.getByTestId('remove-address-0'));
    expect(screen.getByText('second.address')).toBeInTheDocument();
    expect(screen.queryByTestId('address-list-item-1')).not.toBeInTheDocument();
  });

  it('reflects a typed value on the card after saving', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    expect(screen.getByText('orders.private')).toBeInTheDocument();
  });

  it('does not carry validation error from a removed entry to the surviving entry', () => {
    addEntry();
    saveModal();
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
    addEntry();
    saveModal();
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
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
    saveModal();
  });

  it('shows a warning but allows Done when both directions are unchecked for a private address', () => {
    openEditModal(0);
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    expect(
      screen.getByText(
        'Without a direction this address only reserves the name on the broker for the apps its gates admit',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
  });

  it('shows an error and disables Done when both directions are unchecked for a referenced address', () => {
    openEditModal(0);
    fireEvent.click(screen.getByText('Referenced'));
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    expect(
      screen.getByText('At least one direction is required for referenced addresses'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
  });
});

describe('AddressManager — referenced kind offers pubSub', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
    saveModal();
  });

  it('shows the pubSub switch when kind is changed to referenced', () => {
    openEditModal(0);
    fireEvent.click(screen.getByText('Referenced'));
    expect(screen.getByTestId('address-pubsub-0')).toBeInTheDocument();
  });

  it('replaces the subscription input with a hint on a producer-only referenced pub/sub address', () => {
    openEditModal(0);
    fireEvent.click(screen.getByText('Referenced'));
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(screen.getByTestId('address-no-subscriptions-0')).toBeInTheDocument();
    expect(screen.queryByText('Add subscription')).not.toBeInTheDocument();
  });

  it('offers subscriptions once Consumes is checked on an referenced pub/sub address', () => {
    openEditModal(0);
    fireEvent.click(screen.getByText('Referenced'));
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    expect(screen.queryByTestId('address-no-subscriptions-0')).not.toBeInTheDocument();
    expect(screen.getByText('Add subscription')).toBeInTheDocument();
  });

  it('drops subscriptions from the card when Consumes is unchecked on an external address', () => {
    openEditModal(0);
    fireEvent.click(screen.getByText('Referenced'));
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    addSub('notifier');
    saveModal();
    expect(screen.getByText('notifier')).toBeInTheDocument();
    openEditModal(0);
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    saveModal();
    expect(screen.queryByText('notifier')).not.toBeInTheDocument();
  });
});

describe('SubscriptionListInput — add subscriptions', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
    saveModal();
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
    addEntry();
    saveModal();
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

  it('disables Done in the modal when a duplicate address is entered', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
  });

  it('does not show a duplicate error in the modal before the name field is blurred', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText('Duplicate address')).not.toBeInTheDocument();
  });

  it('re-enables Done when the duplicate value is changed to be unique', () => {
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders.private' },
    });
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'events.topic' },
    });
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
  });
});

describe('AddressManager — address required validation', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addEntry();
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders.private' },
    });
    saveModal();
  });

  it('shows a required error on the card after clearing the address', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: '' },
    });
    saveModal();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });

  it('clears the error once a value is typed and saved', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: '' },
    });
    saveModal();
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'events.topic' },
    });
    saveModal();
    expect(screen.queryByText('Address is required')).not.toBeInTheDocument();
  });

  it('shows a required error again if the value is cleared', () => {
    openEditModal(0);
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: '' },
    });
    saveModal();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
  });
});

const mockWatchResource = useK8sWatchResource as jest.Mock;

// The form under test lives in namespace `default` as `my-messaging-app`.
const MOCK_BROKER_APPS = [
  {
    metadata: { name: 'order-generator', namespace: 'service-project' },
    spec: {
      addresses: [
        { address: 'ORDERS.NEW', consumerOfAppSelector: "app.metadata.namespace == 'default'" },
        {
          address: 'ORDERS.PROCESSED',
          producerOfAppSelector: "app.metadata.namespace == 'default'",
        },
        { address: 'ORDERS.PRIVATE' },
      ],
    },
  },
  {
    metadata: { name: 'event-publisher', namespace: 'service-project' },
    spec: {
      addresses: [
        {
          address: 'EVENTS.TOPIC',
          pubSub: true,
          producerOfAppSelector: "app.metadata.labels['tier'] == 'prd'",
          consumerOfAppSelector: 'true',
        },
      ],
    },
  },
  {
    metadata: { name: 'inventory-app', namespace: 'ns-alpha' },
    spec: { addresses: [{ address: 'INVENTORY.UPDATES', consumerOfAppSelector: 'true' }] },
  },
];

/**
 * Configures the mock so the cluster-wide BrokerApp watch returns the full app list.
 * Namespaces are derived from the BrokerApp metadata, not a separate Namespace watch.
 */
const setupReferencedMocks = () => {
  mockWatchResource.mockImplementation(
    (resource: { groupVersionKind?: { kind?: string } } | null) => {
      if (!resource) return [[], false, undefined];
      if (resource.groupVersionKind?.kind === 'BrokerApp') {
        return [MOCK_BROKER_APPS, true, undefined];
      }
      return [[], false, undefined];
    },
  );
};

const selectReferenced = async (): Promise<void> => {
  fireEvent.click(screen.getByText('Referenced'));
  await waitForPopperUpdates();
};

const selectTypeaheadOption = async (ariaLabel: string, optionText: string): Promise<void> => {
  const input = screen.getByLabelText(ariaLabel);
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(input);
  fireEvent.click(screen.getByText(optionText));
  await waitForPopperUpdates();
};

const selectReferencedApp = async (
  ns = 'service-project',
  app = 'order-generator',
): Promise<void> => {
  await selectReferenced();
  await selectTypeaheadOption('App namespace', ns);
  await selectTypeaheadOption('App name', app);
};

const openTypeahead = async (ariaLabel: string): Promise<void> => {
  fireEvent.click(screen.getByLabelText(ariaLabel));
  await waitForPopperUpdates();
};

describe('AddressManager — referenced address typeahead', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  it('shows namespace and app name dropdowns when referenced is selected', async () => {
    await selectReferenced();
    expect(screen.getByLabelText('App namespace')).toBeInTheDocument();
    expect(screen.getByLabelText('App name')).toBeInTheDocument();
  });

  it('hides namespace and app name dropdowns for the owned kind', () => {
    expect(screen.queryByLabelText('App namespace')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('App name')).not.toBeInTheDocument();
  });

  it('shows placeholder text when no namespace is selected', async () => {
    await selectReferenced();
    expect(screen.getByPlaceholderText('Select a namespace first')).toBeInTheDocument();
  });

  it('shows app name placeholder after selecting a namespace', async () => {
    await selectReferenced();
    await selectTypeaheadOption('App namespace', 'service-project');
    expect(screen.getByPlaceholderText('Select a BrokerApp')).toBeInTheDocument();
  });

  it('shows the cross-app reference label on the card after saving', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    saveModal();
    expect(screen.getByText('service-project/order-generator')).toBeInTheDocument();
  });

  it('shows only the gated addresses of the selected BrokerApp in the address typeahead', async () => {
    await selectReferencedApp();
    await openTypeahead('Address');
    expect(screen.getByText('ORDERS.NEW')).toBeInTheDocument();
    expect(screen.getByText('ORDERS.PROCESSED')).toBeInTheDocument();
    expect(screen.queryByText('ORDERS.PRIVATE')).not.toBeInTheDocument();
  });

  it('tells the user when the owner refuses this app in the requested role', async () => {
    await selectReferencedApp();
    // ORDERS.NEW is open to consumers of `default`, not to producers; Produces is the default.
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    expect(screen.getByTestId('address-gate-verdict-producer-0')).toHaveTextContent(
      'does not admit this app as a producer',
    );
  });

  it('tells the user when the owner admits this app in the requested role', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    expect(screen.getByTestId('address-gate-verdict-consumer-0')).toHaveTextContent(
      'admits this app as a consumer',
    );
    expect(screen.queryByTestId('address-gate-verdict-producer-0')).not.toBeInTheDocument();
  });

  it('says so when the owner gate cannot be evaluated in the browser', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    await selectTypeaheadOption('Address', 'EVENTS.TOPIC');
    expect(screen.getByTestId('address-gate-verdict-producer-0')).toHaveTextContent(
      'cannot evaluate',
    );
  });

  it('shows a create option for a custom address value', async () => {
    await selectReferencedApp();
    const addressInput = screen.getByLabelText('Address');
    fireEvent.click(addressInput);
    fireEvent.change(addressInput, { target: { value: 'CUSTOM.ADDR' } });
    await waitForPopperUpdates();
    expect(screen.getByText('Create "{{value}}"')).toBeInTheDocument();
  });

  it('clears app name when namespace changes', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('App namespace', 'ns-alpha');
    expect(screen.getByLabelText('App name')).toHaveValue('');
  });

  it('dispatches appName and appNamespace to the reducer on save', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    saveModal();
    expect(screen.getByText('Referenced')).toBeInTheDocument();
    expect(screen.getByText('service-project/order-generator')).toBeInTheDocument();
    expect(screen.getByText('ORDERS.NEW')).toBeInTheDocument();
  });
});

describe('AddressManager — subscribing to an referenced pub/sub address', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  const consumeOnly = () => {
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
  };

  it('turns Pub/Sub on when the owner declared the address pub/sub', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    await selectTypeaheadOption('Address', 'EVENTS.TOPIC');
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
    // Produces is the default direction: subscriptions wait until the app consumes.
    expect(screen.getByTestId('address-no-subscriptions-0')).toBeInTheDocument();
  });

  it('leaves Pub/Sub off when the owner declared the address point-to-point', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    expect(screen.getByTestId('address-pubsub-0')).not.toBeChecked();
  });

  it('requires a subscription before a pub/sub external consumer can be saved', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    await selectTypeaheadOption('Address', 'EVENTS.TOPIC');
    consumeOnly();
    expect(
      screen.getByText('At least one subscription is required for pub/sub consumers'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    addSub('notifier');
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
  });

  it('shows the subscription and Pub/Sub on the card after saving', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    await selectTypeaheadOption('Address', 'EVENTS.TOPIC');
    consumeOnly();
    addSub('notifier');
    saveModal();
    expect(screen.getByText('service-project/event-publisher')).toBeInTheDocument();
    expect(screen.getByText('Pub/Sub')).toBeInTheDocument();
    expect(screen.getByText('notifier')).toBeInTheDocument();
  });
});

describe('AddressManager — switching kind away from referenced', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  it('hides namespace/app fields and clears cross-app label when switching to owned', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    saveModal();
    expect(screen.getByText('service-project/order-generator')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Edit address'));
    fireEvent.click(screen.getByText('Owned'));
    expect(screen.queryByLabelText('App namespace')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('App name')).not.toBeInTheDocument();
    saveModal();

    expect(screen.queryByText('service-project/order-generator')).not.toBeInTheDocument();
    expect(screen.getByText('Owned')).toBeInTheDocument();
    expect(screen.getByText('ORDERS.NEW')).toBeInTheDocument();
  });
});

describe('AddressManager — owner-locked Pub/Sub inference', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  it('infers Pub/Sub from the owner when the address is typed, not selected from the list', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    const addressInput = screen.getByLabelText('Address');
    fireEvent.change(addressInput, { target: { value: 'EVENTS.TOPIC' } });
    await waitForPopperUpdates();
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });

  it('infers point-to-point from the owner when the address is typed', async () => {
    await selectReferencedApp();
    const addressInput = screen.getByLabelText('Address');
    fireEvent.change(addressInput, { target: { value: 'ORDERS.NEW' } });
    await waitForPopperUpdates();
    expect(screen.getByTestId('address-pubsub-0')).not.toBeChecked();
  });

  it('prevents toggling the switch when the owner declares the address routing', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    const addressInput = screen.getByLabelText('Address');
    fireEvent.change(addressInput, { target: { value: 'EVENTS.TOPIC' } });
    await waitForPopperUpdates();
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });

  it('keeps the switch editable when the address does not match the owner', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    const addressInput = screen.getByLabelText('Address');
    fireEvent.change(addressInput, { target: { value: 'CUSTOM.ADDR' } });
    await waitForPopperUpdates();
    expect(screen.getByTestId('address-pubsub-0')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });

  it('preserves the owner-locked Pub/Sub after save and reopen', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    const addressInput = screen.getByLabelText('Address');
    fireEvent.change(addressInput, { target: { value: 'EVENTS.TOPIC' } });
    await waitForPopperUpdates();
    saveModal();
    openEditModal(0);
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });
});

describe('AddressManager — referenced create option on namespace/app typeaheads', () => {
  beforeEach(async () => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
    await selectReferenced();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  it('shows a create option for a namespace not in the list', async () => {
    const nsInput = screen.getByLabelText('App namespace');
    fireEvent.click(nsInput);
    fireEvent.change(nsInput, { target: { value: 'new-namespace' } });
    await waitForPopperUpdates();
    expect(screen.getByText('Create "{{value}}"')).toBeInTheDocument();
  });

  it('shows a create option for an app name not in the list', async () => {
    await selectTypeaheadOption('App namespace', 'service-project');
    const appInput = screen.getByLabelText('App name');
    fireEvent.click(appInput);
    fireEvent.change(appInput, { target: { value: 'new-app' } });
    await waitForPopperUpdates();
    expect(screen.getByText('Create "{{value}}"')).toBeInTheDocument();
  });

  it('does not show a create option when the value matches an existing item', async () => {
    const nsInput = screen.getByLabelText('App namespace');
    fireEvent.click(nsInput);
    fireEvent.change(nsInput, { target: { value: 'service-project' } });
    await waitForPopperUpdates();
    expect(screen.queryByText('Create "{{value}}"')).not.toBeInTheDocument();
  });
});

describe('AddressManager — gates on an owned address', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  it('shows both gate editors for an owned address and none for a referenced one', async () => {
    expect(screen.getByTestId('address-producer-gate-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-consumer-gate-0')).toBeInTheDocument();
    await selectReferenced();
    expect(screen.queryByTestId('address-producer-gate-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('address-consumer-gate-0')).not.toBeInTheDocument();
  });

  it('opens a gate to a namespace and flags it on the card', async () => {
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'ORDERS.OUT' },
    });
    await selectTypeaheadOption('Who may consume: namespace', 'ns-alpha');
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-add'));
    expect(screen.getByTestId('address-consumer-gate-0-principal-0')).toHaveTextContent('ns-alpha');
    saveModal();
    expect(screen.getByTestId('address-consumer-gate-0')).toBeInTheDocument();
    expect(screen.getByText('Consumers gated')).toBeInTheDocument();
    expect(screen.queryByText('Producers gated')).not.toBeInTheDocument();
  });

  it('opens a gate to one app of a namespace', async () => {
    await selectTypeaheadOption('Who may produce: namespace', 'service-project');
    await selectTypeaheadOption('Who may produce: app name', 'order-generator');
    fireEvent.click(screen.getByTestId('address-producer-gate-0-add'));
    expect(screen.getByTestId('address-producer-gate-0-principal-0')).toHaveTextContent(
      'service-project/order-generator',
    );
  });

  it('reads the principals back when the modal is reopened', async () => {
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'ORDERS.OUT' },
    });
    await selectTypeaheadOption('Who may consume: namespace', 'ns-alpha');
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-add'));
    saveModal();
    openEditModal(0);
    expect(screen.getByTestId('address-consumer-gate-0-principal-0')).toHaveTextContent('ns-alpha');
  });

  it('switches to a custom expression carrying the compiled gate', async () => {
    await selectTypeaheadOption('Who may consume: namespace', 'ns-alpha');
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-add'));
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-custom-switch'));
    expect(screen.getByTestId('address-consumer-gate-0-expression')).toHaveValue(
      "app.metadata.namespace == 'ns-alpha'",
    );
  });

  it('disables Done while a custom expression does not parse', () => {
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'ORDERS.OUT' },
    });
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-custom-switch'));
    fireEvent.change(screen.getByTestId('address-consumer-gate-0-expression'), {
      target: { value: 'app.metadata.namespace ==' },
    });
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    fireEvent.change(screen.getByTestId('address-consumer-gate-0-expression'), {
      target: { value: "app.metadata.labels['tier'] == 'prd'" },
    });
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
  });

  it('refuses to leave custom mode while the expression cannot be read as a list', () => {
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-custom-switch'));
    fireEvent.change(screen.getByTestId('address-consumer-gate-0-expression'), {
      target: { value: "app.metadata.labels['tier'] == 'prd'" },
    });
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-custom-switch'));
    expect(screen.getByTestId('address-consumer-gate-0-expression')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This expression cannot be edited as a list of namespaces. Clear it to start from a list.',
      ),
    ).toBeInTheDocument();
  });
});
