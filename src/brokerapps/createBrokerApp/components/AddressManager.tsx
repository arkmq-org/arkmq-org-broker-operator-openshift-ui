import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { PencilAltIcon, PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import { validateAddressEntries, validateDuplicateAddressEntries } from '../../../validation/k8s';
import { AddressEditModal } from './AddressEditModal';
import './AddressManager.css';

const PREFIX = 'plugin__arkmq-org-broker-operator-openshift-ui__address-manager';

const OWNERSHIP_COLORS = {
  private: 'blue',
  shared: 'yellow',
  external: 'grey',
} as const;

const OWNERSHIP_LABELS = {
  private: 'Private',
  shared: 'Shared',
  external: 'External',
} as const;

/** Card-grid form section for managing BrokerApp addresses. */
export const AddressManager: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  const requiredErrors = validateAddressEntries(state.addresses);
  const duplicateErrors = validateDuplicateAddressEntries(state.addresses);
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const [animatingIndex, setAnimatingIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isNewEntry, setIsNewEntry] = useState(false);

  const handleAdd = () => {
    setAnimatingIndex(state.addresses.length);
    dispatch({ type: 'ADD_ADDRESS' });
    setEditingIndex(state.addresses.length);
    setIsNewEntry(true);
  };

  const handleRemove = (index: number) => {
    dispatch({ type: 'REMOVE_ADDRESS', payload: { index } });

    setTouched((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });

    if (editingIndex !== null) {
      if (editingIndex === index) {
        setEditingIndex(null);
      } else if (editingIndex > index) {
        setEditingIndex(editingIndex - 1);
      }
    }
  };

  const handleSaveModal = () => {
    if (editingIndex !== null) {
      setTouched((prev) => new Set(prev).add(editingIndex));
    }
    setEditingIndex(null);
    setIsNewEntry(false);
  };

  // Discard unsaved changes when cancelled
  const handleCancelModal = () => {
    if (isNewEntry && editingIndex !== null) {
      dispatch({ type: 'REMOVE_ADDRESS', payload: { index: editingIndex } });
    }
    setEditingIndex(null);
    setIsNewEntry(false);
  };

  return (
    <FormSection title={t('Addresses')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Manage the addresses for this app. Private and shared addresses are provisioned on the broker. External addresses reference addresses owned by other apps.',
          )}
        </HelperTextItem>
      </HelperText>

      <div className={`${PREFIX}-grid`} data-test="address-list">
        {state.addresses.map((entry, index) => {
          const errorMessage =
            duplicateErrors[index] ?? (touched.has(index) ? requiredErrors[index] : undefined);

          return (
            <Card
              key={index}
              className={`${PREFIX}-card${animatingIndex === index ? ` ${PREFIX}-card--flip-in` : ''}${errorMessage ? ` ${PREFIX}-card--error` : ''}`}
              onAnimationEnd={() => {
                if (animatingIndex === index) setAnimatingIndex(null);
              }}
              data-test={`address-list-item-${String(index)}`}
            >
              <CardHeader
                actions={{
                  actions: (
                    <>
                      <Button
                        variant="plain"
                        aria-label={t('Edit address')}
                        onClick={() => {
                          setEditingIndex(index);
                          setIsNewEntry(false);
                        }}
                        icon={<PencilAltIcon />}
                        data-test={`edit-address-${String(index)}`}
                      />
                      <Button
                        variant="plain"
                        aria-label={t('Remove address')}
                        onClick={() => {
                          handleRemove(index);
                        }}
                        icon={<TimesIcon />}
                        data-test={`remove-address-${String(index)}`}
                      />
                    </>
                  ),
                  hasNoOffset: true,
                }}
              >
                <CardTitle className={!entry.address ? `${PREFIX}-card-name--empty` : undefined}>
                  {entry.address || t('New address')}
                </CardTitle>
              </CardHeader>
              <CardBody>
                <Stack hasGutter>
                  <StackItem>
                    {/* Ownership, two directions, Pub/Sub and the owner: never collapse them. */}
                    <LabelGroup numLabels={5}>
                      <Label color={OWNERSHIP_COLORS[entry.ownership]} isCompact>
                        {t(OWNERSHIP_LABELS[entry.ownership])}
                      </Label>
                      {(entry.direction === 'produces' || entry.direction === 'both') && (
                        <Label color="green" isCompact>
                          {t('Produces')}
                        </Label>
                      )}
                      {(entry.direction === 'consumes' || entry.direction === 'both') && (
                        <Label color="orange" isCompact>
                          {t('Consumes')}
                        </Label>
                      )}
                      {!!entry.pubSub && (
                        <Label color="teal" isCompact>
                          {t('Pub/Sub')}
                        </Label>
                      )}
                      {!!(entry.appName && entry.appNamespace) && (
                        <Label color="purple" isCompact>
                          {entry.appNamespace}/{entry.appName}
                        </Label>
                      )}
                    </LabelGroup>
                  </StackItem>
                  {entry.subscriptions && entry.subscriptions.length > 0 && (
                    <StackItem>
                      <LabelGroup numLabels={3}>
                        {entry.subscriptions.map((sub) => (
                          <Label key={sub} isCompact>
                            {sub}
                          </Label>
                        ))}
                      </LabelGroup>
                    </StackItem>
                  )}
                  {errorMessage && (
                    <StackItem>
                      <FormHelperText>
                        <HelperText>
                          <HelperTextItem variant="error">{t(errorMessage)}</HelperTextItem>
                        </HelperText>
                      </FormHelperText>
                    </StackItem>
                  )}
                </Stack>
              </CardBody>
            </Card>
          );
        })}

        <Card
          className={`${PREFIX}-add-card`}
          onClick={handleAdd}
          data-test="add-address-btn"
          isClickable
        >
          <CardBody className={`${PREFIX}-add-card-body`}>
            <PlusCircleIcon className={`${PREFIX}-add-card-icon`} />
            <span>{t('Add address')}</span>
          </CardBody>
        </Card>
      </div>

      {editingIndex !== null && editingIndex < state.addresses.length && (
        <AddressEditModal
          index={editingIndex}
          onSave={handleSaveModal}
          onCancel={handleCancelModal}
        />
      )}
    </FormSection>
  );
};
