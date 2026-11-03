import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ContextMenuItem,
  CREATE_CONNECTOR_DROP_TYPE,
  DagreLayout,
  Decorator,
  DEFAULT_DECORATOR_RADIUS,
  DefaultEdge,
  DefaultGroup,
  DefaultNode,
  EdgeTerminalType,
  getDefaultShapeDecoratorCenter,
  GraphComponent,
  isGraph,
  LEFT_TO_RIGHT,
  ModelKind,
  NodeShape,
  NodeStatus,
  observer,
  TopologyQuadrant,
  withContextMenu,
  withCreateConnector,
  withDndDrop,
  withDragNode,
  withPanZoom,
  withSelection,
  type ComponentFactory,
  type DragEvent,
  type Edge,
  type Graph,
  type GraphElement,
  type LayoutFactory,
  type Node,
  type WithContextMenuProps,
  type WithCreateConnectorProps,
  type WithDndDropProps,
  type WithDragNodeProps,
  type WithSelectionProps,
} from '@patternfly/react-topology';
import {
  AsteriskIcon,
  BroadcastTowerIcon,
  CodeIcon,
  CubeIcon,
  EnvelopeIcon,
  ExternalLinkAltIcon,
  FolderIcon,
  GlobeIcon,
  LockOpenIcon,
} from '@patternfly/react-icons';
import type { SVGIconProps } from '@patternfly/react-icons/dist/esm/createIcon';
import { ANY_APP, type DataflowEdge, type DataflowNode } from './graph';
import { DATAFLOW_LAYOUT, EDGE_TYPE, NODE_TYPES } from './topologyModel';

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

const ICON_PADDING = 18;

/** The icon drawn inside a node's shape, sized to the shape like PatternFly's demos do. */
const NodeIcon: React.FC<{ element: Node; icon: React.ComponentType<SVGIconProps> }> = ({
  element,
  icon: Icon,
}) => {
  const { width, height } = element.getDimensions();
  const size = Math.min(width, height) - ICON_PADDING * 2;
  return (
    <g transform={`translate(${String((width - size) / 2)}, ${String((height - size) / 2)})`}>
      <Icon className={`${DATAFLOW_CLASS}-node-icon`} width={size} height={size} />
    </g>
  );
};

const decorator = (
  element: Node,
  quadrant: TopologyQuadrant,
  icon: React.ReactNode,
  ariaLabel: string,
): React.ReactNode => {
  const { x, y } = getDefaultShapeDecoratorCenter(quadrant, element);
  return (
    <Decorator
      x={x}
      y={y}
      radius={DEFAULT_DECORATOR_RADIUS}
      showBackground
      icon={icon}
      ariaLabel={ariaLabel}
    />
  );
};

type NodeProps = { element: GraphElement } & WithSelectionProps &
  WithDragNodeProps &
  WithContextMenuProps &
  WithCreateConnectorProps &
  WithDndDropProps & { droppable?: boolean; hover?: boolean; canDrop?: boolean };

interface ShapeNodeProps extends NodeProps {
  kind: string;
  className?: string;
  icon: React.ComponentType<SVGIconProps>;
  badge: string;
  secondaryLabel?: string;
  attachments?: React.ReactNode;
  showStatus?: boolean;
  /** Whether the editing gestures (menu, connector handle) apply to this node. */
  editable?: boolean;
}

/**
 * PatternFly's node, with the vocabulary of the diagram on top: the shape and icon
 * say what the thing is, the badge in the label says it in words, decorators carry
 * the flags (foreign, gated, warning) the legend explains.
 */
const ShapeNode: React.FC<ShapeNodeProps> = observer(
  ({
    element,
    kind,
    className,
    icon,
    badge,
    secondaryLabel,
    attachments,
    showStatus,
    editable = true,
    onContextMenu,
    contextMenuOpen,
    onShowCreateConnector,
    onHideCreateConnector,
    ...rest
  }) => {
    const editing = editingOf(element);
    const node = element as Node;
    return (
      <g data-test={`dataflow-node-${element.getId()}`} data-kind={kind} className={className}>
        <DefaultNode
          element={node}
          {...rest}
          badge={badge}
          secondaryLabel={secondaryLabel}
          truncateLength={24}
          showStatusDecorator={showStatus}
          statusDecoratorTooltip={showStatus ? node.getNodeStatus() : undefined}
          attachments={attachments}
          onContextMenu={editing && editable ? onContextMenu : undefined}
          contextMenuOpen={contextMenuOpen}
          onShowCreateConnector={editing && editable ? onShowCreateConnector : undefined}
          onHideCreateConnector={onHideCreateConnector}
        >
          <NodeIcon element={node} icon={icon} />
        </DefaultNode>
      </g>
    );
  },
);

/** An address: the messaging destination the whole diagram is about. */
const AddressNode: React.FC<NodeProps> = observer((props) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const data = nodeData(props.element);
  const address = data?.kind === 'address' ? data : undefined;
  const node = props.element as Node;
  return (
    <ShapeNode
      {...props}
      kind="address"
      className={`${DATAFLOW_CLASS}-address`}
      icon={address?.pubSub ? BroadcastTowerIcon : EnvelopeIcon}
      badge={address?.pubSub ? t('topic') : t('queue')}
      secondaryLabel={
        address?.owner ? `${address.owner.namespace}/${address.owner.name}` : undefined
      }
      showStatus={!!address?.issues.length}
      attachments={
        <>
          {address?.foreign
            ? decorator(
                node,
                TopologyQuadrant.upperLeft,
                <ExternalLinkAltIcon />,
                t('Owned by another app'),
              )
            : null}
          {address?.gated
            ? decorator(
                node,
                TopologyQuadrant.upperRight,
                <LockOpenIcon />,
                t('Opened to other apps by a gate'),
              )
            : null}
        </>
      }
      editable={!address?.foreign || true}
    />
  );
});

/** A party at the end of an arrow: an app, the any-app box, a namespace, or everyone. */
const PartyNode: React.FC<NodeProps> = observer((props) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const data = nodeData(props.element);
  if (data?.kind === 'app') {
    const any = data.name === ANY_APP;
    return (
      <ShapeNode
        {...props}
        kind="app"
        className={`${DATAFLOW_CLASS}-app`}
        icon={any ? AsteriskIcon : CubeIcon}
        badge={t('app')}
        editable={!any}
      />
    );
  }
  if (data?.kind === 'anyNamespace') {
    return (
      <ShapeNode
        {...props}
        kind="anyNamespace"
        className={`${DATAFLOW_CLASS}-any-namespace`}
        icon={GlobeIcon}
        badge={t('namespace')}
        editable={false}
      />
    );
  }
  return (
    <ShapeNode
      {...props}
      kind="namespace"
      className={`${DATAFLOW_CLASS}-namespace`}
      icon={FolderIcon}
      badge={t('namespace')}
    />
  );
});

/** A namespace holding app and address boxes; a rounded rectangle, not PatternFly's hull. */
const NamespaceGroup: React.FC<NodeProps> = observer(
  ({ element, selected, onSelect, dragNodeRef, droppable, hover, canDrop }) => {
    const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
    return (
      <g
        data-test={`dataflow-node-${element.getId()}`}
        data-kind="namespace"
        className={`${DATAFLOW_CLASS}-namespace-group`}
      >
        <DefaultGroup
          element={element as Node}
          selected={selected}
          onSelect={onSelect}
          dragNodeRef={dragNodeRef}
          droppable={droppable}
          hover={hover}
          canDrop={canDrop}
          collapsible={false}
          hulledOutline={false}
          badge={t('namespace')}
          truncateLength={28}
        />
      </g>
    );
  },
);

/** Picks the group or the plain box for a namespace, since the model decides per namespace. */
const NamespaceNode: React.FC<NodeProps> = observer((props) =>
  (props.element as Node).isGroup() ? <NamespaceGroup {...props} /> : <PartyNode {...props} />,
);

/** A gate the UI cannot read: the raw CEL, shown as it is. */
const CustomGateNode: React.FC<NodeProps> = observer((props) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  return (
    <ShapeNode
      {...props}
      kind="customGate"
      className={`${DATAFLOW_CLASS}-custom-gate`}
      icon={CodeIcon}
      badge={t('gate')}
      editable={false}
    />
  );
});

const edgeData = (element: GraphElement): DataflowEdge | undefined =>
  element.getData() as DataflowEdge | undefined;

/**
 * A flow. Solid when declared, dashed and moving when only allowed, red when the
 * owner refuses it, orange when it is an open door. The tag names the credentials
 * behind a merged arrow, or the gate state.
 */
const FlowEdge: React.FC<{ element: GraphElement } & WithSelectionProps> = observer(
  ({ element, selected, onSelect }) => {
    const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
    const data = edgeData(element);
    const kind = data?.kind ?? 'declared';
    const status =
      kind === 'broken' ? NodeStatus.danger : kind === 'unused' ? NodeStatus.warning : undefined;
    const names = data?.apps.map((app) => app.name) ?? [];
    const tag =
      kind === 'allowed'
        ? t('allowed')
        : kind === 'unused'
          ? t('open door')
          : kind === 'broken'
            ? t('refused')
            : names.length > 1
              ? names.length > 2
                ? `${names.slice(0, 2).join(', ')} +${String(names.length - 2)}`
                : names.join(', ')
              : undefined;
    return (
      <g
        data-test={`dataflow-edge-${element.getId()}`}
        data-kind={kind}
        className={`${DATAFLOW_CLASS}-edge ${DATAFLOW_CLASS}-edge--${kind}`}
      >
        <DefaultEdge
          element={element as Edge}
          selected={selected}
          onSelect={onSelect}
          endTerminalType={EdgeTerminalType.directional}
          endTerminalStatus={status}
          tag={tag}
          tagStatus={status}
        />
      </g>
    );
  },
);

/** Context menu of a node: the editor's actions, when the page is an editor. */
const nodeMenu = (element: GraphElement): React.ReactElement[] => {
  const editing = editingOf(element);
  const data = nodeData(element);
  if (!editing) return [];
  const id = element.getId();
  if (data?.kind === 'address') {
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
  }
  return [];
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
// defeats TypeScript, so it is spelled out once for the node props they all share.
const editable = (component: React.ComponentType<NodeProps>) => {
  const droppable = acceptsConnector(component);
  const draggable = withDragNode()(droppable as React.ComponentType<NodeProps>);
  const selectable = withSelection()(draggable as React.ComponentType<NodeProps>);
  const withMenu = withContextMenu(nodeMenu)(selectable as React.ComponentType<NodeProps>);
  return withCreateConnector(onCreateConnector)(withMenu as React.ComponentType<NodeProps>);
};

const SelectableAddress = editable(AddressNode);
const SelectableParty = editable(PartyNode);
const SelectableNamespace = editable(NamespaceNode);
const SelectableCustomGate = withSelection()(withDragNode()(CustomGateNode));
const SelectableEdge = withSelection()(FlowEdge);
const DropGraph = withDndDrop({ accept: CREATE_CONNECTOR_DROP_TYPE, dropHint: 'create' })(
  withPanZoom()(GraphComponent),
);

/** Maps dataflow node and edge types to their renderers. */
export const dataflowComponentFactory: ComponentFactory = (kind, type) => {
  if (kind === ModelKind.graph) return DropGraph;
  if (kind === ModelKind.edge && type === EDGE_TYPE) return SelectableEdge;
  switch (type) {
    case NODE_TYPES.address:
      return SelectableAddress;
    case NODE_TYPES.namespace:
      return SelectableNamespace;
    case NODE_TYPES.app:
    case NODE_TYPES.anyNamespace:
      return SelectableParty;
    case NODE_TYPES.customGate:
      return SelectableCustomGate;
    default:
      return undefined;
  }
};

/**
 * Dagre, left to right, with namespaces as compound groups: the Mermaid flowchart
 * picture. The plain DagreLayout hands dagre the groups as clusters, so an arrow
 * between two namespaces still orders them; DagreGroupsLayout would lay each group
 * out alone and drop those arrows from the layout.
 */
export const dataflowLayoutFactory: LayoutFactory = (type, graph) =>
  type === DATAFLOW_LAYOUT
    ? new DagreLayout(graph, {
        rankdir: LEFT_TO_RIGHT,
        nodesep: 60,
        ranksep: 110,
        edgesep: 30,
        marginx: 24,
        marginy: 24,
        layoutOnDrag: false,
        ignoreGroups: false,
      })
    : undefined;

export { NodeShape };
