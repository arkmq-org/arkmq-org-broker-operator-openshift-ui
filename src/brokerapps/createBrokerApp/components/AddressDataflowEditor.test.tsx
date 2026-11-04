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
import { AddressDataflowEditor } from './AddressDataflowEditor';

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
        <AddressDataflowEditor />
      </BrokerAppFormDispatchContext.Provider>
    </BrokerAppFormStateContext.Provider>
  );
};

const addEntry = () => {
  fireEvent.click(screen.getByTestId('add-address-btn'));
};

const typeName = (index: number, name: string) => {
  fireEvent.change(screen.getByTestId(`address-name-input-${String(index)}`), {
    target: { value: name },
  });
};

const savePanel = () => {
  fireEvent.click(screen.getByTestId('modal-done-btn'));
};

const cancelPanel = () => {
  fireEvent.click(screen.getByTestId('modal-cancel-btn'));
};

/** Adds an entry, names it and saves: the only way an entry gets a box. */
const addNamed = (index: number, name: string) => {
  addEntry();
  typeName(index, name);
  savePanel();
};

const nodeOf = (name: string) => screen.getByTestId(`dataflow-node-addr:${name}`);
const openEntry = (name: string) => {
  fireEvent.click(nodeOf(name));
};
const panel = () => screen.getByTestId('mock-topology-sidebar');

const enablePubSub = (name: string) => {
  openEntry(name);
  fireEvent.click(screen.getByTestId('address-pubsub-0'));
};

const addSub = (name: string) => {
  fireEvent.click(screen.getByText('Add subscription'));
  const input = screen.getByPlaceholderText('e.g., my-subscription');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });
};

describe('AddressDataflowEditor — diagram and panel', () => {
  beforeEach(() => render(<Wrapper />));

  it('starts with an empty state and no panel', () => {
    expect(screen.getByTestId('address-list-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-topology-sidebar')).not.toBeInTheDocument();
  });

  it('opens the panel for a new entry when Add address is clicked', () => {
    addEntry();
    expect(panel()).toBeInTheDocument();
    expect(screen.getByText('New address')).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-kind-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-direction-produces-0')).toBeInTheDocument();
    expect(screen.getByTestId('address-pubsub-0')).toBeInTheDocument();
  });

  it('keeps Done disabled until the new address has a name', () => {
    addEntry();
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    typeName(0, 'orders.created');
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
  });

  it('draws a box for the saved address and the produce arrow from the app box in its namespace', () => {
    addNamed(0, 'orders.created');
    expect(nodeOf('orders.created')).toHaveTextContent('orders.created');
    expect(
      screen.getByTestId(
        'dataflow-edge-produce:cred:default/my-messaging-app->addr:orders.created',
      ),
    ).toHaveAttribute('data-kind', 'declared');
    expect(screen.queryByTestId('mock-topology-sidebar')).not.toBeInTheDocument();
  });

  it('draws one box per saved address', () => {
    addNamed(0, 'first.address');
    addNamed(1, 'second.address');
    expect(nodeOf('first.address')).toBeInTheDocument();
    expect(nodeOf('second.address')).toBeInTheDocument();
  });

  it('opens the panel for an existing address when its box is clicked', () => {
    addNamed(0, 'orders.created');
    openEntry('orders.created');
    expect(panel()).toBeInTheDocument();
    expect(screen.getByTestId('address-name-input-0')).toHaveValue('orders.created');
    expect(nodeOf('orders.created')).toHaveAttribute('data-selected', 'true');
  });

  it('removes the entry from the panel of an existing address', () => {
    addNamed(0, 'orders.created');
    openEntry('orders.created');
    fireEvent.click(screen.getByTestId('remove-address-btn'));
    expect(screen.queryByTestId('dataflow-node-addr:orders.created')).not.toBeInTheDocument();
    expect(screen.getByTestId('address-list-empty')).toBeInTheDocument();
  });

  it('offers no Remove button for a new entry', () => {
    addEntry();
    expect(screen.queryByTestId('remove-address-btn')).not.toBeInTheDocument();
  });

  it('removes a non-last entry and keeps the others', () => {
    addNamed(0, 'first.address');
    addNamed(1, 'second.address');
    openEntry('first.address');
    fireEvent.click(screen.getByTestId('remove-address-btn'));
    expect(screen.queryByTestId('dataflow-node-addr:first.address')).not.toBeInTheDocument();
    expect(nodeOf('second.address')).toBeInTheDocument();
  });

  it('drops an unsaved new entry when another box is clicked', () => {
    addNamed(0, 'orders.created');
    addEntry();
    typeName(1, 'never.saved');
    openEntry('orders.created');
    expect(screen.getByTestId('address-name-input-0')).toHaveValue('orders.created');
    expect(screen.queryByTestId('address-name-input-1')).not.toBeInTheDocument();
  });

  it('replaces an unsaved new entry when Add address is clicked again', () => {
    addEntry();
    typeName(0, 'never.saved');
    addEntry();
    expect(screen.getByTestId('address-name-input-0')).toHaveValue('');
  });
});

describe('AddressDataflowEditor — palette', () => {
  beforeEach(() => render(<Wrapper />));

  const dropItem = (item: string, target: HTMLElement) => {
    fireEvent.drop(target, {
      dataTransfer: { types: ['application/x-arkmq-dataflow'], getData: () => item },
    });
  };

  it('offers draggable palette items', () => {
    expect(screen.getByTestId('palette-address')).toHaveAttribute('draggable', 'true');
    expect(screen.getByTestId('palette-namespace')).toHaveAttribute('draggable', 'true');
  });

  it('adds an address when the address item is dropped on the diagram', () => {
    addNamed(0, 'orders.created');
    dropItem('address', screen.getByTestId('address-list'));
    expect(panel()).toBeInTheDocument();
    expect(screen.getByText('New address')).toBeInTheDocument();
  });

  it('opens the address a namespace item is dropped on', () => {
    addNamed(0, 'orders.created');
    dropItem('namespace', nodeOf('orders.created'));
    expect(screen.getByTestId('address-name-input-0')).toHaveValue('orders.created');
  });
});

describe('AddressDataflowEditor — cancel discards changes', () => {
  beforeEach(() => render(<Wrapper />));

  it('removes a newly added entry when cancel is clicked', () => {
    addEntry();
    typeName(0, 'never.saved');
    cancelPanel();
    expect(screen.queryByTestId('dataflow-node-addr:never.saved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-topology-sidebar')).not.toBeInTheDocument();
  });

  it('preserves original values of an existing entry when cancel is clicked', () => {
    addNamed(0, 'saved.name');
    openEntry('saved.name');
    typeName(0, 'unsaved.name');
    cancelPanel();
    expect(nodeOf('saved.name')).toBeInTheDocument();
    expect(screen.queryByTestId('dataflow-node-addr:unsaved.name')).not.toBeInTheDocument();
  });

  it('discards subscription changes when cancel is clicked', () => {
    addNamed(0, 'events.topic');
    enablePubSub('events.topic');
    addSub('temp-sub');
    cancelPanel();
    openEntry('events.topic');
    expect(screen.queryByText('temp-sub')).not.toBeInTheDocument();
    expect(screen.getByTestId('address-pubsub-0')).not.toBeChecked();
  });

  it('closes the panel from the side bar close button', () => {
    addEntry();
    fireEvent.click(screen.getByTestId('mock-topology-sidebar-close'));
    expect(screen.queryByTestId('mock-topology-sidebar')).not.toBeInTheDocument();
  });
});

describe('AddressDataflowEditor — pubSub and subscriptions', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addNamed(0, 'events.topic');
    enablePubSub('events.topic');
  });

  it('shows the Subscriptions field only while pubSub is on', () => {
    expect(
      screen.getByText('Durable subscription queue names for this address.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(
      screen.queryByText('Durable subscription queue names for this address.'),
    ).not.toBeInTheDocument();
  });

  it('keeps pubSub after saving and reopening', () => {
    savePanel();
    openEntry('events.topic');
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });

  it('disables Done when a pubSub consumer has no subscriptions', () => {
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    expect(
      screen.getByText('At least one subscription is required for pub/sub consumers'),
    ).toBeInTheDocument();
    addSub('my-sub');
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByLabelText('Remove my-sub'));
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
  });

  it('rejects an FQQN subscription name and a duplicate one', () => {
    fireEvent.click(screen.getByText('Add subscription'));
    const input = screen.getByPlaceholderText('e.g., my-subscription');
    fireEvent.change(input, { target: { value: 'addr::sub' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(
      screen.getByText('Subscription name must not contain "::" (FQQN format)'),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'sub-a' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    addSub('sub-a');
    expect(within(panel()).getAllByText('sub-a')).toHaveLength(1);
  });

  it('keeps consumer subscriptions on the consume arrow after saving', () => {
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    addSub('registry');
    savePanel();
    expect(
      screen.getByTestId('dataflow-edge-consume:addr:events.topic->cred:default/my-messaging-app'),
    ).toBeInTheDocument();
    openEntry('events.topic');
    expect(screen.getByText('registry')).toBeInTheDocument();
  });
});

describe('AddressDataflowEditor — direction', () => {
  beforeEach(() => {
    render(<Wrapper />);
    addNamed(0, 'orders.created');
    openEntry('orders.created');
  });

  it('warns but allows Done when an owned address has no direction', () => {
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    expect(
      screen.getByText(
        'Without a direction this address only reserves the name on the broker for the apps its gates admit',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
    savePanel();
    expect(nodeOf('orders.created')).toBeInTheDocument();
    expect(
      screen.queryByTestId(
        'dataflow-edge-produce:cred:default/my-messaging-app->addr:orders.created',
      ),
    ).not.toBeInTheDocument();
  });

  it('requires a direction on a referenced address', () => {
    fireEvent.click(screen.getByText('Referenced'));
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    expect(
      screen.getByText('At least one direction is required for referenced addresses'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
  });

  it('draws the consume arrow into the namespace', () => {
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    savePanel();
    expect(
      screen.getByTestId(
        'dataflow-edge-consume:addr:orders.created->cred:default/my-messaging-app',
      ),
    ).toBeInTheDocument();
  });
});

describe('AddressDataflowEditor — duplicate names', () => {
  beforeEach(() => render(<Wrapper />));

  it('disables Done while the name duplicates another entry', () => {
    addNamed(0, 'orders.private');
    addEntry();
    typeName(1, 'orders.private');
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
    expect(within(panel()).queryByText('Duplicate address')).not.toBeInTheDocument();
    typeName(1, 'events.topic');
    expect(screen.getByTestId('modal-done-btn')).not.toBeDisabled();
  });
});

const mockWatchResource = useK8sWatchResource as jest.Mock;

// The form under test lives in namespace `default` as `my-messaging-app`.
const MOCK_BROKER_APPS = [
  {
    metadata: { name: 'order-generator', namespace: 'service-project' },
    spec: {
      serviceSelector: {},
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
      serviceSelector: {},
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
    spec: {
      serviceSelector: {},
      addresses: [{ address: 'INVENTORY.UPDATES', consumerOfAppSelector: 'true' }],
    },
  },
];

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

describe('AddressDataflowEditor — referenced addresses', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
  });

  afterEach(async () => {
    await waitForPopperUpdates();
    mockWatchResource.mockReset();
  });

  it('shows the owner fields only for the referenced kind', async () => {
    expect(screen.queryByLabelText('App namespace')).not.toBeInTheDocument();
    await selectReferenced();
    expect(screen.getByLabelText('App namespace')).toBeInTheDocument();
    expect(screen.getByLabelText('App name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Select a namespace first')).toBeInTheDocument();
  });

  it('lists only the gated addresses of the chosen owner', async () => {
    await selectReferencedApp();
    await openTypeahead('Address');
    expect(screen.getByText('ORDERS.NEW')).toBeInTheDocument();
    expect(screen.getByText('ORDERS.PROCESSED')).toBeInTheDocument();
    expect(screen.queryByText('ORDERS.PRIVATE')).not.toBeInTheDocument();
  });

  it('draws the referenced address as a foreign box with a flow to this namespace', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    savePanel();
    expect(nodeOf('ORDERS.NEW')).toBeInTheDocument();
    expect(
      screen.getByTestId('dataflow-edge-consume:addr:ORDERS.NEW->cred:default/my-messaging-app'),
    ).toHaveAttribute('data-kind', 'declared');
    openEntry('ORDERS.NEW');
    expect(screen.getByLabelText('App name')).toHaveValue('order-generator');
  });

  it('draws a flow the owner refuses as broken and lists it', async () => {
    await selectReferencedApp();
    // ORDERS.NEW is open to consumers of `default`, not to producers; Produces is the default.
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    expect(screen.getByTestId('address-gate-verdict-producer-0')).toHaveTextContent(
      'does not admit this app as a producer',
    );
    savePanel();
    expect(
      screen.getByTestId('dataflow-edge-produce:cred:default/my-messaging-app->addr:ORDERS.NEW'),
    ).toHaveAttribute('data-kind', 'broken');
    expect(screen.getByTestId('dataflow-issue-refused')).toBeInTheDocument();
  });

  it('says so when the owner gate cannot be evaluated in the browser', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    await selectTypeaheadOption('Address', 'EVENTS.TOPIC');
    expect(screen.getByTestId('address-gate-verdict-producer-0')).toHaveTextContent(
      'cannot evaluate',
    );
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });

  it('locks pubSub to what the owner declares', async () => {
    await selectReferencedApp('service-project', 'event-publisher');
    const addressInput = screen.getByLabelText('Address');
    fireEvent.change(addressInput, { target: { value: 'EVENTS.TOPIC' } });
    await waitForPopperUpdates();
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
    fireEvent.click(screen.getByTestId('address-pubsub-0'));
    expect(screen.getByTestId('address-pubsub-0')).toBeChecked();
  });

  it('clears the owner when switching back to owned', async () => {
    await selectReferencedApp();
    await selectTypeaheadOption('Address', 'ORDERS.NEW');
    fireEvent.click(screen.getByTestId('address-direction-produces-0'));
    fireEvent.click(screen.getByTestId('address-direction-consumes-0'));
    savePanel();
    openEntry('ORDERS.NEW');
    fireEvent.click(screen.getByText('Owned'));
    expect(screen.queryByLabelText('App namespace')).not.toBeInTheDocument();
    savePanel();
    openEntry('ORDERS.NEW');
    expect(screen.getByTestId('address-kind-owned-0')).toBeInTheDocument();
    expect(screen.queryByLabelText('App namespace')).not.toBeInTheDocument();
  });

  it('offers to create a namespace that is not in the list', async () => {
    await selectReferenced();
    const nsInput = screen.getByLabelText('App namespace');
    fireEvent.click(nsInput);
    fireEvent.change(nsInput, { target: { value: 'new-namespace' } });
    await waitForPopperUpdates();
    expect(screen.getByText('Create "{{value}}"')).toBeInTheDocument();
  });
});

describe('AddressDataflowEditor — gates on an owned address', () => {
  beforeEach(() => {
    setupReferencedMocks();
    render(<Wrapper />);
    addEntry();
    typeName(0, 'ORDERS.OUT');
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
  });

  it('draws an opened gate as a dashed arrow to the admitted namespace', async () => {
    await selectTypeaheadOption('Who may consume: namespace', 'ns-alpha');
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-add'));
    expect(screen.getByTestId('address-consumer-gate-0-principal-0')).toHaveTextContent('ns-alpha');
    savePanel();
    expect(screen.getByTestId('dataflow-node-ns:ns-alpha')).toBeInTheDocument();
    expect(
      screen.getByTestId('dataflow-edge-consume:addr:ORDERS.OUT->ns:ns-alpha'),
    ).toHaveAttribute('data-kind', 'allowed');
  });

  it("draws an app-level gate as that app's certificate in its own box", async () => {
    await selectTypeaheadOption('Who may produce: namespace', 'service-project');
    await selectTypeaheadOption('Who may produce: app name', 'order-generator');
    fireEvent.click(screen.getByTestId('address-producer-gate-0-add'));
    savePanel();
    // the certificate sits in order-generator's own box, inside its namespace
    expect(screen.getByTestId('dataflow-node-app:service-project/order-generator')).toHaveAttribute(
      'data-kind',
      'app',
    );
    expect(screen.getByTestId('dataflow-node-ns:service-project')).toHaveAttribute(
      'data-kind',
      'namespace',
    );
    expect(
      screen.getByTestId(
        'dataflow-edge-produce:cred:service-project/order-generator->addr:ORDERS.OUT',
      ),
    ).toHaveAttribute('data-kind', 'allowed');
  });

  it('reads the principals back when the panel is reopened', async () => {
    await selectTypeaheadOption('Who may consume: namespace', 'ns-alpha');
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-add'));
    savePanel();
    openEntry('ORDERS.OUT');
    expect(screen.getByTestId('address-consumer-gate-0-principal-0')).toHaveTextContent('ns-alpha');
  });

  it('switches to a custom expression carrying the compiled gate and draws it as a gate box', async () => {
    await selectTypeaheadOption('Who may consume: namespace', 'ns-alpha');
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-add'));
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-custom-switch'));
    expect(screen.getByTestId('address-consumer-gate-0-expression')).toHaveValue(
      "app.metadata.namespace == 'ns-alpha'",
    );
    fireEvent.change(screen.getByTestId('address-consumer-gate-0-expression'), {
      target: { value: "app.metadata.labels['tier'] == 'prd'" },
    });
    savePanel();
    expect(screen.getByTestId('dataflow-node-gate:consumer:ORDERS.OUT')).toHaveAttribute(
      'data-kind',
      'customGate',
    );
  });

  it('disables Done while a custom expression does not parse', () => {
    fireEvent.click(screen.getByTestId('address-consumer-gate-0-custom-switch'));
    fireEvent.change(screen.getByTestId('address-consumer-gate-0-expression'), {
      target: { value: 'app.metadata.namespace ==' },
    });
    expect(screen.getByTestId('modal-done-btn')).toBeDisabled();
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
