import type { FC } from 'react';
import { useCallback } from 'react';
import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { useTranslation } from 'react-i18next';
import type { BrokerService, K8sResourceCondition } from '../../../../k8s/types';
import { getReadyConditionDisplay } from '../../../../shared-components/resourceList/getReadyConditionDisplay';
import type { ReadyConditionLabelKey } from '../../../../shared-components/resourceList/getReadyConditionDisplay';
import {
  OwnedResourceRow,
  ResourcesTable,
} from '../../../../shared-components/resourceDetails/resources/ResourcesTable';

const SECRET_GVK = { version: 'v1', kind: 'Secret' } as const;
const SERVICE_GVK = { version: 'v1', kind: 'Service' } as const;
const BROKER_GVK = { group: 'broker.arkmq.org', version: 'v1beta2', kind: 'Broker' } as const;

/** The set of Kubernetes resource kinds directly owned by a BrokerService and displayed in the Resources tab. */
type OwnedResourceKind = 'Broker' | 'Secret' | 'Service';

/** Converts a raw kind string from the SDK to a known OwnedResourceKind, or undefined if unrecognised. */
function toOwnedResourceKind(kind: string | undefined): OwnedResourceKind | undefined {
  if (kind === 'Broker' || kind === 'Secret' || kind === 'Service') {
    return kind;
  }
  return undefined;
}

export interface BrokerServiceResourcesTabProps {
  /** BrokerService CR passed by HorizontalNav. Optional to satisfy the SDK's ComponentType<{}> constraint; renders nothing when absent. */
  obj?: BrokerService;
}

/** Maps resource kind to the Description column label for direct BrokerService children. */
function ownedResourceDescription(
  kind: OwnedResourceKind | undefined,
  t: (key: string) => string,
): string {
  switch (kind) {
    case 'Broker':
      return t('Broker cluster for this service');
    case 'Secret':
      return t('Certificates and credentials');
    case 'Service':
      return t('Headless service for broker pods');
    case undefined:
      return '-';
  }
}

type OwnedResourceWithStatus = K8sResourceCommon & {
  status?: { conditions?: K8sResourceCondition[] };
};

/** Returns true when the resource's ownerReferences contain a BrokerService entry matching both name and UID. */
export function isOwnedByBrokerService(
  resource: K8sResourceCommon,
  serviceName: string,
  serviceUid: string,
): boolean {
  return (resource.metadata?.ownerReferences ?? []).some(
    (ref) => ref.kind === 'BrokerService' && ref.name === serviceName && ref.uid === serviceUid,
  );
}

/** Broker rows use Ready conditions; Secret and Service keep a static Created label. */
function ownedResourceStatusLabel(
  resource: OwnedResourceWithStatus,
  t: (key: string) => string,
): string {
  if (resource.kind === 'Broker') {
    const { labelKey } = getReadyConditionDisplay(resource.status?.conditions);
    const statusLabels: Record<ReadyConditionLabelKey, string> = {
      Running: t('Running'),
      Warning: t('Warning'),
      Failed: t('Failed'),
      Pending: t('Pending'),
      Draining: t('Draining'),
    };
    return statusLabels[labelKey];
  }
  return t('Created');
}

/** BrokerService Resources tab listing direct children: Broker CR, Secrets, and Services owned by this BrokerService. */
export const BrokerServiceResourcesTab: FC<BrokerServiceResourcesTabProps> = ({
  obj: brokerService,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const namespace = brokerService?.metadata?.namespace ?? '';
  const serviceName = brokerService?.metadata?.name ?? '';
  const serviceUid = brokerService?.metadata?.uid ?? '';

  const [brokers, brokersLoaded, brokersError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: BROKER_GVK,
    isList: true,
    namespaced: true,
    namespace,
  }) as [K8sResourceCommon[], boolean, unknown];

  const [secrets, secretsLoaded, secretsError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: SECRET_GVK,
    isList: true,
    namespaced: true,
    namespace,
  }) as [K8sResourceCommon[], boolean, unknown];

  const [services, servicesLoaded, servicesError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: SERVICE_GVK,
    isList: true,
    namespaced: true,
    namespace,
  }) as [K8sResourceCommon[], boolean, unknown];

  const ownedResources = [
    ...(Array.isArray(brokers) ? brokers : []).filter((r) =>
      isOwnedByBrokerService(r, serviceName, serviceUid),
    ),
    ...(Array.isArray(secrets) ? secrets : []).filter((r) =>
      isOwnedByBrokerService(r, serviceName, serviceUid),
    ),
    ...(Array.isArray(services) ? services : []).filter((r) =>
      isOwnedByBrokerService(r, serviceName, serviceUid),
    ),
  ];

  const loaded = brokersLoaded && secretsLoaded && servicesLoaded;
  const loadError = brokersError ?? secretsError ?? servicesError;

  const renderRow = useCallback(
    (resource: K8sResourceCommon) =>
      OwnedResourceRow(resource, {
        statusLabel: ownedResourceStatusLabel(resource, t),
        descriptionLabel: ownedResourceDescription(toOwnedResourceKind(resource.kind), t),
      }),
    [t],
  );

  return (
    <div data-test="broker-service-resources-tab">
      <ResourcesTable
        resources={ownedResources}
        loaded={loaded}
        loadError={loadError}
        renderRow={renderRow}
        dataTest="owned-resources"
      />
    </div>
  );
};
