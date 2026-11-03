import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SELECTION_EVENT,
  TopologyControlBar,
  TopologyView,
  Visualization,
  VisualizationProvider,
  VisualizationSurface,
  createTopologyControlButtons,
  defaultControlButtonsOptions,
  type Model,
  type SelectionEventListener,
} from '@patternfly/react-topology';
import {
  DATAFLOW_CLASS,
  dataflowComponentFactory,
  dataflowLayoutFactory,
  type DataflowEditing,
} from './topologyComponents';
import './dataflow.css';

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
 * BrokerApp details page and the BrokerService details page. It only draws the model
 * it is given and reports selections; what the picture means is decided in
 * `buildDataflowGraph`, what it looks like in `topologyComponents`.
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

  const controller = useMemo(() => {
    const visualization = new Visualization();
    visualization.registerLayoutFactory(dataflowLayoutFactory);
    visualization.registerComponentFactory(dataflowComponentFactory);
    return visualization;
  }, []);

  useEffect(() => {
    controller.fromModel(model, false);
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

  const controlButtons = useMemo(
    () =>
      createTopologyControlButtons({
        ...defaultControlButtonsOptions,
        zoomInCallback: () => {
          controller.getGraph().scaleBy(4 / 3);
        },
        zoomOutCallback: () => {
          controller.getGraph().scaleBy(0.75);
        },
        fitToScreenCallback: () => {
          controller.getGraph().fit(40);
        },
        resetViewCallback: () => {
          controller.getGraph().reset();
          controller.getGraph().layout();
        },
        legend: false,
        zoomInAriaLabel: t('Zoom in'),
        zoomOutAriaLabel: t('Zoom out'),
        fitToScreenAriaLabel: t('Fit to screen'),
        resetViewAriaLabel: t('Reset view'),
      }),
    [controller, t],
  );

  if (!model.nodes?.length && emptyState && !sideBar) {
    return <div data-test={dataTest}>{emptyState}</div>;
  }

  return (
    <div className={`${DATAFLOW_CLASS}-container`} style={{ height }} data-test={dataTest}>
      <TopologyView
        controlBar={<TopologyControlBar controlButtons={controlButtons} />}
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
