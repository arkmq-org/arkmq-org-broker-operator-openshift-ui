import { useMemo } from 'react';
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk';
import type { WatchK8sResource } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerAppModel } from '../../../../../k8s/models';
import type { BrokerAppCR, BrokerService } from '../../../../../k8s/types';

export interface ProvisionedAppRef {
  namespace: string;
  name: string;
  generation: number;
}

/**
 * Parses a `<namespace>/<name>@<generation>` string from status.provisionedApps.
 * Returns null for malformed entries so callers can filter gracefully.
 */
export function parseProvisionedAppRef(entry: string): ProvisionedAppRef | null {
  const slashIdx = entry.indexOf('/');
  const atIdx = entry.indexOf('@');
  if (slashIdx < 1 || atIdx <= slashIdx + 1) {
    return null;
  }
  const namespace = entry.slice(0, slashIdx);
  const name = entry.slice(slashIdx + 1, atIdx);
  const generation = parseInt(entry.slice(atIdx + 1), 10);
  if (!name || isNaN(generation)) {
    return null;
  }
  return { namespace, name, generation };
}

/**
 * The apps a BrokerService serves, as its status names them. Malformed entries
 * are skipped.
 *
 * @param brokerService - The service whose status names its apps
 * @returns The namespace, name and applied generation of each app
 */
export function boundAppRefs(brokerService?: BrokerService): ProvisionedAppRef[] {
  return (brokerService?.status?.provisionedApps ?? [])
    .map(parseProvisionedAppRef)
    .filter((ref): ref is ProvisionedAppRef => ref !== null);
}

/**
 * Namespaces of the apps a BrokerService serves. Each app's queues are filed
 * there, so reading them needs access to these namespaces alone, not to the
 * whole cluster.
 */
export function boundAppNamespaces(brokerService?: BrokerService): string[] {
  return Array.from(new Set(boundAppRefs(brokerService).map((ref) => ref.namespace))).sort();
}

/**
 * The BrokerApps a BrokerService serves. Its status names them, so each is watched
 * in its own namespace: an app binds to a service in another namespace, which is
 * how tenants are kept apart, and reading it needs no cluster-wide listing.
 */
export function useBoundBrokerApps(
  brokerService?: BrokerService,
): [BrokerAppCR[], boolean, unknown] {
  const refsKey = boundAppRefs(brokerService)
    .map((ref) => `${ref.namespace}/${ref.name}`)
    .join(',');

  const resources = useMemo(() => {
    const watched: Record<string, WatchK8sResource> = {};
    for (const key of refsKey ? refsKey.split(',') : []) {
      const [namespace, name] = key.split('/');
      watched[key] = {
        groupVersionKind: {
          group: BrokerAppModel.apiGroup,
          version: BrokerAppModel.apiVersion,
          kind: BrokerAppModel.kind,
        },
        name,
        namespace,
      };
    }
    return watched;
  }, [refsKey]);

  const results = useK8sWatchResources<Record<string, BrokerAppCR>>(resources);

  return useMemo(() => {
    const watches = Object.values(results);
    // a watch reports null data until its object has loaded, or when it cannot
    const apps = watches
      .map(({ data }) => data as BrokerAppCR | null | undefined)
      .filter((app): app is BrokerAppCR => Boolean(app?.metadata?.name));
    const loaded = watches.every((watch) => watch.loaded || watch.loadError);
    const loadError = watches.find((watch) => watch.loadError)?.loadError as unknown;
    return [apps, loaded, loadError];
  }, [results]);
}
