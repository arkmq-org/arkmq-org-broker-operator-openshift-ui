import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  action,
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  GRAPH_LAYOUT_END_EVENT,
  LEFT_TO_RIGHT,
  PipelineDagreLayout,
  pipelineElementFactory,
  SELECTION_EVENT,
  TopologyControlBar,
  TopologyView,
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
  type Graph,
  type Layout,
  type SelectionEventListener,
} from '@patternfly/react-topology';
import type { DataflowGraph } from './graph';
import {
  DATAFLOW_CLASS,
  dataflowComponentFactory,
  type DataflowEditing,
} from './pipelineComponents';
import { toPipelineModel, type DataflowLabels } from './pipelineModel';
import './dataflow.css';

const PIPELINE_LAYOUT = 'pipeline';

/** The pipelines example's layout: compound dagre, left to right, longest-path ranking. */
const layoutFactory = (_type: string, graph: Graph): Layout =>
  new PipelineDagreLayout(graph, { rankdir: LEFT_TO_RIGHT });

export interface DataflowDiagramProps {
  /** The graph to draw; a new object triggers a re-layout. */
  graph: DataflowGraph;
  labels: DataflowLabels;
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
 * The messaging flows as a pipeline, shared by the BrokerApp form, the BrokerApp
 * details page and the BrokerService details page: react-topology's pipelines
 * package drawing our graph. It draws the graph it is given and reports selections;
 * what the picture means is decided in `buildDataflowGraph`, what it looks like in
 * `pipelineComponents`.
 *
 * The topology controller is a mobx store outside React, so feeding it the model is a
 * side effect on an external system, which is what the effects below do.
 */
export const DataflowDiagram: React.FC<DataflowDiagramProps> = ({
  graph,
  labels,
  selectedIds,
  onSelect,
  sideBar,
  editing,
  emptyState,
  height = '32rem',
  dataTest = 'dataflow-diagram',
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const controller = useMemo(() => {
    const visualization = new Visualization();
    visualization.registerElementFactory(pipelineElementFactory);
    visualization.registerLayoutFactory(layoutFactory);
    visualization.registerComponentFactory(dataflowComponentFactory);
    // Fit the picture after each layout, but never zoom in past 1:1, which the
    // library's fit would do for a small graph.
    visualization.addEventListener(GRAPH_LAYOUT_END_EVENT, () => {
      const graph = visualization.getGraph();
      graph.fit(40);
      if (graph.getScale() > 1) graph.setScale(1);
    });
    return visualization;
  }, []);

  const model = useMemo(() => toPipelineModel(graph, labels), [graph, labels]);

  // Merge, do not replace: a replaced model detaches every element while the pills
  // that read `element.getGraph()` are still mounted, and they throw "has no parent".
  // Merging updates the elements in place and drops only the stale ones.
  useEffect(() => {
    controller.fromModel(
      { ...model, graph: { id: 'g1', type: 'graph', layout: PIPELINE_LAYOUT } },
      true,
    );
    // Below the "medium" zoom the pills and groups hide their labels, which fitting a
    // whole service to the screen would otherwise trigger; keep the detailed picture
    // down to a far smaller zoom than the library's default.
    controller.getGraph().setDetailsLevelThresholds({ low: 0.1, medium: 0.2 });
  }, [controller, model]);

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

  return (
    <div className={`${DATAFLOW_CLASS}-container`} style={{ height }} data-test={dataTest}>
      <TopologyView
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
                controller.getGraph().fit(40);
              }),
              resetViewCallback: action(() => {
                controller.getGraph().reset();
                controller.getGraph().layout();
              }),
              legend: false,
              zoomInAriaLabel: t('Zoom in'),
              zoomOutAriaLabel: t('Zoom out'),
              fitToScreenAriaLabel: t('Fit to screen'),
              resetViewAriaLabel: t('Reset view'),
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
