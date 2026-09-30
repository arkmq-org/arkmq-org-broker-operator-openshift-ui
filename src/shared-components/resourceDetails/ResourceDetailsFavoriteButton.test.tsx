import { render, screen } from '@testing-library/react';
import { useActivePerspective, useUserPreference } from '@openshift-console/dynamic-plugin-sdk';
import { MemoryRouter } from 'react-router';
import { ResourceDetailsFavoriteButton } from './ResourceDetailsFavoriteButton';

const mockUseUserPreference = useUserPreference as jest.Mock;
const mockUseActivePerspective = useActivePerspective as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseActivePerspective.mockReturnValue(['admin', jest.fn()]);
  mockUseUserPreference.mockReturnValue([[], jest.fn(), true]);
});

describe('ResourceDetailsFavoriteButton', () => {
  it('renders the favorite button in the admin perspective', () => {
    render(
      <MemoryRouter>
        <ResourceDetailsFavoriteButton defaultName="my-broker-service" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('resource-details-favorite-button')).toBeInTheDocument();
    expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument();
  });

  it('does not render outside the admin perspective', () => {
    mockUseActivePerspective.mockReturnValue(['dev', jest.fn()]);
    const { container } = render(
      <MemoryRouter>
        <ResourceDetailsFavoriteButton defaultName="my-broker-service" />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders while the favorites preference has not loaded', () => {
    mockUseUserPreference.mockReturnValue([undefined, jest.fn(), false]);
    render(
      <MemoryRouter>
        <ResourceDetailsFavoriteButton defaultName="my-broker-service" />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument();
  });

  it('shows remove from favorites when the current path is already saved', () => {
    mockUseUserPreference.mockReturnValue([
      [{ name: 'my-broker-service', url: '/k8s/ns/default/brokerservices/my-broker-service' }],
      jest.fn(),
      true,
    ]);

    render(
      <MemoryRouter initialEntries={['/k8s/ns/default/brokerservices/my-broker-service']}>
        <ResourceDetailsFavoriteButton defaultName="my-broker-service" />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Remove from favorites')).toBeInTheDocument();
  });
});
