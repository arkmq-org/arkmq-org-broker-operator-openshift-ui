import * as React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import * as jsYaml from 'js-yaml';
import CreateBrokerAppPage from './CreateBrokerAppPage';

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ ns: 'test-ns' })),
  useNavigate: jest.fn(() => jest.fn()),
}));

let capturedOnYamlSave: ((yaml: string) => void | Promise<void>) | undefined;
let capturedOnSwitchToForm: ((yaml: string) => { ok: boolean; error?: string }) | undefined;

/**
 * ResourceFormEditor contains a YAML editor (Monaco/CodeMirror) that cannot run
 * in jsdom. Mocked here to render children and the submit button only, so
 * CreateBrokerAppPage form sections remain testable without the editor dependency.
 *
 * isFormValid is forwarded to the button's disabled attribute so integration
 * tests can assert that validation state disables submission.
 *
 * onYamlSave and onSwitchToForm are captured so tests can invoke those paths directly.
 */
jest.mock('../../shared-components/ResourceFormEditor', () => ({
  ResourceFormEditor: ({
    children,
    createButtonTestId,
    isFormValid,
    onYamlSave,
    onSwitchToForm,
  }: {
    children: React.ReactNode;
    createButtonTestId?: string;
    isFormValid?: boolean;
    onYamlSave?: (yaml: string) => void | Promise<void>;
    onSwitchToForm?: (yaml: string) => { ok: boolean; error?: string };
  }) => {
    capturedOnYamlSave = onYamlSave;
    capturedOnSwitchToForm = onSwitchToForm;
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

const buildYaml = (spec: Record<string, unknown>) =>
  jsYaml.dump({
    apiVersion: 'broker.arkmq.org/v1beta2',
    kind: 'BrokerApp',
    metadata: { name: 'test', namespace: 'test-ns' },
    spec,
  });

const switchToForm = (yaml: string): { ok: boolean; error?: string } | undefined => {
  if (!capturedOnSwitchToForm) throw new Error('onSwitchToForm was not captured');
  const onSwitchToForm = capturedOnSwitchToForm;
  let result: { ok: boolean; error?: string } | undefined;
  act(() => {
    result = onSwitchToForm(yaml);
  });
  return result;
};

const getOnYamlSave = (): ((yaml: string) => void | Promise<void>) => {
  if (!capturedOnYamlSave) throw new Error('onYamlSave was not captured — render first');
  return capturedOnYamlSave;
};

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

  it('allows submission when no addresses exist', () => {
    expect(screen.getByTestId('brokerapp-create-btn')).not.toBeDisabled();
  });

  it('rejects YAML with duplicate addresses on switch to form', () => {
    const result = switchToForm(
      buildYaml({
        addresses: [{ address: 'orders' }, { address: 'orders' }],
        capabilities: [{ producerOf: [{ address: 'orders' }] }],
      }),
    );
    expect(result?.ok).toBe(false);
    expect(result?.error).toContain('Duplicate address "orders"');
  });

  it('rejects YAML with overlapping private and shared addresses on switch to form', () => {
    const result = switchToForm(
      buildYaml({
        addresses: [{ address: 'overlap' }],
        sharedAddresses: [{ address: 'overlap' }],
      }),
    );
    expect(result?.ok).toBe(false);
    expect(result?.error).toContain(
      'Address "overlap" cannot appear in both spec.addresses and spec.sharedAddresses',
    );
  });

  it('accepts valid YAML on switch to form', () => {
    const result = switchToForm(
      buildYaml({
        addresses: [{ address: 'orders' }],
        sharedAddresses: [{ address: 'events' }],
      }),
    );
    expect(result?.ok).toBe(true);
  });
});

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
