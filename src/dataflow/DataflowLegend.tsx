import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, FlexItem } from '@patternfly/react-core';
import { DATAFLOW_CLASS } from './pipelineComponents';
import './dataflow.css';

/**
 * Explains the diagram's vocabulary once per page: the arrow styles and the two
 * address backgrounds. Kept out of the SVG so it reads at any zoom level.
 */
export const DataflowLegend: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const item = (swatch: string, text: string) => (
    <FlexItem key={swatch}>
      <span
        className={`${DATAFLOW_CLASS}-legend-swatch ${DATAFLOW_CLASS}-legend-swatch--${swatch}`}
      />
      {text}
    </FlexItem>
  );
  return (
    <Flex
      className={`${DATAFLOW_CLASS}-legend`}
      spaceItems={{ default: 'spaceItemsLg' }}
      data-test="dataflow-legend"
    >
      {item('declared', t('Declared flow'))}
      {item('allowed', t('Allowed by a gate'))}
      {item('unused', t('Open door, nobody uses it'))}
      {item('broken', t('Refused by the owner'))}
      {item('owned', t('Address owned here'))}
      {item('foreign', t('Address owned elsewhere'))}
    </Flex>
  );
};
