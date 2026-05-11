import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ActionGroup, Button, EmptyState, EmptyStateBody } from '@patternfly/react-core';

type FormActionGroupProps = {
  isSubmitting: boolean;
  isFormValid?: boolean;
  submitError?: string;
  onSubmit: () => void;
  onCancel: () => void;
  createButtonTestId?: string;
  cancelButtonTestId?: string;
};

export const FormActionGroup: React.FC<FormActionGroupProps> = ({
  isSubmitting,
  isFormValid = true,
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
        <EmptyState headingLevel="h4" titleText={t('An error occurred')} status="danger">
          <EmptyStateBody>{submitError}</EmptyStateBody>
        </EmptyState>
      )}
      <ActionGroup>
        <Button
          variant="primary"
          onClick={onSubmit}
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !isFormValid}
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
