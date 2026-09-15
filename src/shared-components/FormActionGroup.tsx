import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ActionGroup, Button, EmptyState, EmptyStateBody } from '@patternfly/react-core';

interface FormActionGroupProps {
  isSubmitting: boolean;
  isFormValid?: boolean;
  submitError?: string;
  onSubmit: () => void;
  onCancel: () => void;
  mode?: 'create' | 'edit';
  onReload?: () => void;
  isReloading?: boolean;
  createButtonTestId?: string;
  saveButtonTestId?: string;
  reloadButtonTestId?: string;
  cancelButtonTestId?: string;
}

export const FormActionGroup: React.FC<FormActionGroupProps> = ({
  isSubmitting,
  isFormValid = true,
  submitError,
  onSubmit,
  onCancel,
  mode = 'create',
  onReload,
  isReloading = false,
  createButtonTestId,
  saveButtonTestId,
  reloadButtonTestId,
  cancelButtonTestId,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const isEditMode = mode === 'edit';

  return (
    <>
      {submitError && (
        <EmptyState headingLevel="h4" titleText={t('An error occurred')} status="danger">
          <EmptyStateBody>{submitError}</EmptyStateBody>
        </EmptyState>
      )}
      <ActionGroup>
        <Button
          type="button"
          variant="primary"
          onClick={onSubmit}
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !isFormValid}
          data-test={isEditMode ? saveButtonTestId : createButtonTestId}
        >
          {isEditMode ? t('Save') : t('Create')}
        </Button>
        {isEditMode && onReload && (
          <Button
            type="button"
            variant="secondary"
            onClick={onReload}
            isLoading={isReloading}
            isDisabled={isSubmitting || isReloading}
            data-test={reloadButtonTestId}
          >
            {t('Reload')}
          </Button>
        )}
        <Button
          type="button"
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
