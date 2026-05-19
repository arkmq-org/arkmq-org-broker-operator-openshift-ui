import { FC } from 'react';
import { ActionGroup, Alert, AlertVariant, Button } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

type FormActionGroupProps = {
  isSubmitting: boolean;
  isFormValid?: boolean;
  submitError?: string;
  onSubmit: () => void;
  onCancel: () => void;
  createButtonTestId?: string;
  cancelButtonTestId?: string;
};

export const FormActionGroup: FC<FormActionGroupProps> = ({
  isSubmitting,
  isFormValid,
  submitError,
  onSubmit,
  onCancel,
  createButtonTestId,
  cancelButtonTestId,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <>
      {submitError && (
        <Alert variant={AlertVariant.danger} title={t('Failed to create resource')} isInline>
          {submitError}
        </Alert>
      )}
      <ActionGroup>
        <Button
          variant="primary"
          onClick={onSubmit}
          isLoading={isSubmitting}
          isDisabled={isFormValid === false || isSubmitting}
          data-test={createButtonTestId}
        >
          {t('Create')}
        </Button>
        <Button
          variant="link"
          onClick={onCancel}
          isDisabled={isSubmitting}
          data-test={cancelButtonTestId}
        >
          {t('Cancel')}
        </Button>
      </ActionGroup>
    </>
  );
};
