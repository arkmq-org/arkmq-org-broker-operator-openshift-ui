import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import * as jsYaml from 'js-yaml';
import CreateBrokerAppPage from './CreateBrokerAppPage';

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ ns: 'test-ns' })),
  useNavigate: jest.fn(() => jest.fn()),
}));

let capturedOnYamlSave: ((yaml: string) => void | Promise<void>) | undefined;

/**
 * ResourceFormEditor contains a YAML editor (Monaco/CodeMirror) that cannot run
 * in jsdom. Mocked here to render children and the submit button only, so
 * CreateBrokerAppPage form sections remain testable without the editor dependency.
 *
 * isFormValid is forwarded to the button's disabled attribute so integration
 * tests can assert that validation state disables submission.
 *
 * onYamlSave is captured so tests can invoke the YAML submit path directly.
 */
jest.mock('../../shared-components/ResourceFormEditor', () => ({
  ResourceFormEditor: ({
    children,
    createButtonTestId,
    isFormValid,
    onYamlSave,
  }: {
    children: React.ReactNode;
    createButtonTestId?: string;
    isFormValid?: boolean;
    onYamlSave?: (yaml: string) => void | Promise<void>;
  }) => {
    capturedOnYamlSave = onYamlSave;
    return (
      <>
        {children}
        <button data-test={createButtonTestId} disabled={!isFormValid}>
          Create
        </button>
      </>
    );
  },
}));

describe('CreateBrokerAppPage', () => {
  it('renders the page title', () => {
    render(<CreateBrokerAppPage />);
    expect(screen.getByTestId('create-brokerapp-title')).toBeInTheDocument();
  });

  it('pre-populates the name field with the default value', () => {
    render(<CreateBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-name')).toHaveValue('my-messaging-app');
  });

  it('renders the create button', () => {
    render(<CreateBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-create-btn')).toBeInTheDocument();
  });

  it('renders the Resources section with all four resource input fields', () => {
    render(<CreateBrokerAppPage />);
    expect(screen.getByTestId('brokerapp-cpu-request')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-cpu-limit')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-memory-request')).toBeInTheDocument();
    expect(screen.getByTestId('brokerapp-memory-limit')).toBeInTheDocument();
  });
});

describe('CreateBrokerAppPage — isFormValid integration', () => {
  beforeEach(() => render(<CreateBrokerAppPage />));

  it('enables the create button with default valid state', () => {
    expect(screen.getByTestId('brokerapp-create-btn')).not.toBeDisabled();
  });

  it('disables the create button when the name is cleared', () => {
    fireEvent.change(screen.getByTestId('brokerapp-name'), { target: { value: '' } });
    expect(screen.getByTestId('brokerapp-create-btn')).toBeDisabled();
  });

  it('allows submission when only blank placeholder addresses exist', () => {
    expect(screen.getByTestId('brokerapp-create-btn')).not.toBeDisabled();
  });

  it('disables the create button when duplicate addresses exist', () => {
    fireEvent.click(screen.getByTestId('add-address-btn'));
    fireEvent.change(screen.getByTestId('address-name-input-1'), {
      target: { value: 'orders' },
    });
    fireEvent.click(screen.getByTestId('modal-done-btn'));
    fireEvent.click(screen.getByTestId('edit-address-0'));
    fireEvent.change(screen.getByTestId('address-name-input-0'), {
      target: { value: 'orders' },
    });
    fireEvent.click(screen.getByTestId('modal-done-btn'));
    expect(screen.getByTestId('brokerapp-create-btn')).toBeDisabled();
  });
});

const buildYaml = (spec: Record<string, unknown>) =>
  jsYaml.dump({
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'test', namespace: 'test-ns' },
    spec,
  });

const getOnYamlSave = (): ((yaml: string) => void | Promise<void>) => {
  if (!capturedOnYamlSave) throw new Error('onYamlSave was not captured — render first');
  return capturedOnYamlSave;
};

describe('CreateBrokerAppPage — YAML submit path', () => {
  beforeEach(() => render(<CreateBrokerAppPage />));

  it('rejects YAML with overlapping private and shared addresses', () => {
    expect(() =>
      getOnYamlSave()(
        buildYaml({
          addresses: [{ address: 'overlap' }],
          sharedAddresses: [{ address: 'overlap' }],
        }),
      ),
    ).toThrow('Address "overlap" cannot appear in both spec.addresses and spec.sharedAddresses');
  });

  it('rejects YAML with duplicate addresses in spec.addresses', () => {
    expect(() =>
      getOnYamlSave()(buildYaml({ addresses: [{ address: 'orders' }, { address: 'orders' }] })),
    ).toThrow('Duplicate address "orders"');
  });

  it('rejects YAML with duplicate addresses in spec.sharedAddresses', () => {
    expect(() =>
      getOnYamlSave()(
        buildYaml({ sharedAddresses: [{ address: 'events' }, { address: 'events' }] }),
      ),
    ).toThrow('Duplicate address "events"');
  });
});
