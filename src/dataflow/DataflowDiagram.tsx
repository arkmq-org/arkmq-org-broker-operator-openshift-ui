import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  action,
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  GRAPH_LAYOUT_END_EVENT,
  LEFT_TO_RIGHT,
  PipelineDagreLayout,
  pipelineElementFactory,
  Point,
  SELECTION_EVENT,
  TopologyControlBar,
  TopologyView,
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
  type Graph,
  type GraphLayoutEndEventListener,
  type Layout,
  type SelectionEventListener,
} from '@patternfly/react-topology';
import type { DataflowGraph } from './graph';
import {
  DATAFLOW_CLASS,
  dataflowComponentFactory,
  PALETTE_TYPE,
  type DataflowEditing,
  type PaletteItem,
} from './pipelineComponents';
import { toPipelineModel, type DataflowLabels } from './pipelineModel';
import './dataflow.css';

const PIPELINE_LAYOUT = 'pipeline';
/**
 * Space between ranks. Dagre surrounds every nested group with hidden ranks and
 * spaces each of them by this amount, so with apps inside namespaces the library's
 * default (70) ends up putting boxes several pill widths apart.
 */
const RANK_SEPARATION = 20;
const FIT_PADDING = 80;
/** Zoom under which the pills drop their text; the first view never goes below it. */
const MIN_FIT_SCALE = 0.6;

/** The pipelines example's layout: compound dagre, left to right, longest-path ranking. */
const layoutFactory = (_type: string, graph: Graph): Layout =>
  new PipelineDagreLayout(graph, { rankdir: LEFT_TO_RIGHT, ranksep: RANK_SEPARATION });

/**
 * Fits the whole graph in the canvas, but never so small that the pills lose their
 * text: a graph wider than that starts top left at the minimum zoom and the viewer
 * pans. The library's own fit to screen has no such floor.
 */
const fitToView = (graph: Graph): void => {
  graph.fit(FIT_PADDING);
  if (graph.getScale() < MIN_FIT_SCALE) {
    graph.setScale(MIN_FIT_SCALE);
    graph.setPosition(new Point(FIT_PADDING / 2, FIT_PADDING / 2));
  }
};

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
  /** Width the side panel opens at; the viewer can resize it. */
  sideBarSize?: string;
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
  sideBarSize = '500px',
  dataTest = 'dataflow-diagram',
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const controller = useMemo(() => {
    const visualization = new Visualization();
    visualization.registerElementFactory(pipelineElementFactory);
    visualization.registerLayoutFactory(layoutFactory);
    visualization.registerComponentFactory(dataflowComponentFactory);
    visualization.addEventListener<GraphLayoutEndEventListener>(
      GRAPH_LAYOUT_END_EVENT,
      ({ graph }) => {
        fitToView(graph);
      },
    );
    return visualization;
  }, []);

  const model = useMemo(() => toPipelineModel(graph, labels), [graph, labels]);

  // As the pipeline groups example updates its model: merge, then lay out. Merging
  // keeps the elements the mounted pills hold (a replaced element throws "has no
  // parent" from their render); the explicit layout gives the merged elements
  // their new positions, which a merge alone does not.
  useEffect(() => {
    controller.fromModel(
      { ...model, graph: { id: 'g1', type: 'graph', layout: PIPELINE_LAYOUT } },
      true,
    );
    controller.getGraph().layout();
  }, [controller, model]);

  // A pill measures its text once, when it mounts, and on a cold page load that
  // measurement comes out short (the console's web font is not in use yet), leaving
  // the label and the badge drawn over each other. So the pills are mounted again
  // once the browser's fonts are ready, and whenever more fonts arrive: the epoch
  // travels through the controller state and keys each pill. (Mounting the whole
  // surface again instead loses the library's layers, and the connector handles.)
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    // jsdom has no font set; the browser always does
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    if (!fonts) return undefined;
    const remeasure = () => {
      setFontEpoch((epoch) => epoch + 1);
    };
    void fonts.ready.then(remeasure);
    fonts.addEventListener('loadingdone', remeasure);
    return () => {
      fonts.removeEventListener('loadingdone', remeasure);
    };
  }, []);

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

  // The palette uses the browser's drag and drop: the library's own only moves things
  // that already live inside the canvas.
  const acceptsPalette = (event: React.DragEvent) =>
    Boolean(editing) && event.dataTransfer.types.includes(PALETTE_TYPE);

  return (
    <div
      className={`${DATAFLOW_CLASS}-container`}
      style={{ height }}
      data-test={dataTest}
      onDragOver={(event) => {
        if (acceptsPalette(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!editing || !acceptsPalette(event)) return;
        event.preventDefault();
        const item = event.dataTransfer.getData(PALETTE_TYPE) as PaletteItem;
        const over = (event.target as Element).closest('[data-test^="dataflow-node-"]');
        const nodeId = over?.getAttribute('data-test')?.slice('dataflow-node-'.length);
        editing.onDropPalette(item, nodeId ?? undefined);
      }}
    >
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
                fitToView(controller.getGraph());
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
        defaultSideBarSize={sideBarSize}
      >
        <VisualizationProvider controller={controller}>
          <VisualizationSurface state={{ selectedIds: selectedIds ?? [], editing, fontEpoch }} />
        </VisualizationProvider>
      </TopologyView>
    </div>
  );
};
