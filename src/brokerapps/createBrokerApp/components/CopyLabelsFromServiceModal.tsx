import type { FC } from 'react';
import { useState } from 'react';
import {
  Button,
  Checkbox,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import type { BrokerService } from '../../../k8s/types';
import { useBrokerAppFormDispatch } from '../../../reducers/brokerapp/reducer';
import { BrokerServiceLabelCards } from '../../../shared-components/copyLabelsFromBrokerService/BrokerServiceLabelCards';

export interface CopyLabelsFromServiceModalProps {
  /** Namespace whose BrokerServices are listed for label copying. */
  namespace: string;
  /** Closes the modal without changing form labels. */
  onClose: () => void;
}

/** Copies a chosen subset of a BrokerService's labels into the BrokerApp service selector. */
export const CopyLabelsFromServiceModal: FC<CopyLabelsFromServiceModalProps> = ({
  namespace,
  onClose,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const dispatch = useBrokerAppFormDispatch();

  const [selectedService, setSelectedService] = useState<BrokerService | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const labelEntries = Object.entries(selectedService?.metadata?.labels ?? {});
  const selectedServiceName = selectedService?.metadata?.name;

  const handleSelectService = (service: BrokerService) => {
    setSelectedService(service);
    // Pre-check every label so Confirm is useful when the user wants most of them.
    setSelectedKeys(new Set(Object.keys(service.metadata?.labels ?? {})));
  };

  const toggleKey = (key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (!selectedService) {
      return;
    }
    const labels = selectedService.metadata?.labels ?? {};
    const chosen: Record<string, string> = {};
    selectedKeys.forEach((key) => {
      if (key in labels) {
        chosen[key] = labels[key];
      }
    });
    dispatch({ type: 'COPY_MATCH_LABELS_FROM_SERVICE', payload: chosen });
    onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      variant={ModalVariant.small}
      data-test="copy-labels-from-service-modal"
    >
      <ModalHeader
        title={t('Copy labels from existing service')}
        description={t(
          'Select a BrokerService, then choose which of its labels to add to your service selector.',
        )}
      />
      <ModalBody>
        <Stack hasGutter>
          <StackItem>
            <BrokerServiceLabelCards
              namespace={namespace}
              selectedServiceName={selectedServiceName}
              onSelectService={handleSelectService}
            />
          </StackItem>
          {selectedService && (
            <StackItem data-test="copy-labels-checkbox-step">
              <Stack hasGutter>
                <StackItem>
                  <Title headingLevel="h3" size="md">
                    {t('Labels from {{name}}', { name: selectedServiceName ?? '' })}
                  </Title>
                  <FormHelperText>
                    <HelperText>
                      <HelperTextItem>
                        {t(
                          'Keys that already exist in your service selector will be skipped when you confirm.',
                        )}
                      </HelperTextItem>
                    </HelperText>
                  </FormHelperText>
                </StackItem>
                {labelEntries.length === 0 ? (
                  <StackItem>
                    <HelperText>
                      <HelperTextItem>{t('No labels')}</HelperTextItem>
                    </HelperText>
                  </StackItem>
                ) : (
                  labelEntries.map(([key, value]) => (
                    <StackItem key={key}>
                      <Checkbox
                        id={`copy-label-checkbox-${key}`}
                        data-test={`copy-label-checkbox-${key}`}
                        label={`${key}=${value}`}
                        isChecked={selectedKeys.has(key)}
                        onChange={(_event, checked) => {
                          toggleKey(key, checked);
                        }}
                      />
                    </StackItem>
                  ))
                )}
              </Stack>
            </StackItem>
          )}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleConfirm}
          isDisabled={!selectedService || selectedKeys.size === 0}
          data-test="copy-labels-modal-confirm"
        >
          {t('Copy selected labels')}
        </Button>
        <Button variant="link" onClick={onClose} data-test="copy-labels-modal-cancel">
          {t('Cancel')}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
