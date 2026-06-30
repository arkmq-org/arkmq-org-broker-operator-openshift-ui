import type { DataViewTr } from '@patternfly/react-data-view';
import { Label } from '@patternfly/react-core';
import {
  ErrorStatus,
  getGroupVersionKindForModel,
  ResourceLink,
  Timestamp,
} from '@openshift-console/dynamic-plugin-sdk';
import { BrokerAppModel, BrokerServiceModel } from '../../../k8s/models';
import type { BrokerAppCR } from '../../../k8s/types';
import {
  getReadyConditionDisplay,
  type ReadyConditionLabelKey,
} from '../../../shared-components/resourceList/getReadyConditionDisplay';
import { ResourceListRowActions } from '../../../shared-components/resourceList/ResourceListRowActions';

export interface BrokerAppListRowOptions {
  editActionLabel: string;
  deleteActionLabel: string;
  nameError: string;
  namespaceError: string;
  /** Maps the semantic state key to a translated display string. Running → 'Deployed'. */
  statusLabels: Record<ReadyConditionLabelKey, string>;
}

/**
 * Builds a DataViewTr row for a single BrokerApp.
 * Columns: Name, Namespace, Status, Provisioned To, Created, Actions.
 * Translated strings are passed in via options to keep this function pure.
 */
export const BrokerAppListRow = (
  app: BrokerAppCR,
  {
    editActionLabel,
    deleteActionLabel,
    nameError,
    namespaceError,
    statusLabels,
  }: BrokerAppListRowOptions,
): DataViewTr => {
  const name = app.metadata?.name;
  const namespace = app.metadata?.namespace;
  const boundService = app.status?.service;

  const { labelKey, color } = getReadyConditionDisplay(
    app.status?.conditions,
    'Deployed',
    'Pending',
  );

  return [
    {
      cell:
        name && namespace ? (
          <ResourceLink
            groupVersionKind={getGroupVersionKindForModel(BrokerAppModel)}
            name={name}
            namespace={namespace}
            dataTest={`brokerapp-link-${namespace}-${name}`}
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
          dataTest={`brokerapp-namespace-link-${namespace}`}
        />
      ) : (
        <ErrorStatus title={namespaceError} />
      ),
    },
    {
      cell: (
        <Label color={color} data-test={`brokerapp-status-${namespace ?? ''}-${name ?? ''}`}>
          {statusLabels[labelKey]}
        </Label>
      ),
    },
    {
      cell: boundService ? (
        <span data-test={`provisioned-service-link-${name ?? ''}`}>
          <ResourceLink
            groupVersionKind={getGroupVersionKindForModel(BrokerServiceModel)}
            name={boundService.name}
            namespace={boundService.namespace}
          />
        </span>
      ) : (
        <span data-test={`brokerapp-no-service-${namespace ?? ''}-${name ?? ''}`}>{'—'}</span>
      ),
    },
    {
      cell: app.metadata?.creationTimestamp ? (
        <Timestamp timestamp={app.metadata.creationTimestamp} />
      ) : (
        '-'
      ),
    },
    {
      cell: (
        <ResourceListRowActions
          resource={app}
          model={BrokerAppModel}
          editActionLabel={editActionLabel}
          deleteActionLabel={deleteActionLabel}
          dataTest={name && namespace ? `brokerapp-actions-${namespace}-${name}` : undefined}
        />
      ),
    },
  ];
};
