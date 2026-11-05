import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FormSection,
  HelperText,
  HelperTextItem,
  Title,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import {
  BroadcastTowerIcon,
  CubeIcon,
  EnvelopeIcon,
  FolderIcon,
  PlusCircleIcon,
} from '@patternfly/react-icons';
import { TopologySideBar } from '@patternfly/react-topology';
import {
  useBrokerAppFormDispatch,
  useBrokerAppFormState,
} from '../../../reducers/brokerapp/reducer';
import { DataflowDiagram } from '../../../dataflow/DataflowDiagram';
import { DataflowIssues } from '../../../dataflow/DataflowIssues';
import { DataflowLegend } from '../../../dataflow/DataflowLegend';
import {
  addressNodeId,
  appNodeId,
  buildDataflowGraph,
  namespaceNodeId,
  type AppRef,
  type DataflowNode,
} from '../../../dataflow/graph';
import {
  DATAFLOW_CLASS,
  PALETTE_TYPE,
  type ConnectorTarget,
  type DataflowEditing,
  type DropPoint,
  type PaletteItem,
} from '../../../dataflow/pipelineComponents';
import { connectionAction } from './dataflowConnections';
import { useGateUniverse } from '../../../dataflow/useGateUniverse';
import { AddressEditForm } from './AddressEditForm';
import { DropNamePopover } from './DropNamePopover';

const ADDRESS_NODE_PREFIX = addressNodeId('');
const NAMESPACE_NODE_PREFIX = namespaceNodeId('');
const APP_NODE_PREFIX = appNodeId({ namespace: '', name: '' }).slice(0, -1);
/** Tall enough for the address form beside the canvas; the panel scrolls past it. */
const CANVAS_HEIGHT = '46rem';

interface Editing {
  index: number;
  /** A just-added entry; Cancel or clicking elsewhere drops it again. */
  isNew: boolean;
  /** Changes on every open so the form remounts and reads the entry afresh. */
  session: number;
}

/** A palette drop waiting for its name. */
type Pending =
  | { kind: 'namespace'; at: DropPoint; floating: boolean }
  | { kind: 'app'; at: DropPoint; namespace: string }
  | { kind: 'address'; at: DropPoint; pubSub: boolean; owner: AppRef; mine: boolean };

/** The box a node sits in: its namespace, and its app box when it is in one. */
interface Box {
  namespace: string;
  app?: AppRef;
}

const sameRef = (a: AppRef, b: AppRef): boolean => a.namespace === b.namespace && a.name === b.name;

/**
 * The address section of the BrokerApp form as a data flow diagram that is edited by
 * dragging. The reducer stays the single source of truth: the diagram is a
 * projection of the CR being edited plus the drafts the form holds, and every
 * gesture dispatches to it.
 *
 * The user's own namespace box, app box and certificate are always there. The
 * palette drops boxes into boxes: an address into the user's app box is one the app
 * owns, into another app's box one it references; an app goes into a namespace box;
 * a namespace dropped on empty canvas floats where it landed until an arrow gives
 * it a role. A drop only asks for a name, right where it landed; the side panel
 * stays for the details an address can have beyond its name and kind.
 */
export const AddressDataflowEditor: React.FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();
  const { universe, apps: allApps } = useGateUniverse();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pinned, setPinned] = useState<Record<string, { x: number; y: number }>>({});
  const [hint, setHint] = useState<string | null>(null);
  const sessionRef = React.useRef(0);
  const openEditor = (index: number, isNew: boolean) => {
    sessionRef.current += 1;
    setEditing({ index, isNew, session: sessionRef.current });
  };

  const self = useMemo<AppRef>(
    () => ({
      namespace: state.cr.metadata?.namespace ?? '',
      name: state.cr.metadata?.name ?? '',
    }),
    [state.cr.metadata],
  );
  // a referenced address with no flow is in the form only: the CR has no words for it yet
  const draftAddresses = useMemo(
    () =>
      state.addresses
        .filter((e) => e.kind === 'referenced' && e.direction === 'none' && e.appName)
        .map((e) => ({
          address: e.address.trim(),
          owner: { namespace: e.appNamespace ?? self.namespace, name: e.appName ?? '' },
          pubSub: Boolean(e.pubSub),
        }))
        .filter((e) => e.address),
    [state.addresses, self.namespace],
  );
  const graph = useMemo(
    () =>
      buildDataflowGraph({
        apps: [state.cr],
        ownerApps: allApps,
        universe,
        drafts: { ...state.drafts, addresses: draftAddresses },
      }),
    [state.cr, allApps, universe, state.drafts, draftAddresses],
  );
  const labels = useMemo(() => ({ anyNamespace: t('Any namespace'), anyApp: t('any app') }), [t]);
  const nodesById = useMemo(
    () => new Map<string, DataflowNode>(graph.nodes.map((node) => [node.id, node])),
    [graph],
  );
  // a pin outlives its purpose once the box is no longer a draft, or is gone
  const activePins = useMemo(() => {
    const pins: Record<string, { x: number; y: number }> = {};
    for (const [id, at] of Object.entries(pinned)) {
      const node = nodesById.get(id);
      if (node && (node.kind === 'namespace' || node.kind === 'app') && node.draft) pins[id] = at;
    }
    return pins;
  }, [pinned, nodesById]);

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

  /** The box the node `nodeId` sits in, found by walking up the boxes it is drawn in. */
  const boxOf = useCallback(
    (nodeId?: string): Box | undefined => {
      let node = nodeId ? nodesById.get(nodeId) : undefined;
      let app: AppRef | undefined;
      while (node) {
        if (node.kind === 'app' && !app) app = { namespace: node.namespace, name: node.name };
        if (node.kind === 'namespace') return { namespace: node.namespace, app };
        node = 'parent' in node && node.parent ? nodesById.get(node.parent) : undefined;
      }
      return undefined;
    },
    [nodesById],
  );

  const editLabel = t('Edit address');
  const removeLabel = t('Remove');
  const diagramEditing = useMemo<DataflowEditing>(
    () => ({
      labels: { edit: editLabel, remove: removeLabel },
      onEdit: (nodeId) => {
        handleSelect([nodeId]);
      },
      onRemove: (nodeId) => {
        if (nodeId.startsWith(NAMESPACE_NODE_PREFIX)) {
          dispatch({
            type: 'REMOVE_DRAFT_NAMESPACE',
            payload: { name: nodeId.slice(NAMESPACE_NODE_PREFIX.length) },
          });
          return;
        }
        if (nodeId.startsWith(APP_NODE_PREFIX)) {
          const node = nodesById.get(nodeId);
          if (node?.kind === 'app') {
            dispatch({
              type: 'REMOVE_DRAFT_APP',
              payload: { namespace: node.namespace, name: node.name },
            });
          }
          return;
        }
        const index = indexOfNode(nodeId);
        if (index < 0) return;
        if (editing && (editing.index === index || editing.isNew)) setEditing(null);
        // the entries after the removed one move up: the panel follows its entry
        else if (editing && editing.index > index)
          setEditing({ ...editing, index: editing.index - 1 });
        dispatch({ type: 'REMOVE_ADDRESS', payload: { index } });
      },
      onConnect: (sourceId: string, target: ConnectorTarget) => {
        const action = connectionAction(state.addresses, self, sourceId, target, universe);
        if (!action) return;
        if (action.type === 'ADD_ADDRESS') {
          handleAdd();
          return;
        }
        dispatch(action);
      },
      onDropPalette: (item: PaletteItem, at: DropPoint, nodeId?: string) => {
        setHint(null);
        if (item === 'namespace') {
          setPending({ kind: 'namespace', at, floating: !nodeId });
          return;
        }
        const box = boxOf(nodeId);
        if (item === 'app') {
          if (!box) {
            setHint(t('Drop an app into a namespace box.'));
            return;
          }
          setPending({ kind: 'app', at, namespace: box.namespace });
          return;
        }
        if (!box?.app) {
          setHint(
            t(
              "Drop an address into an app box: yours for an address you own, another app's for one you reference.",
            ),
          );
          return;
        }
        setPending({
          kind: 'address',
          at,
          pubSub: item === 'topic',
          owner: box.app,
          mine: sameRef(box.app, self),
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleAdd only reads state captured by the other deps
    [
      editLabel,
      removeLabel,
      handleSelect,
      indexOfNode,
      boxOf,
      nodesById,
      editing,
      dispatch,
      self,
      state.addresses,
      universe,
      t,
    ],
  );

  const confirmPending = (name: string) => {
    if (!pending) return;
    if (pending.kind === 'namespace') {
      dispatch({ type: 'ADD_DRAFT_NAMESPACE', payload: { name } });
      if (pending.floating) {
        setPinned((pins) => ({ ...pins, [namespaceNodeId(name)]: pending.at.graph }));
      }
    } else if (pending.kind === 'app') {
      dispatch({ type: 'ADD_DRAFT_APP', payload: { namespace: pending.namespace, name } });
    } else {
      dispatch({
        type: 'ADD_ADDRESS',
        payload: {
          address: name,
          kind: pending.mine ? 'owned' : 'referenced',
          pubSub: pending.pubSub,
          ...(pending.mine
            ? {}
            : { appName: pending.owner.name, appNamespace: pending.owner.namespace }),
        },
      });
    }
    setPending(null);
  };

  const pendingPopover = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'namespace':
        return {
          title: t('Namespace'),
          placeholder: t('Namespace name'),
          suggestions: universe.namespaces,
        };
      case 'app':
        return {
          title: t('App in {{namespace}}', { namespace: pending.namespace }),
          placeholder: t('App name'),
          suggestions: universe.appsByNamespace[pending.namespace] ?? [],
        };
      default:
        return {
          title: pending.pubSub
            ? t('Topic in {{app}}', { app: pending.owner.name })
            : t('Queue in {{app}}', { app: pending.owner.name }),
          placeholder: t('Address name'),
          suggestions: [],
        };
    }
  })();

  const sideBar =
    editing && editingEntry ? (
      <TopologySideBar show resizable onClose={closeEditor} data-test="address-edit-panel">
        <div
          className={`${DATAFLOW_CLASS}-panel`}
          style={{ maxHeight: `calc(${CANVAS_HEIGHT} - 3.5rem)` }}
        >
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

  // Palette items use the browser's drag and drop. They are plain elements, not
  // buttons: Chromium never starts a drag from a form control, draggable or not.
  // The Add address button is the keyboard's way in.
  const paletteItem = (item: PaletteItem, icon: React.ReactNode, label: string) => (
    <span
      draggable
      className={`${DATAFLOW_CLASS}-palette-item`}
      onDragStart={(event: React.DragEvent) => {
        event.dataTransfer.setData(PALETTE_TYPE, item);
        event.dataTransfer.effectAllowed = 'copy';
      }}
      data-test={`palette-${item}`}
    >
      {icon} {label}
    </span>
  );

  return (
    <FormSection title={t('Addresses')}>
      <HelperText>
        <HelperTextItem>
          {t(
            'Drag a namespace, an app or an address from the palette into a box: an address in your app box is yours, in another app box one you reference. Draw an arrow from your certificate to an address to produce, from an address to your certificate to consume, from an address to a namespace to let it consume.',
          )}
        </HelperTextItem>
        {hint && (
          <HelperTextItem variant="warning" data-test="palette-hint">
            {hint}
          </HelperTextItem>
        )}
      </HelperText>
      <Toolbar inset={{ default: 'insetNone' }}>
        <ToolbarContent>
          <ToolbarItem variant="label">{t('Drag onto the diagram')}</ToolbarItem>
          <ToolbarItem>{paletteItem('namespace', <FolderIcon />, t('Namespace'))}</ToolbarItem>
          <ToolbarItem>{paletteItem('app', <CubeIcon />, t('App'))}</ToolbarItem>
          <ToolbarItem>{paletteItem('queue', <EnvelopeIcon />, t('Queue'))}</ToolbarItem>
          <ToolbarItem>{paletteItem('topic', <BroadcastTowerIcon />, t('Topic'))}</ToolbarItem>
          <ToolbarItem>
            <Button
              variant="link"
              icon={<PlusCircleIcon />}
              onClick={handleAdd}
              data-test="add-address-btn"
            >
              {t('Add address')}
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>
      <div className={`${DATAFLOW_CLASS}-editor-canvas`}>
        <DataflowDiagram
          graph={graph}
          labels={labels}
          height={CANVAS_HEIGHT}
          sideBarSize="34rem"
          selectedIds={selectedIds}
          onSelect={handleSelect}
          sideBar={sideBar}
          editing={diagramEditing}
          pinned={activePins}
          dataTest="address-list"
        />
        {pending && pendingPopover && (
          <DropNamePopover
            title={pendingPopover.title}
            placeholder={pendingPopover.placeholder}
            suggestions={pendingPopover.suggestions}
            at={pending.at.client}
            onConfirm={confirmPending}
            onCancel={() => {
              setPending(null);
            }}
          />
        )}
      </div>
      <DataflowLegend scope="app" />
      <DataflowIssues graph={graph} />
    </FormSection>
  );
};
