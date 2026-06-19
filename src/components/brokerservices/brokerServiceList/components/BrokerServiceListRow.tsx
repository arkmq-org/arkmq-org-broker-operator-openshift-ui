import {
  getGroupVersionKindForModel,
  ResourceLink,
  Timestamp,
} from '@openshift-console/dynamic-plugin-sdk';
import { Label, LabelGroup } from '@patternfly/react-core';
import type { DataViewTr } from '@patternfly/react-data-view';
import { BrokerServiceModel } from '../../../../k8s/models';
import type { BrokerService } from '../../../../k8s/types';

const MAX_VISIBLE_LABELS = 3;

export function BrokerServiceListRow(service: BrokerService): DataViewTr {
  const name = service.metadata?.name;
  const namespace = service.metadata?.namespace;
  const creationTimestamp = service.metadata?.creationTimestamp;
  const labels = service.metadata?.labels ?? {};
  const labelEntries = Object.entries(labels);
  const readyCondition = service.status?.conditions?.find(
    (condition) => condition.type === 'Ready',
  );
  const statusValue = readyCondition?.status ?? '-';

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
          '-'
        ),
    },
    {
      cell: namespace ? (
        <ResourceLink
          groupVersionKind={{ version: 'v1', kind: 'Namespace' }}
          name={namespace}
          dataTest={`namespace-link-${namespace}`}
        />
      ) : (
        '-'
      ),
    },
    {
      cell: (
        <Label
          color={statusValue === 'True' ? 'green' : statusValue === 'False' ? 'orange' : 'grey'}
          data-test={`broker-service-status-${namespace ?? ''}-${name ?? ''}`}
        >
          {statusValue}
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
                {key}={value}
              </Label>
            ))}
          </LabelGroup>
        ),
    },
    {
      cell: creationTimestamp ? <Timestamp timestamp={creationTimestamp} /> : '-',
    },
  ];
}
