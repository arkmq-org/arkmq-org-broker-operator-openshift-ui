import type { FC } from 'react';
import { useState } from 'react';
import type { ButtonProps } from '@patternfly/react-core';
import {
  Button,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { useActivePerspective, useUserPreference } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import './resource-details-favorite-button.css';

/** Console user-preference key shared with the core FavoriteButton. */
const FAVORITES_USER_PREFERENCE_KEY = 'console.favorites';

const MAX_FAVORITE_COUNT = 10;

interface FavoriteEntry {
  name: string;
  url: string;
}

export interface ResourceDetailsFavoriteButtonProps {
  /** Default label shown when the user adds the current page to favorites. */
  defaultName?: string;
}

/**
 * Add-to-favorites control for custom resource details pages.
 * Persists favorites through the console user-preference API so entries appear in the global favorites nav.
 */
export const ResourceDetailsFavoriteButton: FC<ResourceDetailsFavoriteButtonProps> = ({
  defaultName,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { pathname: currentUrlPath } = useLocation();
  const [activePerspective] = useActivePerspective();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [favorites, setFavorites, loaded] = useUserPreference<FavoriteEntry[] | undefined>(
    FAVORITES_USER_PREFERENCE_KEY,
    [],
    true,
  );

  if (activePerspective !== 'admin') {
    return null;
  }
  // the in-cluster console reads preferences from a ConfigMap, undefined until loaded
  const favoriteEntries = favorites ?? [];
  const isStarred = loaded && favoriteEntries.some((favorite) => favorite.url === currentUrlPath);
  const alphanumericRegex = /^[a-zA-Z0-9\s-]*$/;

  const handleFavoriteButtonClick: ButtonProps['onClick'] = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isStarred) {
      setFavorites(favoriteEntries.filter((favorite) => favorite.url !== currentUrlPath));
      return;
    }

    const currentUrlSplit = currentUrlPath.includes('~')
      ? currentUrlPath.split('~')
      : currentUrlPath.split('/');
    const sanitizedDefaultName = (
      defaultName ?? currentUrlSplit.slice(-1)[0].split('?')[0]
    ).replace(/[^a-zA-Z0-9\s-]/g, '-');
    setName(sanitizedDefaultName);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setError(null);
    setName('');
    setIsModalOpen(false);
  };

  const handleConfirmStar = (event?: React.FormEvent) => {
    event?.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(t('Name is required.'));
      return;
    }
    if (!alphanumericRegex.test(trimmedName)) {
      setError(t('Name can only contain letters, numbers, spaces, and hyphens.'));
      return;
    }
    if (favoriteEntries.some((favorite) => favorite.name === trimmedName)) {
      setError(
        t(
          'The name {{favoriteName}} already exists in your favorites. Choose a unique name to save to your favorites.',
          { favoriteName: trimmedName },
        ),
      );
      return;
    }

    setFavorites([...favoriteEntries, { name: trimmedName, url: currentUrlPath }]);
    setError(null);
    setName('');
    setIsModalOpen(false);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!alphanumericRegex.test(value)) {
      setError(t('Name can only contain letters, numbers, spaces, and hyphens.'));
    } else {
      setError(null);
    }
  };

  const isDisabled = favoriteEntries.length >= MAX_FAVORITE_COUNT && !isStarred;
  const disabledTooltipText = t(
    'Maximum number of favorites ({{maxCount}}) reached. To add another favorite, remove an existing page from your favorites.',
    { maxCount: MAX_FAVORITE_COUNT },
  );
  const tooltipText = isDisabled
    ? disabledTooltipText
    : isStarred
      ? t('Remove from favorites')
      : t('Add to favorites');

  return (
    <>
      <Tooltip content={tooltipText} position="top">
        <Button
          isFavorite
          isFavorited={isStarred}
          className="plugin__arkmq-org-broker-operator-openshift-ui__resource-details-favorite-button"
          data-test="resource-details-favorite-button"
          variant="plain"
          aria-label={tooltipText}
          aria-pressed={isStarred}
          onClick={handleFavoriteButtonClick}
          isDisabled={isDisabled || !loaded}
        />
      </Tooltip>

      {isModalOpen && (
        <Modal isOpen={isModalOpen} onClose={handleModalClose} variant={ModalVariant.small}>
          <ModalHeader title={t('Add to favorites')} />
          <ModalBody>
            <Form id="resource-details-favorite-form" onSubmit={handleConfirmStar}>
              <FormGroup label={t('Name')} isRequired fieldId="resource-details-favorite-name">
                <TextInput
                  id="resource-details-favorite-name"
                  data-test="resource-details-favorite-name-input"
                  name="name"
                  type="text"
                  onChange={(_event, value) => {
                    handleNameChange(value);
                  }}
                  value={name}
                  autoFocus
                  required
                />
                {error && (
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem variant="error">{error}</HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                )}
              </FormGroup>
            </Form>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={handleConfirmStar}
              form="resource-details-favorite-form"
            >
              {t('Save')}
            </Button>
            <Button variant="link" onClick={handleModalClose}>
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};
