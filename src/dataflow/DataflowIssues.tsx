import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { HelperText, HelperTextItem } from '@patternfly/react-core';
import type { AppRef, DataflowGraph, DataflowIssue, DataflowRole } from './graph';

const refText = (ref: AppRef): string => `${ref.namespace}/${ref.name}`;

/**
 * Lists what is wrong in a dataflow graph as text, below the diagram: the SVG only
 * shows it as colours and tooltips, which neither a screen reader nor an e2e test can
 * read. Duplicates (the same refusal on two merged edges) are collapsed.
 */
export const DataflowIssues: FC<{ graph: DataflowGraph }> = ({ graph }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const roleText = (role: DataflowRole): string =>
    role === 'produce' ? t('producer') : t('consumer');
  const describe = (issue: DataflowIssue): string => {
    switch (issue.kind) {
      case 'ownerMissing':
        return t('Address {{address}} is owned by {{owner}}, which could not be read from here', {
          address: issue.address,
          owner: refText(issue.owner),
        });
      case 'ownerNotDeclaring':
        return t('{{owner}} does not declare address {{address}}', {
          owner: refText(issue.owner),
          address: issue.address,
        });
      case 'refused':
        return t('{{owner}} does not admit {{app}} as a {{role}} of {{address}}', {
          owner: refText(issue.owner),
          app: refText(issue.app),
          role: roleText(issue.role),
          address: issue.address,
        });
      case 'unknownGate':
        return t(
          'The {{role}} gate of {{owner}} on {{address}} cannot be evaluated here; the operator decides',
          { role: roleText(issue.role), owner: refText(issue.owner), address: issue.address },
        );
      case 'notDeployed':
        return `${refText(issue.app)}: ${issue.message}`;
    }
  };

  const seen = new Set<string>();
  const issues: DataflowIssue[] = [];
  const collect = (list: DataflowIssue[]) => {
    for (const issue of list) {
      const key = JSON.stringify(issue);
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(issue);
      }
    }
  };
  graph.nodes.forEach((node) => {
    if (node.kind === 'address') collect(node.issues);
  });
  graph.edges.forEach((edge) => {
    collect(edge.issues);
  });

  if (!issues.length) return null;
  return (
    <HelperText data-test="dataflow-issues">
      {issues.map((issue, i) => (
        <HelperTextItem
          key={i}
          variant={issue.kind === 'refused' || issue.kind === 'notDeployed' ? 'error' : 'warning'}
          data-test={`dataflow-issue-${issue.kind}`}
        >
          {describe(issue)}
        </HelperTextItem>
      ))}
    </HelperText>
  );
};
