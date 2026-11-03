import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  BadgeLocation,
  DagreGroupsLayout,
  DefaultEdge,
  DefaultGroup,
  DefaultNode,
  EdgeTerminalType,
  GraphComponent,
  LEFT_TO_RIGHT,
  ModelKind,
  NodeStatus,
  observer,
  withDragNode,
  withPanZoom,
  withSelection,
  type ComponentFactory,
  type Edge,
  type GraphElement,
  type LayoutFactory,
  type Node,
  type WithDragNodeProps,
  type WithSelectionProps,
} from '@patternfly/react-topology';
import type { DataflowEdge, DataflowNode } from './graph';
import { DATAFLOW_LAYOUT, EDGE_TYPE, NODE_TYPES } from './topologyModel';

export const DATAFLOW_CLASS = 'plugin__arkmq-org-broker-operator-openshift-ui__dataflow';

const classes = (...names: (string | false | undefined)[]): string =>
  names.filter(Boolean).join(' ');

type NodeProps = { element: GraphElement } & WithSelectionProps & WithDragNodeProps;

const nodeData = (element: GraphElement): DataflowNode | undefined =>
  element.getData() as DataflowNode | undefined;

/**
 * An address box: the first-class element of the diagram. Foreign addresses (owned
 * by an app the page does not draw) get their own background, pub/sub ones a badge,
 * and the owner tuple sits under the name so a reader knows where it is defined.
 */
const AddressNode: React.FC<NodeProps> = observer(
  ({ element, selected, onSelect, dragNodeRef }) => {
    const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
    const data = nodeData(element);
    const address = data?.kind === 'address' ? data : undefined;
    return (
      <g
        data-test={`dataflow-node-${element.getId()}`}
        data-kind="address"
        className={classes(
          `${DATAFLOW_CLASS}-address`,
          address?.foreign && `${DATAFLOW_CLASS}-address--foreign`,
          address?.gated && `${DATAFLOW_CLASS}-address--gated`,
        )}
      >
        <DefaultNode
          element={element as Node}
          selected={selected}
          onSelect={onSelect}
          dragNodeRef={dragNodeRef}
          truncateLength={28}
          secondaryLabel={
            address?.owner ? `${address.owner.namespace}/${address.owner.name}` : undefined
          }
          badge={address?.pubSub ? t('pub/sub') : undefined}
          badgeLocation={BadgeLocation.inner}
          nodeStatus={address?.issues.length ? NodeStatus.warning : undefined}
          showStatusDecorator={!!address?.issues.length}
        />
      </g>
    );
  },
);

/** A party at the end of an arrow: a namespace, an app named by a gate, or everyone. */
const PartyNode: React.FC<NodeProps> = observer(({ element, selected, onSelect, dragNodeRef }) => {
  const data = nodeData(element);
  return (
    <g
      data-test={`dataflow-node-${element.getId()}`}
      data-kind={data?.kind}
      className={classes(
        `${DATAFLOW_CLASS}-party`,
        data?.kind === 'anyNamespace' && `${DATAFLOW_CLASS}-party--any`,
        data?.kind === 'app' && `${DATAFLOW_CLASS}-party--app`,
      )}
    >
      <DefaultNode
        element={element as Node}
        selected={selected}
        onSelect={onSelect}
        dragNodeRef={dragNodeRef}
        truncateLength={28}
      />
    </g>
  );
});

/** A namespace holding the app boxes a gate named; drawn as a group around them. */
const NamespaceGroup: React.FC<NodeProps> = observer(
  ({ element, selected, onSelect, dragNodeRef }) => (
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
        collapsible={false}
        truncateLength={28}
      />
    </g>
  ),
);

/** Picks the group or the plain box for a namespace, since the model decides per namespace. */
const NamespaceNode: React.FC<NodeProps> = observer((props) =>
  (props.element as Node).isGroup() ? <NamespaceGroup {...props} /> : <PartyNode {...props} />,
);

/** A gate the UI cannot read: the raw CEL, shown as it is. */
const CustomGateNode: React.FC<NodeProps> = observer(
  ({ element, selected, onSelect, dragNodeRef }) => {
    const data = nodeData(element);
    return (
      <g
        data-test={`dataflow-node-${element.getId()}`}
        data-kind="customGate"
        className={`${DATAFLOW_CLASS}-custom-gate`}
      >
        <DefaultNode
          element={element as Node}
          selected={selected}
          onSelect={onSelect}
          dragNodeRef={dragNodeRef}
          truncateLength={40}
          nodeStatus={NodeStatus.info}
          showStatusDecorator
          statusDecoratorTooltip={data?.kind === 'customGate' ? data.expression : undefined}
        />
      </g>
    );
  },
);

const edgeData = (element: GraphElement): DataflowEdge | undefined =>
  element.getData() as DataflowEdge | undefined;

/**
 * A flow. Solid when declared, dashed when only allowed, red when the owner refuses
 * it, orange when it is an open door. The tag names the credentials behind it.
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
          : names.length > 2
            ? `${names.slice(0, 2).join(', ')} +${String(names.length - 2)}`
            : names.join(', ') || undefined;
    return (
      <g
        data-test={`dataflow-edge-${element.getId()}`}
        data-kind={kind}
        className={classes(`${DATAFLOW_CLASS}-edge`, `${DATAFLOW_CLASS}-edge--${kind}`)}
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

const SelectableAddress = withSelection()(withDragNode()(AddressNode));
const SelectableParty = withSelection()(withDragNode()(PartyNode));
const SelectableNamespace = withSelection()(withDragNode()(NamespaceNode));
const SelectableCustomGate = withSelection()(withDragNode()(CustomGateNode));
const SelectableEdge = withSelection()(FlowEdge);
const PanZoomGraph = withPanZoom()(GraphComponent);

/** Maps dataflow node and edge types to their renderers. */
export const dataflowComponentFactory: ComponentFactory = (kind, type) => {
  if (kind === ModelKind.graph) return PanZoomGraph;
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

/** Dagre, left to right, with namespaces as compound groups: the Mermaid flowchart picture. */
export const dataflowLayoutFactory: LayoutFactory = (type, graph) =>
  type === DATAFLOW_LAYOUT
    ? new DagreGroupsLayout(graph, {
        rankdir: LEFT_TO_RIGHT,
        nodesep: 30,
        ranksep: 80,
        edgesep: 20,
        marginx: 24,
        marginy: 24,
        layoutOnDrag: false,
      })
    : undefined;
