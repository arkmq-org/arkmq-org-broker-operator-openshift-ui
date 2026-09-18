import type { DataViewTr } from '@patternfly/react-data-view';
import { Label, LabelGroup } from '@patternfly/react-core';
import {
  ErrorStatus,
  getGroupVersionKindForModel,
  ResourceLink,
  Timestamp,
} from '@openshift-console/dynamic-plugin-sdk';
import { BrokerServiceModel } from '../../../k8s/models';
import type { BrokerService } from '../../../k8s/types';
import {
  getReadyConditionDisplay,
  type ReadyConditionLabelKey,
} from '../../../shared-components/resourceList/getReadyConditionDisplay';
import { ResourceListRowActions } from '../../../shared-components/resourceList/ResourceListRowActions';

const MAX_VISIBLE_LABELS = 3;

export interface BrokerServiceListRowOptions {
  editActionLabel: string;
  deleteActionLabel: string;
  nameError: string;
  namespaceError: string;
  statusLabels: Record<ReadyConditionLabelKey, string>;
}

export const BrokerServiceListRow = (
  service: BrokerService,
  {
    editActionLabel,
    deleteActionLabel,
    nameError,
    namespaceError,
    statusLabels,
  }: BrokerServiceListRowOptions,
): DataViewTr => {
  const name = service.metadata?.name;
  const namespace = service.metadata?.namespace;
  const labels = service.metadata?.labels ?? {};
  const labelEntries = Object.entries(labels);
  const { labelKey, color } = getReadyConditionDisplay(service.status?.conditions);
  const listPath =
    name && namespace
      ? `/k8s/ns/${namespace}/${BrokerServiceModel.apiGroup ?? 'broker.arkmq.org'}~${BrokerServiceModel.apiVersion}~${BrokerServiceModel.kind}`
      : undefined;
  const editFormPath =
    listPath && name
      ? `${listPath}/${name}/edit?returnUrl=${encodeURIComponent(listPath)}`
      : undefined;

  return [
    {
      cell:
        name && namespace ? (
          <ResourceLink
            groupVersionKind={getGroupVersionKindForModel(BrokerServiceModel)}
            name={name}
            namespace={namespace}
            dataTest={`broker-service-link-${namespace}-${name}`}
          />
        ) : (
          <ErrorStatus title={nameError} />
        ),
    },
    {
      cell: namespace ? (
        <ResourceLink
          groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
          name={namespace}
          dataTest={`broker-service-namespace-link-${namespace}`}
        />
      ) : (
        <ErrorStatus title={namespaceError} />
      ),
    },
    {
      cell: (
        <Label color={color} data-test={`broker-service-status-${namespace ?? ''}-${name ?? ''}`}>
          {statusLabels[labelKey]}
        </Label>
      ),
    },
    {
      cell:
        labelEntries.length === 0 ? (
          '-'
        ) : (
          <LabelGroup numLabels={MAX_VISIBLE_LABELS}>
            {labelEntries.map(([key, value]) => (
              <Label key={`${key}=${value}`} color="grey">
                {key}: &quot;{value}&quot;
              </Label>
            ))}
          </LabelGroup>
        ),
    },
    {
      cell: service.metadata?.creationTimestamp ? (
        <Timestamp timestamp={service.metadata.creationTimestamp} />
      ) : (
        '-'
      ),
    },
    {
      cell: (
        <ResourceListRowActions
          resource={service}
          model={BrokerServiceModel}
          editActionLabel={editActionLabel}
          deleteActionLabel={deleteActionLabel}
          editFormPath={editFormPath}
          dataTest={name && namespace ? `broker-service-actions-${namespace}-${name}` : undefined}
        />
      ),
    },
  ];
};
