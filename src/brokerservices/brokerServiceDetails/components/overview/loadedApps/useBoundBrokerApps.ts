import { useMemo } from 'react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerAppModel } from '../../../../../k8s/models';
import type { BrokerAppCR, BrokerService } from '../../../../../k8s/types';

/**
 * Filters BrokerApps bound to a BrokerService via status.service (not selectors).
 */
export function filterLoadedBrokerApps(
  apps: BrokerAppCR[],
  serviceName: string,
  serviceNamespace: string,
): BrokerAppCR[] {
  if (!serviceName || !serviceNamespace) {
    return [];
  }

  return apps.filter((app) => {
    const boundService = app.status?.service;
    return boundService?.name === serviceName && boundService.namespace === serviceNamespace;
  });
}

/**
 * BrokerApps bound to a BrokerService, from every namespace: an app binds to a
 * service in another namespace, which is how tenants are kept apart.
 */
export function useBoundBrokerApps(
  brokerService?: BrokerService,
): [BrokerAppCR[], boolean, unknown] {
  const serviceName = brokerService?.metadata?.name ?? '';
  const serviceNamespace = brokerService?.metadata?.namespace ?? '';

  const [apps, loaded, loadError] = useK8sWatchResource<BrokerAppCR[]>({
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    isList: true,
  }) as [BrokerAppCR[], boolean, unknown];

  const boundApps = useMemo(
    () => filterLoadedBrokerApps(Array.isArray(apps) ? apps : [], serviceName, serviceNamespace),
    [apps, serviceName, serviceNamespace],
  );

  return [boundApps, loaded, loadError];
}
