import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenuItem,
  CREATE_CONNECTOR_DROP_TYPE,
  DEFAULT_SPACER_NODE_TYPE,
  DefaultTaskGroup,
  EdgeTerminalType,
  GraphComponent,
  isGraph,
  ModelKind,
  NodeStatus,
  observer,
  RunStatus,
  SpacerNode,
  TaskEdge,
  TaskNode,
  withContextMenu,
  withCreateConnector,
  withDndDrop,
  withPanZoom,
  withSelection,
  type ComponentFactory,
  type DragEvent,
  type Edge,
  type Graph,
  type GraphElement,
  type Node,
  type WithContextMenuProps,
  type WithCreateConnectorProps,
  type WithDndDropProps,
  type WithSelectionProps,
} from '@patternfly/react-topology';
import {
  AsteriskIcon,
  BroadcastTowerIcon,
  CodeIcon,
  EnvelopeIcon,
  ExternalLinkAltIcon,
  FolderIcon,
  GlobeIcon,
  KeyIcon,
} from '@patternfly/react-icons';
import type { SVGIconProps } from '@patternfly/react-icons/dist/esm/createIcon';
import type { DataflowEdge, DataflowNode } from './graph';
import { PIPELINE_TYPES } from './pipelineModel';

export const DATAFLOW_CLASS = 'plugin__arkmq-org-broker-operator-openshift-ui__dataflow';

/** Where a connector drawn from a node was dropped. */
export type ConnectorTarget = { nodeId: string } | { graph: true; x: number; y: number };

/**
 * What the editor lets the diagram do. Stored on the topology controller state, so
 * the renderers, which are created once per factory, read it from the element they
 * draw; absent on the read-only pages.
 */
export interface DataflowEditing {
  onEdit: (nodeId: string) => void;
  onRemove: (nodeId: string) => void;
  /** A connector dragged from a node and dropped on another node or on the canvas. */
  onConnect: (sourceId: string, target: ConnectorTarget) => void;
  /** Labels for the context menu, already translated. */
  labels: { edit: string; remove: string };
}

interface DataflowState {
  editing?: DataflowEditing;
}

const editingOf = (element: GraphElement): DataflowEditing | undefined =>
  element.getController().getState<DataflowState>().editing;

const nodeData = (element: GraphElement): DataflowNode | undefined =>
  element.getData() as DataflowNode | undefined;

const edgeData = (element: GraphElement): DataflowEdge | undefined =>
  element.getData() as DataflowEdge | undefined;

type TaskProps = { element: GraphElement } & WithSelectionProps &
  WithContextMenuProps &
  WithCreateConnectorProps &
  WithDndDropProps & { droppable?: boolean; hover?: boolean; canDrop?: boolean };

interface Look {
  icon: React.ComponentType<SVGIconProps>;
  badge: string;
  /** Shown before the name: the address is owned by an app this page does not draw. */
  leadIcon?: React.ReactNode;
  tooltip?: string;
  status?: RunStatus;
  /** Whether the editing gestures (menu, connector handle) apply to this node. */
  editable: boolean;
}

/**
 * A box of the diagram as a pipeline task pill: the icon and the badge say what it
 * is (queue, topic, secret, namespace, gate), the lead icon flags an address owned
 * elsewhere, the status flags an address with an issue. The pill itself is
 * PatternFly's; only the vocabulary is ours.
 */
const DataflowTask: React.FC<TaskProps> = observer(
  ({
    element,
    onContextMenu,
    contextMenuOpen,
    onShowCreateConnector,
    onHideCreateConnector,
    ...rest
  }) => {
    const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
    const data = nodeData(element);
    const editing = editingOf(element);
    const look = ((): Look => {
      switch (data?.kind) {
        case 'address':
          return {
            icon: data.pubSub ? BroadcastTowerIcon : EnvelopeIcon,
            badge: `${data.pubSub ? t('topic') : t('queue')}${data.gated ? ` · ${t('open')}` : ''}`,
            leadIcon: data.foreign ? <ExternalLinkAltIcon /> : undefined,
            tooltip: data.owner
              ? t('Owned by {{owner}}', { owner: `${data.owner.namespace}/${data.owner.name}` })
              : undefined,
            status: data.issues.length ? RunStatus.Failed : undefined,
            editable: true,
          };
        case 'credential':
          return {
            icon: KeyIcon,
            badge: t('secret'),
            tooltip: t('Certificate of {{app}}', { app: data.name }),
            editable: true,
          };
        case 'anyApp':
          return { icon: AsteriskIcon, badge: t('app'), editable: false };
        case 'anyNamespace':
          return { icon: GlobeIcon, badge: t('namespace'), editable: false };
        case 'customGate':
          return { icon: CodeIcon, badge: t('gate'), tooltip: data.expression, editable: false };
        default:
          return { icon: FolderIcon, badge: t('namespace'), editable: true };
      }
    })();
    const Icon = look.icon;
    const edits = Boolean(editing) && look.editable;
    return (
      <g
        data-test={`dataflow-node-${element.getId()}`}
        data-kind={data?.kind}
        onMouseEnter={edits ? onShowCreateConnector : undefined}
        onMouseLeave={edits ? onHideCreateConnector : undefined}
      >
        <TaskNode
          element={element}
          {...rest}
          taskIcon={<Icon />}
          taskIconTooltip={look.tooltip}
          badge={look.badge}
          leadIcon={look.leadIcon}
          status={look.status}
          showStatusState={Boolean(look.status)}
          truncateLength={40}
          onContextMenu={edits ? onContextMenu : undefined}
          contextMenuOpen={contextMenuOpen}
        />
      </g>
    );
  },
);

/** A namespace or app box: PatternFly's task group, following its children. */
const DataflowGroup: React.FC<{ element: GraphElement } & WithSelectionProps> = observer(
  ({ element, selected, onSelect }) => {
    const data = nodeData(element);
    return (
      <g data-test={`dataflow-node-${element.getId()}`} data-kind={data?.kind}>
        <DefaultTaskGroup
          element={element as Node}
          selected={selected}
          onSelect={onSelect}
          collapsible={false}
        />
      </g>
    );
  },
);

/**
 * A flow as a task edge, right-angled. Dashed and moving when only allowed, red
 * when the owner refuses it, orange when it is an open door.
 */
const DataflowEdgeComponent: React.FC<{ element: GraphElement } & WithSelectionProps> = observer(
  ({ element, selected, onSelect }) => {
    const data = edgeData(element);
    const kind = data?.kind ?? 'declared';
    const status =
      kind === 'broken' ? NodeStatus.danger : kind === 'unused' ? NodeStatus.warning : undefined;
    const toSpacer = (element as Edge).getTarget().getType() === DEFAULT_SPACER_NODE_TYPE;
    return (
      <g
        data-test={`dataflow-edge-${element.getId()}`}
        data-kind={kind}
        className={`${DATAFLOW_CLASS}-edge ${DATAFLOW_CLASS}-edge--${kind}`}
      >
        <TaskEdge
          element={element as Edge}
          selected={selected}
          onSelect={onSelect}
          endTerminalType={toSpacer ? undefined : EdgeTerminalType.directional}
          endTerminalStatus={status}
        />
      </g>
    );
  },
);

/** Context menu of a node: the editor's actions, when the page is an editor. */
const nodeMenu = (element: GraphElement): React.ReactElement[] => {
  const editing = editingOf(element);
  const data = nodeData(element);
  if (!editing || data?.kind !== 'address') return [];
  const id = element.getId();
  return [
    <ContextMenuItem
      key="edit"
      onClick={() => {
        editing.onEdit(id);
      }}
    >
      {editing.labels.edit}
    </ContextMenuItem>,
    <ContextMenuItem
      key="remove"
      onClick={() => {
        editing.onRemove(id);
      }}
    >
      {editing.labels.remove}
    </ContextMenuItem>,
  ];
};

/** A connector dropped from `source` onto `target`: the editor decides what it means. */
const onCreateConnector = (source: Node, target: Node | Graph, event: DragEvent): void => {
  const editing = editingOf(source);
  if (!editing) return;
  editing.onConnect(
    source.getId(),
    isGraph(target) ? { graph: true, x: event.x, y: event.y } : { nodeId: target.getId() },
  );
};

const acceptsConnector = withDndDrop<
  Node,
  unknown,
  { droppable?: boolean; hover?: boolean; canDrop?: boolean },
  { element: GraphElement }
>({
  accept: CREATE_CONNECTOR_DROP_TYPE,
  canDrop: (item, _monitor, props) => item !== props.element,
  collect: (monitor) => ({
    droppable: monitor.isDragging(),
    hover: monitor.isOver(),
    canDrop: monitor.canDrop(),
  }),
});

// The behaviour HOCs each strip the props they supply; typing the chain generically
// defeats TypeScript, so it is spelled out once for the task props they all share.
const droppableTask = acceptsConnector(DataflowTask) as React.ComponentType<TaskProps>;
const selectableTask = withSelection()(droppableTask) as React.ComponentType<TaskProps>;
const taskWithMenu = withContextMenu(nodeMenu)(selectableTask) as React.ComponentType<TaskProps>;
const EditableTask = withCreateConnector(onCreateConnector)(taskWithMenu);
const SelectableGroup = withSelection()(DataflowGroup);
const SelectableEdge = withSelection()(DataflowEdgeComponent);
const DropGraph = withDndDrop({ accept: CREATE_CONNECTOR_DROP_TYPE, dropHint: 'create' })(
  withPanZoom()(GraphComponent),
);

/** Maps dataflow node and edge types to their renderers. */
export const dataflowComponentFactory: ComponentFactory = (kind, type) => {
  if (kind === ModelKind.graph) return DropGraph;
  switch (type) {
    case PIPELINE_TYPES.task:
      return EditableTask;
    case PIPELINE_TYPES.group:
      return SelectableGroup;
    case PIPELINE_TYPES.edge:
      return SelectableEdge;
    case DEFAULT_SPACER_NODE_TYPE:
      return SpacerNode;
    default:
      return undefined;
  }
};
