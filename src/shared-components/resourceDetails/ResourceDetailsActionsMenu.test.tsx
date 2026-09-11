import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  useAnnotationsModal,
  useDeleteModal,
  useLabelsModal,
} from '@openshift-console/dynamic-plugin-sdk';
import { BrokerServiceModel } from '../../k8s/models';
import type { BrokerService } from '../../k8s/types';
import { ResourceDetailsActionsMenu } from './ResourceDetailsActionsMenu';

const mockNavigate = jest.fn();
jest.mock('react-router', () => ({
  useNavigate: jest.fn(() => mockNavigate),
}));

const mockUseLabelsModal = useLabelsModal as jest.Mock;
const mockUseAnnotationsModal = useAnnotationsModal as jest.Mock;
const mockUseDeleteModal = useDeleteModal as jest.Mock;

const brokerService: BrokerService = {
  apiVersion: 'broker.arkmq.org/v1beta2',
  kind: 'BrokerService',
  metadata: { name: 'my-broker-service', namespace: 'default' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseLabelsModal.mockReturnValue(jest.fn());
  mockUseAnnotationsModal.mockReturnValue(jest.fn());
  mockUseDeleteModal.mockReturnValue(jest.fn());
});

describe('ResourceDetailsActionsMenu', () => {
  it('renders the Actions menu with labels, annotations, edit, and delete items', async () => {
    const user = userEvent.setup();
    render(
      <ResourceDetailsActionsMenu
        resource={brokerService}
        model={BrokerServiceModel}
        editActionLabel="Edit BrokerService"
        deleteActionLabel="Delete BrokerService"
        listPath="/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService"
      />,
    );

    await user.click(screen.getByTestId('resource-details-actions-default-my-broker-service'));

    expect(screen.getByText('Edit labels')).toBeInTheDocument();
    expect(screen.getByText('Edit annotations')).toBeInTheDocument();
    expect(screen.getByText('Edit BrokerService')).toBeInTheDocument();
    expect(screen.getByText('Delete BrokerService')).toBeInTheDocument();
  });

  it('uses editFormPath as the edit destination when provided', async () => {
    const user = userEvent.setup();
    render(
      <ResourceDetailsActionsMenu
        resource={brokerService}
        model={BrokerServiceModel}
        editActionLabel="Edit BrokerService"
        deleteActionLabel="Delete BrokerService"
        listPath="/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService"
        editFormPath="/k8s/ns/default/brokerservices/my-broker-service/edit"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit BrokerService' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/k8s/ns/default/brokerservices/my-broker-service/edit',
    );
  });

  it('launches console modals for labels, annotations, and delete', async () => {
    const launchLabelsModal = jest.fn();
    const launchAnnotationsModal = jest.fn();
    const launchDeleteModal = jest.fn();
    mockUseLabelsModal.mockReturnValue(launchLabelsModal);
    mockUseAnnotationsModal.mockReturnValue(launchAnnotationsModal);
    mockUseDeleteModal.mockReturnValue(launchDeleteModal);

    const user = userEvent.setup();
    render(
      <ResourceDetailsActionsMenu
        resource={brokerService}
        model={BrokerServiceModel}
        editActionLabel="Edit BrokerService"
        deleteActionLabel="Delete BrokerService"
        listPath="/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit labels' }));
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit annotations' }));
    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete BrokerService' }));

    expect(launchLabelsModal).toHaveBeenCalledTimes(1);
    expect(launchAnnotationsModal).toHaveBeenCalledTimes(1);
    expect(launchDeleteModal).toHaveBeenCalledTimes(1);
    expect(mockUseDeleteModal).toHaveBeenCalledWith(
      brokerService,
      '/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService',
    );
  });

  it('falls back to YAML edit path when editFormPath is not provided', async () => {
    const user = userEvent.setup();
    render(
      <ResourceDetailsActionsMenu
        resource={brokerService}
        model={BrokerServiceModel}
        editActionLabel="Edit BrokerService"
        deleteActionLabel="Delete BrokerService"
        listPath="/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit BrokerService' }));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService/my-broker-service/yaml',
    );
  });

  it('returns null when the resource is being deleted', () => {
    const { container } = render(
      <ResourceDetailsActionsMenu
        resource={{
          ...brokerService,
          metadata: {
            ...brokerService.metadata,
            deletionTimestamp: '2026-01-01T00:00:00Z',
          },
        }}
        model={BrokerServiceModel}
        editActionLabel="Edit BrokerService"
        deleteActionLabel="Delete BrokerService"
        listPath="/k8s/ns/default/broker.arkmq.org~v1beta2~BrokerService"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
