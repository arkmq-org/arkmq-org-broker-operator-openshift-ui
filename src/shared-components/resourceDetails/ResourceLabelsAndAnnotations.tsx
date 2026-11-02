import type { FC } from 'react';
import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { useAnnotationsModal, useLabelsModal } from '@openshift-console/dynamic-plugin-sdk';
import { Button, FormGroup, Label, LabelGroup, Stack, StackItem } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

export interface ResourceLabelsAndAnnotationsProps {
  /** CR whose labels and annotations are shown and edited. */
  resource: K8sResourceCommon;
  /** Optional read-only key=value map rendered above Labels (e.g. spec.serviceSelector.matchLabels). */
  selectorLabels?: Record<string, string>;
}

interface MetadataMapFieldProps {
  fieldId: string;
  label: string;
  entries?: Record<string, string>;
  emptyText: string;
  editLabel?: string;
  onEdit?: () => void;
  dataTest: string;
}

/**
 * One labels/annotations map as FormGroup + LabelGroup with Edit.
 * Kept private to this module so Labels and Annotations share markup without
 * an extra shared-components file.
 */
const MetadataMapField: FC<MetadataMapFieldProps> = ({
  fieldId,
  label,
  entries,
  emptyText,
  editLabel,
  onEdit,
  dataTest,
}) => {
  const pairs = Object.entries(entries ?? {});

  return (
    <FormGroup
      label={<span className="pf-v6-u-font-weight-bold">{label}</span>}
      fieldId={fieldId}
      data-test={dataTest}
    >
      <LabelGroup
        categoryName={label}
        numLabels={20}
        addLabelControl={
          onEdit ? (
            <Button variant="link" isInline onClick={onEdit} data-test={`${fieldId}-edit`}>
              {editLabel}
            </Button>
          ) : undefined
        }
      >
        {pairs.length === 0 ? (
          <Label isCompact>{emptyText}</Label>
        ) : (
          pairs.map(([key, value]) => (
            <Label key={`${key}=${value}`} color="grey">
              {value ? `${key}=${value}` : key}
            </Label>
          ))
        )}
      </LabelGroup>
    </FormGroup>
  );
};

/**
 * Shared Labels and Annotations fields for CR Overview tabs.
 * Opens console labels/annotations modals on Edit — reusable by BrokerService and BrokerApp.
 */
export const ResourceLabelsAndAnnotations: FC<ResourceLabelsAndAnnotationsProps> = ({
  resource,
  selectorLabels,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const launchLabelsModal = useLabelsModal(resource);
  const launchAnnotationsModal = useAnnotationsModal(resource);

  return (
    <Stack hasGutter data-test="resource-labels-and-annotations">
      {selectorLabels !== undefined && (
        <StackItem>
          <MetadataMapField
            fieldId="resource-selector-labels"
            label={t('Service Selector')}
            entries={selectorLabels}
            emptyText={t('No selector configured')}
            dataTest="resource-selector-labels-field"
          />
        </StackItem>
      )}
      <StackItem>
        <MetadataMapField
          fieldId="resource-labels"
          label={t('Labels')}
          entries={resource.metadata?.labels}
          emptyText={t('No labels')}
          editLabel={t('Edit')}
          onEdit={launchLabelsModal}
          dataTest="resource-labels-field"
        />
      </StackItem>
      <StackItem>
        <MetadataMapField
          fieldId="resource-annotations"
          label={t('Annotations')}
          entries={resource.metadata?.annotations}
          emptyText={t('No annotations')}
          editLabel={t('Edit')}
          onEdit={launchAnnotationsModal}
          dataTest="resource-annotations-field"
        />
      </StackItem>
    </Stack>
  );
};
