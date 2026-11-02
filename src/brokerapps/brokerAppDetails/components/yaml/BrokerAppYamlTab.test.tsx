import { render, screen } from '@testing-library/react';
import type { BrokerAppCR } from '../../../../k8s/types';
import { BrokerAppYamlTab } from './BrokerAppYamlTab';

const brokerApp: BrokerAppCR = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerApp',
  metadata: { name: 'my-app', namespace: 'default' },
  spec: { serviceSelector: {} },
};

describe('BrokerAppYamlTab', () => {
  it('renders nothing when obj is not provided', () => {
    const { container } = render(<BrokerAppYamlTab />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the YAML editor when obj is provided', () => {
    render(<BrokerAppYamlTab obj={brokerApp} />);
    expect(screen.getByTestId('broker-app-yaml-tab')).toBeInTheDocument();
    expect(screen.getByTestId('resource-yaml-editor')).toBeInTheDocument();
  });
});
