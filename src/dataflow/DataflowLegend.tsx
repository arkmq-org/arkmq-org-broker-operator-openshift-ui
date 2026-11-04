import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Flex, FlexItem } from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import { DATAFLOW_CLASS } from './pipelineComponents';
import './dataflow.css';

export interface DataflowLegendProps {
  /**
   * `app`: one app's view, where an address may belong to another app and a gate
   * is a promise not yet taken up. `service`: the whole world, where every address
   * belongs to an app on the page and a gate is either used or an open door.
   */
  scope: 'app' | 'service';
}

/**
 * Explains the diagram's vocabulary once per page: the arrow styles, and on an app
 * page the marks on address pills. Kept out of the SVG so it reads at any zoom level.
 */
export const DataflowLegend: FC<DataflowLegendProps> = ({ scope }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const arrow = (swatch: string, text: string) => (
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
      {arrow('declared', t('Declared flow'))}
      {scope === 'app'
        ? arrow('allowed', t('Allowed by a gate, use unknown from here'))
        : arrow('unused', t('Open door, nobody uses it'))}
      {arrow('broken', t('Refused by the owner'))}
      {scope === 'app' ? (
        <>
          <FlexItem>
            <ExternalLinkAltIcon className="pf-v6-u-mr-xs" />
            {t('Address owned by another app')}
          </FlexItem>
          <FlexItem>
            <span className={`${DATAFLOW_CLASS}-legend-badge`}>{t('open')}</span>
            {t('Opened to other apps by a gate')}
          </FlexItem>
          <FlexItem>
            <span className={`${DATAFLOW_CLASS}-legend-draft`} />
            {t('Draft, not in the YAML until connected')}
          </FlexItem>
        </>
      ) : null}
    </Flex>
  );
};
