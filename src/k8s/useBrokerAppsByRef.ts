import { useMemo } from 'react';
import { useK8sWatchResources } from '@openshift-console/dynamic-plugin-sdk';
import type { WatchK8sResource } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerAppModel } from './models';
import type { BrokerAppCR } from './types';

export interface BrokerAppRef {
  namespace: string;
  name: string;
}

/**
 * Watches a known set of BrokerApps, each in its own namespace. Tenants are kept
 * apart by namespace, so reading an app elsewhere needs a get in that namespace, not
 * a cluster-wide list the viewer may not be allowed.
 *
 * @param refs - The apps to watch; order and duplicates do not matter
 * @returns The apps that loaded, whether every watch settled, and the first load error
 */
export function useBrokerAppsByRef(refs: BrokerAppRef[]): [BrokerAppCR[], boolean, unknown] {
  const refsKey = Array.from(new Set(refs.map((ref) => `${ref.namespace}/${ref.name}`)))
    .sort()
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
