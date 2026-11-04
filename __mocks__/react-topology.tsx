/**
 * Jest stand-in for @patternfly/react-topology, which needs SVG measurement jsdom
 * lacks. The mock renders the model handed to the controller as plain DOM so page
 * tests can assert which nodes and edges reach the diagram, and lets a test click a
 * node to fire the selection event. Nothing here lays anything out.
 */
import * as React from 'react';
import { createContext, useContext, useState } from 'react';

type Listener = (...args: unknown[]) => void;

interface MockModel {
  graph?: { layout?: string };
  nodes?: { id: string; type: string; label?: string; data?: unknown }[];
  edges?: { id: string; type: string; source?: string; target?: string; data?: unknown }[];
}

export class Visualization {
  model: MockModel = {};
  listeners = new Map<string, Set<Listener>>();
  subscribers = new Set<() => void>();
  registerLayoutFactory = jest.fn();
  registerComponentFactory = jest.fn();
  registerElementFactory = jest.fn();
  setFitToScreenOnLayout = jest.fn();
  fromModel(model: MockModel): void {
    this.model = model;
    this.subscribers.forEach((notify) => {
      notify();
    });
  }
  addEventListener(type: string, listener: Listener): this {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
    return this;
  }
  removeEventListener(type: string, listener: Listener): this {
    this.listeners.get(type)?.delete(listener);
    return this;
  }
  fire(type: string, ...args: unknown[]): void {
    this.listeners.get(type)?.forEach((listener) => {
      listener(...args);
    });
  }
  getGraph() {
    return {
      scaleBy: jest.fn(),
      fit: jest.fn(),
      reset: jest.fn(),
      layout: jest.fn(),
      setDetailsLevelThresholds: jest.fn(),
      getScale: () => 1,
      setScale: jest.fn(),
      setPosition: jest.fn(),
    };
  }
}

export const useCombineRefs =
  <T,>(...refs: (React.Ref<T> | undefined)[]) =>
  (node: T | null) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    });
  };

export const DefaultConnectorTerminal: React.FC<Record<string, unknown>> = () => null;

export class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

const ControllerContext = createContext<Visualization | undefined>(undefined);

export const SELECTION_EVENT = 'selection';
export const LEFT_TO_RIGHT = 'LR';
export const TOP_TO_BOTTOM = 'TB';

export const VisualizationProvider: React.FC<{
  controller?: Visualization;
  children?: React.ReactNode;
}> = ({ controller, children }) => (
  <ControllerContext.Provider value={controller}>{children}</ControllerContext.Provider>
);

export const VisualizationSurface: React.FC<{ state?: { selectedIds?: string[] } }> = ({
  state,
}) => {
  const controller = useContext(ControllerContext);
  const [, setVersion] = useState(0);
  React.useEffect(() => {
    if (!controller) return undefined;
    const notify = () => {
      setVersion((v) => v + 1);
    };
    controller.subscribers.add(notify);
    return () => {
      controller.subscribers.delete(notify);
    };
  }, [controller]);
  const selected = new Set(state?.selectedIds ?? []);
  return (
    <div data-test="mock-topology-surface" data-layout={controller?.model.graph?.layout}>
      {controller?.model.nodes?.map((node) => {
        const data = node.data as { kind?: string } | undefined;
        return (
          <div
            key={node.id}
            role="button"
            tabIndex={0}
            data-test={`dataflow-node-${node.id}`}
            data-kind={data?.kind}
            data-type={node.type}
            data-selected={selected.has(node.id) ? 'true' : undefined}
            onClick={() => {
              controller.fire(SELECTION_EVENT, [node.id]);
            }}
            onKeyDown={() => undefined}
          >
            {node.label}
          </div>
        );
      })}
      {controller?.model.edges?.map((edge) => {
        const data = edge.data as { kind?: string } | undefined;
        return (
          <div
            key={edge.id}
            data-test={`dataflow-edge-${edge.id}`}
            data-kind={data?.kind}
            data-source={edge.source}
            data-target={edge.target}
          />
        );
      })}
    </div>
  );
};

export const TopologyView: React.FC<{
  children?: React.ReactNode;
  controlBar?: React.ReactNode;
  viewToolbar?: React.ReactNode;
  sideBar?: React.ReactNode;
  sideBarOpen?: boolean;
  sideBarResizable?: boolean;
}> = ({ children, controlBar, viewToolbar, sideBar, sideBarOpen }) => (
  <div data-test="mock-topology-view">
    {viewToolbar}
    {controlBar}
    {children}
    {sideBarOpen ? <aside data-test="mock-topology-sidebar">{sideBar}</aside> : null}
  </div>
);

export const TopologySideBar: React.FC<{
  children?: React.ReactNode;
  header?: React.ReactNode;
  onClose?: () => void;
  show?: boolean;
  resizable?: boolean;
}> = ({ children, header, onClose }) => (
  <div data-test="mock-topology-sidebar-content">
    {header}
    {onClose ? (
      <button type="button" onClick={onClose} data-test="mock-topology-sidebar-close">
        close
      </button>
    ) : null}
    {children}
  </div>
);

export const TopologyControlBar: React.FC<{ controlButtons?: unknown[] }> = () => (
  <div data-test="mock-topology-controlbar" />
);
export const createTopologyControlButtons = (): unknown[] => [];
export const defaultControlButtonsOptions = {};

const Null: React.FC<unknown> = () => null;
export const DefaultNode = Null;
export const DefaultGroup = Null;
export const DefaultEdge = Null;
export const GraphComponent = Null;

const identityHoc =
  () =>
  <P,>(Component: React.ComponentType<P>): React.ComponentType<P> =>
    Component;
export const withSelection = identityHoc;
export const withDragNode = identityHoc;
export const withPanZoom = identityHoc;
export const withContextMenu = identityHoc;
export const withCreateConnector = identityHoc;
export const withDndDrop = identityHoc;
export const CREATE_CONNECTOR_DROP_TYPE = '#createConnector#';
export const ContextMenuItem: React.FC<{ children?: React.ReactNode; onClick?: () => void }> = ({
  children,
}) => <li>{children}</li>;
export const Decorator = Null;
export const DEFAULT_DECORATOR_RADIUS = 12;
export const getDefaultShapeDecoratorCenter = (): { x: number; y: number } => ({ x: 0, y: 0 });
export enum TopologyQuadrant {
  upperLeft = 'upperLeft',
  upperRight = 'upperRight',
  lowerLeft = 'lowerLeft',
  lowerRight = 'lowerRight',
}
export const isGraph = (element: { getType?: () => string }): boolean =>
  element.getType?.() === 'graph';
export const isNode = (element: { getType?: () => string }): boolean =>
  element.getType?.() === 'node';
export class RectAnchor {
  constructor(public owner: unknown) {}
}
export const useAnchor = (): void => undefined;
export const observer = <P,>(Component: React.ComponentType<P>): React.ComponentType<P> =>
  Component;

export class DagreGroupsLayout {
  constructor(
    public graph: unknown,
    public options?: unknown,
  ) {}
}
export class DagreLayout extends DagreGroupsLayout {}
export class ForceLayout extends DagreGroupsLayout {}
export class ColaLayout extends DagreGroupsLayout {}
export class ColaGroupsLayout extends DagreGroupsLayout {}
export class GridLayout extends DagreGroupsLayout {}
export class ConcentricLayout extends DagreGroupsLayout {}
export class BreadthFirstLayout extends DagreGroupsLayout {}
export class PipelineDagreGroupsLayout extends DagreGroupsLayout {}
export class PipelineDagreLayout extends DagreGroupsLayout {}
interface MockPipelineNode {
  id: string;
  type: string;
  runAfterTasks?: string[];
}
export const getSpacerNodes = (): MockPipelineNode[] => [];
export const getEdgesFromNodes = (
  nodes: MockPipelineNode[],
  _spacerType: string,
  edgeType: string,
): { id: string; type: string; source: string; target: string }[] =>
  nodes.flatMap((node) =>
    (node.runAfterTasks ?? []).map((source) => ({
      id: `${source}-${node.id}`,
      type: edgeType,
      source,
      target: node.id,
    })),
  );
export const pipelineElementFactory = (): undefined => undefined;
export const DEFAULT_SPACER_NODE_TYPE = 'DEFAULT_SPACER_NODE';
export const TaskNode = Null;
export const TaskEdge = Null;
export const DefaultTaskGroup = Null;
export const SpacerNode = Null;
export const GRAPH_LAYOUT_END_EVENT = 'graph-layout-end';
export const useHover = (): [boolean, () => void] => [false, () => undefined];
export enum ScaleDetailsLevel {
  high = 'high',
  medium = 'medium',
  low = 'low',
}
export const action = <T,>(fn: T): T => fn;

export enum ModelKind {
  graph = 'graph',
  node = 'node',
  edge = 'edge',
}
export enum NodeShape {
  circle = 'circle',
  ellipse = 'ellipse',
  rect = 'rect',
  rhombus = 'rhombus',
  trapezoid = 'trapezoid',
  hexagon = 'hexagon',
  octagon = 'octagon',
  stadium = 'stadium',
}
export enum NodeStatus {
  default = 'default',
  info = 'info',
  success = 'success',
  warning = 'warning',
  danger = 'danger',
}
export enum EdgeStyle {
  default = 'default',
  solid = 'solid',
  dotted = 'dotted',
  dashed = 'dashed',
  dashedMd = 'dashedMd',
  dashedLg = 'dashedLg',
  dashedXl = 'dashedXl',
}
export enum EdgeAnimationSpeed {
  none = 'none',
  slow = 'slow',
  mediumSlow = 'mediumSlow',
  medium = 'medium',
  mediumFast = 'mediumFast',
  fast = 'fast',
}
export enum EdgeTerminalType {
  none = 'none',
  directional = 'directional',
  directionalAlt = 'directionalAlt',
  circle = 'circle',
  square = 'square',
  cross = 'cross',
}
export enum BadgeLocation {
  inner = 0,
  below = 1,
}
export enum LabelPosition {
  top = 0,
  left = 1,
  right = 2,
  bottom = 3,
}
