import { useEffect, useState } from 'react';
import { checkAccess } from '@openshift-console/dynamic-plugin-sdk';

/**
 * The permission the console's metrics proxy checks before it runs a query in a
 * namespace: a viewer who cannot get pod metrics there has the query refused.
 *
 * @param namespace - The namespace the query is sent to
 */
export const metricsAccessIn = (namespace: string) => ({
  group: 'metrics.k8s.io',
  resource: 'pods',
  verb: 'get' as const,
  namespace,
});

/**
 * The namespaces among those given whose metrics the viewer is not allowed to
 * read. The charts leave those namespaces' series out without a word, so the
 * page asks the cluster rather than reading each chart's failures: a failed
 * query does not tell a refusal from Prometheus being down, and only a refusal
 * is something an administrator can grant.
 *
 * Empty until every review has answered; a review that fails is taken as
 * allowed, since nothing then says access is missing.
 *
 * @param namespaces - Namespaces the page's charts query
 * @returns The namespaces refused, sorted
 */
export function useNamespacesWithoutMetricsAccess(namespaces: string[]): string[] {
  const namespacesKey = Array.from(new Set(namespaces)).sort().join(',');
  const [refused, setRefused] = useState<{ key: string; namespaces: string[] }>({
    key: '',
    namespaces: [],
  });

  // access reviews are API calls; their answer is kept with the namespaces it is for
  useEffect(() => {
    const reviewed = namespacesKey ? namespacesKey.split(',') : [];
    if (reviewed.length === 0) {
      return undefined;
    }
    let current = true;
    void Promise.all(
      reviewed.map((namespace) =>
        checkAccess(metricsAccessIn(namespace)).then(
          (review) => (review.status?.allowed === false ? namespace : null),
          () => null,
        ),
      ),
    ).then((answers) => {
      if (current) {
        setRefused({
          key: namespacesKey,
          namespaces: answers.filter((namespace): namespace is string => namespace !== null),
        });
      }
    });
    return () => {
      current = false;
    };
  }, [namespacesKey]);

  // an answer for other namespaces than the page's current ones is stale
  return refused.key === namespacesKey ? refused.namespaces : [];
}
