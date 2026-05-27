import * as React from 'react';
import { render, screen } from '@testing-library/react';
import CreateBrokerAppPage from './CreateBrokerAppPage';

jest.mock('react-router', () => ({
  useParams: jest.fn(() => ({ ns: 'test-ns' })),
  useNavigate: jest.fn(() => jest.fn()),
}));

/**
 * ResourceFormEditor contains a YAML editor (Monaco/CodeMirror) that cannot run
 * in jsdom. Mocked here to render children and the submit button only, so
 * CreateBrokerAppPage form sections remain testable without the editor dependency.
 */
jest.mock('../../shared-components/ResourceFormEditor', () => ({
  ResourceFormEditor: ({
    children,
    createButtonTestId,
  }: {
    children: React.ReactNode;
    createButtonTestId?: string;
  }) => (
    <>
      {children}
      <button data-test={createButtonTestId}>Create</button>
    </>
  ),
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
});
