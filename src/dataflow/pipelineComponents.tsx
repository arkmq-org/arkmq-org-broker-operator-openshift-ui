import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenuItem,
  CREATE_CONNECTOR_DROP_TYPE,
  DEFAULT_SPACER_NODE_TYPE,
  DefaultConnectorTerminal,
  DefaultTaskGroup,
  EdgeTerminalType,
  GraphComponent,
  isGraph,
  LabelPosition,
  ModelKind,
  NodeStatus,
  observer,
  Point,
  RunStatus,
  ScaleDetailsLevel,
  SpacerNode,
  TaskEdge,
  TaskNode,
  useCombineRefs,
  useHover,
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
import { PIPELINE_TYPES, type PipelineEdgeData } from './pipelineModel';

export const DATAFLOW_CLASS = 'plugin__arkmq-org-broker-operator-openshift-ui__dataflow';

/** Where a connector drawn from a node was dropped. */
export type ConnectorTarget = { nodeId: string } | { graph: true; x: number; y: number };

/** MIME type of a palette item being dragged onto the canvas with the browser's own drag and drop. */
/**
 * How far past the node's right edge the hover area reaches: the connector handle
 * (32 units long) hangs off that edge, and the pointer must stay inside the node's
 * hover area until it is over the handle, or the handle hides before it is reached.
 */
const CONNECTOR_REACH = 48;
/** Hover area margin above and below the node. */
const HOVER_MARGIN = 6;
/** The library's class on the connector handle, the one element hover may leave for. */
const CONNECTOR_HANDLE_CLASS = 'pf-topology-default-create-connector';

export const PALETTE_TYPE = 'application/x-arkmq-dataflow';
export type PaletteItem = 'address' | 'namespace';

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
  /** A palette item dropped on the canvas, over the node `nodeId` when there is one. */
  onDropPalette: (item: PaletteItem, nodeId?: string) => void;
  /** Labels for the context menu, already translated. */
  labels: { edit: string; remove: string };
}

interface DataflowState {
  editing?: DataflowEditing;
  /** Bumped when fonts load; keys the pills so they measure their text again. */
  fontEpoch?: number;
}

const editingOf = (element: GraphElement): DataflowEditing | undefined =>
  element.getController().getState<DataflowState>().editing;

const nodeData = (element: GraphElement): DataflowNode | undefined =>
  element.getData() as DataflowNode | undefined;

const edgeData = (element: GraphElement): PipelineEdgeData | undefined =>
  element.getData() as PipelineEdgeData | undefined;

type TaskProps = { element: GraphElement } & WithSelectionProps &
  WithContextMenuProps &
  WithCreateConnectorProps &
  WithDndDropProps & { droppable?: boolean; hover?: boolean; canDrop?: boolean };

interface Look {
  icon: React.ComponentType<SVGIconProps>;
  badge: string;
  /** Shown before the name: the address is owned by an app this page does not draw. */
  tooltip?: string;
  status?: RunStatus;
  /** Whether the editing gestures (menu, connector handle) apply to this node. */
  editable: boolean;
}

/**
 * A box of the diagram as a pipeline task pill: the icon and the badge say what it
 * is (queue, topic, secret, namespace, gate), an external link icon marks an address
 * owned elsewhere, the status flags an address with an issue. The pill itself is
 * PatternFly's; only the vocabulary is ours.
 */
const DataflowTask: React.FC<TaskProps> = observer(
  ({
    element,
    onContextMenu,
    contextMenuOpen,
    onShowCreateConnector,
    onHideCreateConnector,
    dndDropRef,
    droppable,
    ...rest
  }) => {
    const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
    const data = nodeData(element);
    const editing = editingOf(element);
    const look = ((): Look => {
      switch (data?.kind) {
        case 'address':
          return {
            // the badge already says queue or topic, so the icon can mark the ones owned
            // elsewhere (as a lead icon would, but the pill misplaces one before it is measured)
            icon: data.foreign
              ? ExternalLinkAltIcon
              : data.pubSub
                ? BroadcastTowerIcon
                : EnvelopeIcon,
            badge: `${data.pubSub ? t('topic') : t('queue')}${data.gated ? ` · ${t('open')}` : ''}`,
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
    const [hover, hoverRef] = useHover<SVGGElement>();
    const box = React.useRef<SVGGElement | null>(null);
    // the drop target's hit test needs an element to measure: this box
    const refs = useCombineRefs<SVGGElement>(hoverRef, dndDropRef ?? null, box);
    const detailsLevel = element.getGraph().getDetailsLevel();
    const bounds = (element as Node).getBounds();
    // Hiding the handle unmounts it, and with it the drag it may be the source of.
    // So the handle stays while the pointer is on it, while it is being dragged
    // (`droppable`: a connector drag is in progress), and goes when the pointer leaves
    // it with no button down or, after a drag, when the pointer did not end up here.
    const dragging = Boolean(droppable);
    const wasDragging = React.useRef(false);
    React.useEffect(() => {
      // the browser's own hover: the library's is debounced and lags behind the drop
      if (wasDragging.current && !dragging && !box.current?.matches(':hover')) {
        onHideCreateConnector?.();
      }
      wasDragging.current = dragging;
    }, [dragging, onHideCreateConnector]);
    const leave = (event: React.MouseEvent) => {
      if (dragging) return;
      const handle = (event.relatedTarget as Element | null)?.closest(`.${CONNECTOR_HANDLE_CLASS}`);
      if (!handle) {
        onHideCreateConnector?.();
        return;
      }
      handle.addEventListener(
        'mouseleave',
        (left) => {
          if (!(left as MouseEvent).buttons) onHideCreateConnector?.();
        },
        { once: true },
      );
    };
    return (
      <g
        ref={refs}
        data-test={`dataflow-node-${element.getId()}`}
        data-kind={data?.kind}
        onMouseEnter={edits ? onShowCreateConnector : undefined}
        onMouseLeave={edits ? leave : undefined}
      >
        {edits && (
          // The pill is drawn narrower than the node and the handle hangs off the node's
          // edge, so this unseen strip under the pill keeps the pointer "inside" across
          // that gap until it is over the handle, which then keeps itself alive.
          <rect
            x={0}
            y={-HOVER_MARGIN}
            width={bounds.width + CONNECTOR_REACH}
            height={bounds.height + 2 * HOVER_MARGIN}
            fill="transparent"
          />
        )}
        <TaskNode
          key={element.getController().getState<DataflowState>().fontEpoch ?? 0}
          element={element}
          {...rest}
          hideDetailsAtMedium
          scaleNode={hover && detailsLevel !== ScaleDetailsLevel.high}
          taskIcon={<Icon />}
          taskIconTooltip={look.tooltip}
          badge={look.badge}
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

/**
 * A namespace or app box: PatternFly's task group, following its children, set up
 * as the pipeline groups example sets it: the label sits under the box, hides when
 * zoomed out (where the library misplaces it) and comes back on hover.
 */
const DataflowGroup: React.FC<{ element: GraphElement } & WithSelectionProps> = observer(
  ({ element, selected, onSelect }) => {
    const data = nodeData(element);
    const [hover, hoverRef] = useHover<SVGGElement>();
    const detailsLevel = element.getGraph().getDetailsLevel();
    return (
      <g ref={hoverRef} data-test={`dataflow-node-${element.getId()}`} data-kind={data?.kind}>
        <DefaultTaskGroup
          element={element as Node}
          selected={selected}
          onSelect={onSelect}
          collapsible={false}
          labelPosition={LabelPosition.bottom}
          hideDetailsAtMedium
          showLabelOnHover
          scaleNode={hover && detailsLevel !== ScaleDetailsLevel.high}
        />
      </g>
    );
  },
);

const terminalStatus = (kind: DataflowEdge['kind']): NodeStatus | undefined =>
  kind === 'broken' ? NodeStatus.danger : kind === 'unused' ? NodeStatus.warning : undefined;

/** Arrowhead size of the task edges (the library's default). */
const TERMINAL_SIZE = 14;

/**
 * A flow as a task edge, right-angled. Dashed and moving when only allowed, red
 * when the owner refuses it, orange when it is an open door. An arrow with a
 * reverse (the same two boxes, the other way round) gets a second head.
 */
const DataflowEdgeComponent: React.FC<{ element: GraphElement } & WithSelectionProps> = observer(
  ({ element, selected, onSelect }) => {
    const data = edgeData(element);
    const kind = data?.kind ?? 'declared';
    const edge = element as Edge;
    const toSpacer = edge.getTarget().getType() === DEFAULT_SPACER_NODE_TYPE;
    // where the drawn line starts: the task edge begins it before the node's edge
    const lineStart = new Point(
      edge.getStartPoint().x - (data?.indent ?? 0),
      edge.getStartPoint().y,
    );
    return (
      <g
        data-test={`dataflow-edge-${element.getId()}`}
        data-kind={kind}
        className={`${DATAFLOW_CLASS}-edge ${DATAFLOW_CLASS}-edge--${kind}`}
      >
        <TaskEdge
          element={edge}
          selected={selected}
          onSelect={onSelect}
          endTerminalType={toSpacer ? undefined : EdgeTerminalType.directional}
          endTerminalStatus={terminalStatus(kind)}
        />
        {data?.reverse && (
          // The second head, for the arrow going the other way. The task edge's own start
          // terminal takes its direction from the far end of the edge, which is not where
          // the line goes; this one points back along the line's first stretch.
          <DefaultConnectorTerminal
            edge={edge}
            isTarget={false}
            terminalType={EdgeTerminalType.directional}
            status={terminalStatus(data.reverse.kind)}
            startPoint={new Point(lineStart.x + 2 * TERMINAL_SIZE, lineStart.y)}
            endPoint={lineStart}
            size={TERMINAL_SIZE}
          />
        )}
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
// The canvas is under every pointer position (the library's default hit test only
// covers the unzoomed viewport) and takes the drop when no box does.
const DropGraph = withDndDrop({
  accept: CREATE_CONNECTOR_DROP_TYPE,
  hitTest: () => true,
  canDrop: (_item, monitor) => monitor.isOver({ shallow: true }),
  dropHint: 'create',
})(withPanZoom()(GraphComponent));

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
