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
import { EnvelopeIcon, FolderIcon, PlusCircleIcon } from '@patternfly/react-icons';
import { TopologySideBar } from '@patternfly/react-topology';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import { DataflowDiagram } from '../../../dataflow/DataflowDiagram';
import { DataflowIssues } from '../../../dataflow/DataflowIssues';
import { DataflowLegend } from '../../../dataflow/DataflowLegend';
import { addressNodeId, buildDataflowGraph } from '../../../dataflow/graph';
import {
  DATAFLOW_CLASS,
  PALETTE_TYPE,
  type ConnectorTarget,
  type DataflowEditing,
  type PaletteItem,
} from '../../../dataflow/pipelineComponents';
import { connectionAction } from './dataflowConnections';
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
  const labels = useMemo(() => ({ anyNamespace: t('Any namespace'), anyApp: t('any app') }), [t]);

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

  const indexOfNode = useCallback(
    (nodeId: string): number => {
      if (!nodeId.startsWith(ADDRESS_NODE_PREFIX)) return -1;
      const name = nodeId.slice(ADDRESS_NODE_PREFIX.length);
      return state.addresses.findIndex((entry) => entry.address.trim() === name);
    },
    [state.addresses],
  );

  const editLabel = t('Edit address');
  const removeLabel = t('Remove address');
  const diagramEditing = useMemo<DataflowEditing>(
    () => ({
      labels: { edit: editLabel, remove: removeLabel },
      onEdit: (nodeId) => {
        handleSelect([nodeId]);
      },
      onRemove: (nodeId) => {
        const index = indexOfNode(nodeId);
        if (index < 0) return;
        if (editing && (editing.index === index || editing.isNew)) setEditing(null);
        dispatch({ type: 'REMOVE_ADDRESS', payload: { index } });
      },
      onConnect: (sourceId: string, target: ConnectorTarget) => {
        const self = {
          namespace: state.cr.metadata?.namespace ?? '',
          name: state.cr.metadata?.name ?? '',
        };
        const action = connectionAction(state.addresses, self, sourceId, target, universe);
        if (!action) return;
        if (action.type === 'ADD_ADDRESS') {
          handleAdd();
          return;
        }
        dispatch(action);
      },
      onDropPalette: (item: PaletteItem, nodeId?: string) => {
        if (item === 'address') {
          handleAdd();
          return;
        }
        // a namespace dropped on an address: open that address, its gates are there
        if (nodeId) handleSelect([nodeId]);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleAdd only reads state captured by the other deps
    [
      editLabel,
      removeLabel,
      handleSelect,
      indexOfNode,
      editing,
      dispatch,
      state.cr.metadata,
      state.addresses,
      universe,
    ],
  );

  const sideBar =
    editing && editingEntry ? (
      <TopologySideBar show resizable onClose={closeEditor} data-test="address-edit-panel">
        <div className={`${DATAFLOW_CLASS}-panel`}>
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
  // Palette items use the browser's drag and drop; a click is the keyboard-friendly way in.
  const paletteItem = (item: PaletteItem, icon: React.ReactNode, label: string) => (
    <Button
      variant="secondary"
      icon={icon}
      draggable
      onDragStart={(event: React.DragEvent) => {
        event.dataTransfer.setData(PALETTE_TYPE, item);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => {
        if (item === 'address') handleAdd();
      }}
      data-test={`palette-${item}`}
    >
      {label}
    </Button>
  );

  return (
    <FormSection title={t('Addresses')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Your certificate and your addresses sit in your box. Click an address to edit it, drag an arrow from your certificate to an address to produce, from an address to your certificate to consume, from an address to a namespace to let it consume, or drop a palette item on the diagram.',
          )}
        </HelperTextItem>
      </HelperText>
      <Toolbar inset={{ default: 'insetNone' }}>
        <ToolbarContent>
          <ToolbarItem>{addButton}</ToolbarItem>
          <ToolbarItem variant="label">{t('Drag onto the diagram')}</ToolbarItem>
          <ToolbarItem>{paletteItem('address', <EnvelopeIcon />, t('Address'))}</ToolbarItem>
          <ToolbarItem>{paletteItem('namespace', <FolderIcon />, t('Namespace'))}</ToolbarItem>
        </ToolbarContent>
      </Toolbar>
      <DataflowDiagram
        graph={graph}
        labels={labels}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        sideBar={sideBar}
        editing={diagramEditing}
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
      <DataflowLegend scope="app" />
      <DataflowIssues graph={graph} />
    </FormSection>
  );
};
