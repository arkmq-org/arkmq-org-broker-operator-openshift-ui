import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  EmptyStateActions,
  EmptyStateBody,
  EmptyStateFooter,
  FormSection,
  HelperText,
  HelperTextItem,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import { PlusCircleIcon } from '@patternfly/react-icons';
import { TopologySideBar } from '@patternfly/react-topology';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import { DataflowDiagram } from '../../../dataflow/DataflowDiagram';
import { DataflowIssues } from '../../../dataflow/DataflowIssues';
import { DataflowLegend } from '../../../dataflow/DataflowLegend';
import { addressNodeId, buildDataflowGraph } from '../../../dataflow/graph';
import { toTopologyModel } from '../../../dataflow/topologyModel';
import { useGateUniverse } from '../../../dataflow/useGateUniverse';
import { AddressEditForm } from './AddressEditForm';

const ADDRESS_NODE_PREFIX = addressNodeId('');

interface Editing {
  index: number;
  /** A just-added entry; Cancel or clicking elsewhere drops it again. */
  isNew: boolean;
  /** Changes on every open so the form remounts and reads the entry afresh. */
  session: number;
}

/**
 * The address section of the BrokerApp form as a data flow diagram. The reducer
 * stays the single source of truth: the diagram is a projection of the CR being
 * edited, selecting an address box opens the edit form in the side panel, and the
 * form dispatches to the reducer on Done.
 *
 * A new entry has no box until it is named and saved, so its form opens at once and
 * a nameless entry can never be left behind: Done requires a name, Cancel removes it.
 */
export const AddressDataflowEditor: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const { universe, apps: allApps } = useGateUniverse();
  const [editing, setEditing] = useState<Editing | null>(null);
  const sessionRef = React.useRef(0);
  const openEditor = (index: number, isNew: boolean) => {
    sessionRef.current += 1;
    setEditing({ index, isNew, session: sessionRef.current });
  };

  const graph = useMemo(
    () => buildDataflowGraph({ apps: [state.cr], ownerApps: allApps, universe }),
    [state.cr, allApps, universe],
  );
  const anyNamespace = t('Any namespace');
  const model = useMemo(() => toTopologyModel(graph, { anyNamespace }), [graph, anyNamespace]);

  const editingEntry = editing ? state.addresses[editing.index] : undefined;
  const selectedIds = editingEntry?.address.trim()
    ? [addressNodeId(editingEntry.address.trim())]
    : [];

  const discardNewEntry = (): number => {
    if (editing?.isNew) {
      dispatch({ type: 'REMOVE_ADDRESS', payload: { index: editing.index } });
      return state.addresses.length - 1;
    }
    return state.addresses.length;
  };

  const handleAdd = () => {
    const nextIndex = discardNewEntry();
    dispatch({ type: 'ADD_ADDRESS' });
    openEditor(nextIndex, true);
  };

  const handleSelect = useCallback(
    (ids: string[]) => {
      const id = ids[0] as string | undefined;
      if (!id?.startsWith(ADDRESS_NODE_PREFIX)) return;
      const name = id.slice(ADDRESS_NODE_PREFIX.length);
      const index = state.addresses.findIndex((entry) => entry.address.trim() === name);
      if (index < 0) return;
      // The new entry is always the last one, so dropping it leaves this index intact.
      if (editing?.isNew) dispatch({ type: 'REMOVE_ADDRESS', payload: { index: editing.index } });
      openEditor(index, false);
    },

    [state.addresses, editing, dispatch],
  );

  const closeEditor = () => {
    discardNewEntry();
    setEditing(null);
  };

  const sideBar =
    editing && editingEntry ? (
      <TopologySideBar show resizable onClose={closeEditor} data-test="address-edit-panel">
        <div className="pf-v6-u-p-md">
          <Title headingLevel="h3" className="pf-v6-u-mb-md">
            {editingEntry.address.trim() || t('New address')}
          </Title>
          <AddressEditForm
            key={editing.session}
            index={editing.index}
            onSave={() => {
              setEditing(null);
            }}
            onCancel={closeEditor}
            onRemove={
              editing.isNew
                ? undefined
                : () => {
                    dispatch({ type: 'REMOVE_ADDRESS', payload: { index: editing.index } });
                    setEditing(null);
                  }
            }
          />
        </div>
      </TopologySideBar>
    ) : undefined;

  const addButton = (
    <Button
      variant="primary"
      icon={<PlusCircleIcon />}
      onClick={handleAdd}
      data-test="add-address-btn"
    >
      {t('Add address')}
    </Button>
  );

  return (
    <FormSection title={t('Addresses')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Addresses are the boxes, your namespace the arrow end. Click a box to edit it: owned addresses are provisioned with this app and opened to other apps through gates, referenced addresses belong to another app that must admit this one.',
          )}
        </HelperTextItem>
      </HelperText>
      <Toolbar inset={{ default: 'insetNone' }}>
        <ToolbarContent>
          <ToolbarItem>{addButton}</ToolbarItem>
        </ToolbarContent>
      </Toolbar>
      <DataflowDiagram
        model={model}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        sideBar={sideBar}
        dataTest="address-list"
        emptyState={
          <EmptyState
            headingLevel="h3"
            titleText={t('No addresses yet')}
            data-test="address-list-empty"
          >
            <EmptyStateBody>
              {t('Add the addresses this app produces to or consumes from.')}
            </EmptyStateBody>
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" onClick={handleAdd} data-test="add-address-empty-btn">
                  {t('Add address')}
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          </EmptyState>
        }
      />
      <DataflowLegend />
      <DataflowIssues graph={graph} />
    </FormSection>
  );
};
