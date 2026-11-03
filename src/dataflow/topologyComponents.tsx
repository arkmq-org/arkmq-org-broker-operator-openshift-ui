import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  DagreGroupsLayout,
  DefaultEdge,
  DefaultGroup,
  EdgeTerminalType,
  GraphComponent,
  LEFT_TO_RIGHT,
  ModelKind,
  NodeStatus,
  RectAnchor,
  observer,
  useAnchor,
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

const truncate = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

interface BoxProps extends NodeProps {
  kind: string;
  className?: string;
  label: string;
  secondaryLabel?: string;
  badge?: string;
  status?: NodeStatus;
  tooltip?: string;
}

/**
 * A rectangle with its text inside, the way a box in a flowchart reads. PatternFly's
 * default node draws a shape with the label underneath, which is right for icons and
 * wrong for named boxes; the anchor stays PatternFly's so arrows meet the border.
 */
const Box: React.FC<BoxProps> = observer(
  ({
    element,
    selected,
    onSelect,
    dragNodeRef,
    kind,
    className,
    label,
    secondaryLabel,
    badge,
    status,
    tooltip,
  }) => {
    useAnchor(React.useCallback((node: Node) => new RectAnchor(node), []));
    const node = element as Node;
    const { width, height } = node.getDimensions();
    const centreY = height / 2;
    return (
      <g
        ref={dragNodeRef}
        onClick={onSelect}
        className={classes(
          `${DATAFLOW_CLASS}-box`,
          className,
          selected && `${DATAFLOW_CLASS}-box--selected`,
          status && `${DATAFLOW_CLASS}-box--${status}`,
        )}
        data-test={`dataflow-node-${element.getId()}`}
        data-kind={kind}
      >
        {tooltip ? <title>{tooltip}</title> : null}
        <rect className={`${DATAFLOW_CLASS}-box-shape`} width={width} height={height} rx={8} />
        <text
          className={`${DATAFLOW_CLASS}-box-label`}
          x={width / 2}
          y={secondaryLabel ? centreY - 7 : centreY}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {truncate(label, 36)}
        </text>
        {secondaryLabel ? (
          <text
            className={`${DATAFLOW_CLASS}-box-secondary`}
            x={width / 2}
            y={centreY + 11}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {truncate(secondaryLabel, 40)}
          </text>
        ) : null}
        {badge ? (
          <text
            className={`${DATAFLOW_CLASS}-box-badge`}
            x={width - 6}
            y={6}
            textAnchor="end"
            dominantBaseline="hanging"
          >
            {badge}
          </text>
        ) : null}
        {status ? (
          <circle className={`${DATAFLOW_CLASS}-box-status`} cx={10} cy={10} r={5} />
        ) : null}
      </g>
    );
  },
);

/**
 * An address box: the first-class element of the diagram. Foreign addresses (owned
 * by an app the page does not draw) get their own background, pub/sub ones a badge,
 * and the owner tuple sits under the name so a reader knows where it is defined.
 */
const AddressNode: React.FC<NodeProps> = observer((props) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const data = nodeData(props.element);
  const address = data?.kind === 'address' ? data : undefined;
  return (
    <Box
      {...props}
      kind="address"
      className={classes(
        `${DATAFLOW_CLASS}-address`,
        address?.foreign && `${DATAFLOW_CLASS}-address--foreign`,
        address?.gated && `${DATAFLOW_CLASS}-address--gated`,
      )}
      label={props.element.getLabel()}
      secondaryLabel={
        address?.owner ? `${address.owner.namespace}/${address.owner.name}` : undefined
      }
      badge={address?.pubSub ? t('pub/sub') : undefined}
      status={address?.issues.length ? NodeStatus.warning : undefined}
    />
  );
});

/** A party at the end of an arrow: a namespace, an app box inside one, or everyone. */
const PartyNode: React.FC<NodeProps> = observer((props) => {
  const data = nodeData(props.element);
  return (
    <Box
      {...props}
      kind={data?.kind ?? 'namespace'}
      className={classes(
        `${DATAFLOW_CLASS}-party`,
        data?.kind === 'anyNamespace' && `${DATAFLOW_CLASS}-party--any`,
        data?.kind === 'app' && `${DATAFLOW_CLASS}-party--app`,
      )}
      label={props.element.getLabel()}
    />
  );
});

/** A namespace holding app boxes; drawn as a group around them. */
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
const CustomGateNode: React.FC<NodeProps> = observer((props) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const data = nodeData(props.element);
  const expression = data?.kind === 'customGate' ? data.expression : props.element.getLabel();
  return (
    <Box
      {...props}
      kind="customGate"
      className={`${DATAFLOW_CLASS}-custom-gate`}
      label={expression}
      secondaryLabel={t('custom gate')}
      tooltip={expression}
    />
  );
});

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
