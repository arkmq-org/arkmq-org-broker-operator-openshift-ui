import { useMemo } from 'react';
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk';
import type { WatchK8sResource } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerAppModel } from '../../../../../k8s/models';
import type { BrokerAppCR, BrokerService } from '../../../../../k8s/types';

/**
 * The apps a BrokerService serves, as its status lists them: <namespace>/<name>,
 * which a slash splits back since neither part may contain one.
 */
export function boundAppRefs(brokerService?: BrokerService): { namespace: string; name: string }[] {
  return (brokerService?.status?.provisionedApps ?? []).flatMap((entry) => {
    const [namespace, name] = entry.split('/');
    return namespace && name ? [{ namespace, name }] : [];
  });
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
