import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  ToolbarItem,
  type MenuToggleElement,
} from '@patternfly/react-core';
import {
  action,
  BreadthFirstLayout,
  ColaGroupsLayout,
  ColaLayout,
  ConcentricLayout,
  createTopologyControlButtons,
  DagreLayout,
  defaultControlButtonsOptions,
  ForceLayout,
  GRAPH_LAYOUT_END_EVENT,
  GridLayout,
  SELECTION_EVENT,
  TopologyControlBar,
  TopologyView,
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
  type Graph,
  type Layout,
  type LayoutFactory,
  type LayoutOptions,
  type Model,
  type SelectionEventListener,
} from '@patternfly/react-topology';
import {
  DATAFLOW_CLASS,
  dataflowComponentFactory,
  type DataflowEditing,
} from './topologyComponents';
import './dataflow.css';

/** The layouts react-topology ships, offered as they are; Dagre reads left to right, which suits a flow. */
export const LAYOUTS = [
  'Dagre',
  'Force',
  'Cola',
  'ColaGroups',
  'ColaNoForce',
  'Grid',
  'Concentric',
  'BreadthFirst',
] as const;
export type LayoutName = (typeof LAYOUTS)[number];
export const DEFAULT_LAYOUT: LayoutName = 'Dagre';

/**
 * Minimum room the layouts keep between nodes, between groups and along edges, in
 * the library's own terms; labels hang below the boxes and need it.
 */
const spacing: Partial<LayoutOptions> = { nodeDistance: 90, groupDistance: 90, linkDistance: 90 };

const layoutFactory: LayoutFactory = (type: string, graph: Graph): Layout | undefined => {
  switch (type) {
    case 'BreadthFirst':
      return new BreadthFirstLayout(graph, spacing);
    case 'Cola':
      return new ColaLayout(graph, spacing);
    case 'ColaNoForce':
      return new ColaLayout(graph, { ...spacing, layoutOnDrag: false });
    case 'Concentric':
      return new ConcentricLayout(graph, spacing);
    case 'Dagre':
      return new DagreLayout(graph, spacing);
    case 'Force':
      return new ForceLayout(graph, spacing);
    case 'Grid':
      return new GridLayout(graph, spacing);
    case 'ColaGroups':
      return new ColaGroupsLayout(graph, { ...spacing, layoutOnDrag: false });
    default:
      return new DagreLayout(graph, spacing);
  }
};

export interface DataflowDiagramProps {
  /** Topology model from `toTopologyModel`; a new object triggers a re-layout. */
  model: Model;
  /** Ids of the selected elements; selection is controlled by the caller. */
  selectedIds?: string[];
  onSelect?: (ids: string[]) => void;
  /** Side panel content, shown when provided (the editor's address form). */
  sideBar?: React.ReactNode;
  /** Editing gestures (context menu, connector drag); absent on read-only pages. */
  editing?: DataflowEditing;
  /** Shown instead of the canvas when the model has no nodes. */
  emptyState?: React.ReactNode;
  /** Height of the canvas; the topology surface fills its container and needs one. */
  height?: string;
  /** Test id of the wrapping element. */
  dataTest?: string;
}

/**
 * The boxes-and-arrows view of messaging flows, shared by the BrokerApp form, the
 * BrokerApp details page and the BrokerService details page. It draws the model it
 * is given with the layout chosen in its toolbar and reports selections; what the
 * picture means is decided in `buildDataflowGraph`, what it looks like in
 * `topologyComponents`.
 *
 * The topology controller is a mobx store outside React, so feeding it the model is a
 * side effect on an external system, which is what the effects below do.
 */
export const DataflowDiagram: React.FC<DataflowDiagramProps> = ({
  model,
  selectedIds,
  onSelect,
  sideBar,
  editing,
  emptyState,
  height = '32rem',
  dataTest = 'dataflow-diagram',
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [layoutDropdownOpen, setLayoutDropdownOpen] = useState(false);
  const [layout, setLayout] = useState<LayoutName>(DEFAULT_LAYOUT);

  const controller = useMemo(() => {
    const visualization = new Visualization();
    visualization.registerLayoutFactory(layoutFactory);
    visualization.registerComponentFactory(dataflowComponentFactory);
    visualization.addEventListener(GRAPH_LAYOUT_END_EVENT, () => {
      visualization.getGraph().fit(80);
    });
    return visualization;
  }, []);

  useEffect(() => {
    controller.fromModel(
      { ...model, graph: { ...model.graph, id: 'g1', type: 'graph', layout } },
      false,
    );
  }, [controller, model, layout]);

  useEffect(() => {
    if (!onSelect) return undefined;
    const listener: SelectionEventListener = (ids) => {
      onSelect(ids);
    };
    controller.addEventListener(SELECTION_EVENT, listener);
    return () => {
      controller.removeEventListener(SELECTION_EVENT, listener);
    };
  }, [controller, onSelect]);

  if (!model.nodes?.length && emptyState && !sideBar) {
    return <div data-test={dataTest}>{emptyState}</div>;
  }

  const layoutDropdown = (
    <>
      <ToolbarItem variant="label">{t('Layout')}</ToolbarItem>
      <ToolbarItem>
        <Dropdown
          toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
            <MenuToggle
              ref={toggleRef}
              onClick={() => {
                setLayoutDropdownOpen(!layoutDropdownOpen);
              }}
              data-test="dataflow-layout-toggle"
            >
              {layout}
            </MenuToggle>
          )}
          isOpen={layoutDropdownOpen}
          onOpenChange={setLayoutDropdownOpen}
        >
          <DropdownList>
            {LAYOUTS.map((name) => (
              <DropdownItem
                key={name}
                onClick={() => {
                  setLayout(name);
                  setLayoutDropdownOpen(false);
                }}
                data-test={`dataflow-layout-${name}`}
              >
                {name}
              </DropdownItem>
            ))}
          </DropdownList>
        </Dropdown>
      </ToolbarItem>
    </>
  );

  return (
    <div className={`${DATAFLOW_CLASS}-container`} style={{ height }} data-test={dataTest}>
      <TopologyView
        viewToolbar={<ToolbarItem>{layoutDropdown}</ToolbarItem>}
        controlBar={
          <TopologyControlBar
            controlButtons={createTopologyControlButtons({
              ...defaultControlButtonsOptions,
              zoomInCallback: action(() => {
                controller.getGraph().scaleBy(4 / 3);
              }),
              zoomOutCallback: action(() => {
                controller.getGraph().scaleBy(0.75);
              }),
              fitToScreenCallback: action(() => {
                controller.getGraph().fit(80);
              }),
              resetViewCallback: action(() => {
                controller.getGraph().reset();
                controller.getGraph().layout();
              }),
              legend: false,
            })}
          />
        }
        sideBar={sideBar}
        sideBarOpen={Boolean(sideBar)}
        sideBarResizable
      >
        <VisualizationProvider controller={controller}>
          <VisualizationSurface state={{ selectedIds: selectedIds ?? [], editing }} />
        </VisualizationProvider>
      </TopologyView>
    </div>
  );
};
