import type { FC } from 'react';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { k8sUpdate, useAccessReview } from '@openshift-console/dynamic-plugin-sdk';
import { ActionGroup, Alert, Button } from '@patternfly/react-core';
import { BrokerAppModel } from '../../../../../k8s/models';
import type { BrokerAppCR } from '../../../../../k8s/types';
import {
  brokerAppReducer,
  createInitialBrokerAppState,
  BrokerAppFormStateContext,
  BrokerAppFormDispatchContext,
} from '../../../../../reducers/brokerapp/reducer';
import { AddressManager } from '../../../../createBrokerApp/components/AddressManager';

export interface AddressesSectionProps {
  /** Watched BrokerApp CR from the Details page — kept in sync with the API server. */
  brokerApp: BrokerAppCR;
}

/**
 * Inline address editor for the BrokerApp Details page.
 * Reuses AddressManager from the Create/Edit flow, wrapping it in its own
 * reducer context so address changes can be persisted independently.
 *
 * When the watched CR updates externally and there are no pending local edits,
 * the reducer is re-synced automatically. Pending edits are preserved until
 * the user saves or cancels.
 */
export const AddressesSection: FC<AddressesSectionProps> = ({ brokerApp }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const namespace = brokerApp.metadata?.namespace ?? '';

  const [canUpdate] = useAccessReview({
    group: 'broker.arkmq.org',
    resource: 'brokerapps',
    namespace,
    verb: 'update',
  });

  const [formState, dispatch] = useReducer(brokerAppReducer, brokerApp, (cr) =>
    brokerAppReducer(createInitialBrokerAppState(namespace), {
      type: 'SET_MODEL',
      payload: cr,
      resetChanges: true,
    }),
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  const lastSyncedVersionRef = useRef(brokerApp.metadata?.resourceVersion);

  // Re-sync from the watched CR when the resource version changes and
  // the user has no pending edits. This reacts to external K8s API updates.
  useEffect(() => {
    const currentVersion = brokerApp.metadata?.resourceVersion;
    if (currentVersion !== lastSyncedVersionRef.current) {
      lastSyncedVersionRef.current = currentVersion;
      if (!formState.hasChanges) {
        dispatch({ type: 'SET_MODEL', payload: brokerApp, resetChanges: true });
      }
    }
  }, [brokerApp, formState.hasChanges]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await k8sUpdate({ model: BrokerAppModel, data: formState.cr });
      dispatch({ type: 'SET_MODEL', payload: formState.cr, resetChanges: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('Failed to save addresses.'));
    } finally {
      setSaving(false);
    }
  }, [formState.cr, t]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'SET_MODEL', payload: brokerApp, resetChanges: true });
    lastSyncedVersionRef.current = brokerApp.metadata?.resourceVersion;
    setSaveError(undefined);
  }, [brokerApp]);

  return (
    <div data-test="broker-app-addresses-section">
      <BrokerAppFormStateContext.Provider value={formState}>
        <BrokerAppFormDispatchContext.Provider value={dispatch}>
          <AddressManager />
        </BrokerAppFormDispatchContext.Provider>
      </BrokerAppFormStateContext.Provider>
      {saveError && (
        <Alert
          variant="danger"
          isInline
          title={t('Save failed')}
          className="pf-v6-u-mt-md"
          data-test="addresses-save-error"
        >
          {saveError}
        </Alert>
      )}
      {formState.hasChanges && (
        <ActionGroup className="pf-v6-u-mt-md">
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            isDisabled={!canUpdate || saving}
            isLoading={saving}
            data-test="addresses-save-btn"
          >
            {t('Save')}
          </Button>
          <Button
            variant="link"
            onClick={handleCancel}
            isDisabled={saving}
            data-test="addresses-cancel-btn"
          >
            {t('Cancel')}
          </Button>
        </ActionGroup>
      )}
    </div>
  );
};
