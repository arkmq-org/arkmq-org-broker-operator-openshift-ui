import { useMemo } from 'react';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerAppModel } from '../k8s/models';
import type { BrokerAppCR } from '../k8s/types';
import type { GateUniverse } from './gates';

export interface GateUniverseResult {
  universe: GateUniverse;
  /** Every BrokerApp the viewer can list, cluster-wide; owners of referenced addresses are found here. */
  apps: BrokerAppCR[];
  appsLoaded: boolean;
  appsError?: unknown;
  /** Set when the Project list could not be read; the universe then only knows namespaces that host an app. */
  projectsError?: unknown;
}

/**
 * The namespaces and BrokerApps a gate can be evaluated against. Projects give the
 * namespaces the viewer may see, including ones with no app yet, so an open door to
 * an empty namespace is still drawn; the BrokerApp list gives app-level candidates
 * and the owner apps of referenced addresses.
 *
 * Both watches are best effort: a viewer without list rights gets a universe reduced
 * to what the apps reveal, never an error page.
 */
export const useGateUniverse = (): GateUniverseResult => {
  const [projects, , projectsError] = useK8sWatchResource<K8sResourceCommon[]>({
    groupVersionKind: { group: 'project.openshift.io', version: 'v1', kind: 'Project' },
    isList: true,
  }) as [K8sResourceCommon[] | undefined, boolean, unknown];
  const [apps, appsLoaded, appsError] = useK8sWatchResource<BrokerAppCR[]>({
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    isList: true,
  }) as [BrokerAppCR[] | undefined, boolean, unknown];

  return useMemo(() => {
    const appList = Array.isArray(apps) ? apps : [];
    const appsByNamespace: Record<string, string[]> = {};
    for (const app of appList) {
      const namespace = app.metadata?.namespace;
      const name = app.metadata?.name;
      if (!namespace || !name) continue;
      appsByNamespace[namespace] = [...(appsByNamespace[namespace] ?? []), name].sort();
    }
    const namespaces = new Set<string>(Object.keys(appsByNamespace));
    if (Array.isArray(projects)) {
      for (const project of projects) {
        if (project.metadata?.name) namespaces.add(project.metadata.name);
      }
    }
    return {
      universe: { namespaces: Array.from(namespaces).sort(), appsByNamespace },
      apps: appList,
      appsLoaded: appsLoaded || Boolean(appsError),
      appsError,
      projectsError,
    };
  }, [projects, projectsError, apps, appsLoaded, appsError]);
};
