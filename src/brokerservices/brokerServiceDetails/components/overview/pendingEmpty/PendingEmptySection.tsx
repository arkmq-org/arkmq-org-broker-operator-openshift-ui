import type { FC } from 'react';
import { getGroupVersionKindForModel, ResourceLink } from '@openshift-console/dynamic-plugin-sdk';
import { Flex, FlexItem, Spinner, Title } from '@patternfly/react-core';
import { Table, Thead, Tbody, Tr, Th, Td } from '@patternfly/react-table';
import { useTranslation } from 'react-i18next';
import { BrokerAppModel } from '../../../../../k8s/models';
import type { BrokerService, PendingEmptyAddressStatus } from '../../../../../k8s/types';

export interface PendingEmptySectionProps {
  /** BrokerService whose status.pendingEmpty entries are listed. */
  brokerService: BrokerService;
}

/**
 * Overview table of addresses draining messages before removal.
 * Hidden when status.pendingEmpty is absent or empty so the page stays
 * quiet when there is no drain in progress.
 */
export const PendingEmptySection: FC<PendingEmptySectionProps> = ({ brokerService }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const pendingEmpty = brokerService.status?.pendingEmpty;

  if (!pendingEmpty?.length) {
    return null;
  }

  return (
    <div data-test="broker-service-pending-empty">
      <Title headingLevel="h2" className="pf-v6-u-mb-md">
        {t('Addresses Pending Empty')}
      </Title>
      <Table aria-label={t('Addresses Pending Empty')} variant="compact">
        <Thead>
          <Tr>
            <Th>{t('App')}</Th>
            <Th>{t('Address / Queue')}</Th>
            <Th>{t('Message Count')}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {pendingEmpty.flatMap((entry) => (
            <PendingEmptyRows key={entry.app} entry={entry} />
          ))}
        </Tbody>
      </Table>
    </div>
  );
};

interface PendingEmptyRowsProps {
  /** One pendingEmpty status entry with its per-queue message counts. */
  entry: PendingEmptyAddressStatus;
}

/**
 * Rows for a single draining app: one row per queue in the messages map,
 * or a single placeholder row when no queue details are available yet.
 */
const PendingEmptyRows: FC<PendingEmptyRowsProps> = ({ entry }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const appIdentity = parseAppIdentity(entry.app);
  const messageEntries = Object.entries(entry.messages ?? {});

  if (messageEntries.length === 0) {
    return (
      <Tr data-test={`pending-empty-row-${entry.app}`}>
        <Td dataLabel={t('App')}>
          <AppLink appIdentity={appIdentity} rawApp={entry.app} />
        </Td>
        <Td dataLabel={t('Address / Queue')}>-</Td>
        <Td dataLabel={t('Message Count')}>-</Td>
      </Tr>
    );
  }

  return (
    <>
      {messageEntries.map(([queue, count]) => (
        <Tr key={`${entry.app}/${queue}`} data-test={`pending-empty-row-${entry.app}-${queue}`}>
          <Td dataLabel={t('App')}>
            <AppLink appIdentity={appIdentity} rawApp={entry.app} />
          </Td>
          <Td dataLabel={t('Address / Queue')}>
            <span data-test={`pending-empty-queue-${entry.app}-${queue}`}>{queue}</span>
          </Td>
          <Td dataLabel={t('Message Count')}>
            <MessageCount count={count} queue={queue} app={entry.app} />
          </Td>
        </Tr>
      ))}
    </>
  );
};

interface AppLinkProps {
  /** Parsed namespace/name from the app identity string, or null if unparseable. */
  appIdentity: { name: string; namespace: string } | null;
  /** Raw app identity string shown as fallback text. */
  rawApp: string;
}

/**
 * Renders a ResourceLink to the BrokerApp when the identity string
 * can be parsed as `namespace/name`, otherwise falls back to plain text.
 */
const AppLink: FC<AppLinkProps> = ({ appIdentity, rawApp }) =>
  appIdentity ? (
    <ResourceLink
      groupVersionKind={getGroupVersionKindForModel(BrokerAppModel)}
      name={appIdentity.name}
      namespace={appIdentity.namespace}
      dataTest={`pending-empty-app-link-${rawApp}`}
    />
  ) : (
    <span data-test={`pending-empty-app-text-${rawApp}`}>{rawApp}</span>
  );

interface MessageCountProps {
  /** Pending message count — a numeric string or `"unknown"`. */
  count: string;
  /** Queue name, used only for data-test attribute scoping. */
  queue: string;
  /** App identity, used only for data-test attribute scoping. */
  app: string;
}

/**
 * Renders the message count for a single queue. Values of `"unknown"`
 * (Jolokia not yet queried) display a spinner with "Querying..." text
 * instead of the raw string.
 */
const MessageCount: FC<MessageCountProps> = ({ count, queue, app }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  if (count === 'unknown') {
    return (
      <Flex
        spaceItems={{ default: 'spaceItemsSm' }}
        alignItems={{ default: 'alignItemsCenter' }}
        data-test={`pending-empty-count-${app}-${queue}`}
      >
        <FlexItem>
          <Spinner size="md" aria-label={t('Querying message count')} />
        </FlexItem>
        <FlexItem>{t('Querying...')}</FlexItem>
      </Flex>
    );
  }

  return <span data-test={`pending-empty-count-${app}-${queue}`}>{count}</span>;
};

/**
 * Splits a `namespace/name` app identity string into its parts.
 * Returns null for strings that do not contain a slash, so the caller
 * can fall back to plain-text display.
 *
 * @param app - Raw app identity from PendingEmptyAddressStatus
 * @returns Parsed name and namespace, or null
 */
function parseAppIdentity(app: string): { name: string; namespace: string } | null {
  const slashIndex = app.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }
  return {
    namespace: app.substring(0, slashIndex),
    name: app.substring(slashIndex + 1),
  };
}
