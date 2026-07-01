import type { FC } from 'react';
import { useState } from 'react';
import { Button, Flex, FlexItem, Label } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

interface LabelListProps {
  /** Labels from the resource to display. */
  labels: Record<string, string> | undefined;
  /** Number of labels to show before collapsing. */
  maxVisible?: number;
}

/**
 * Shows resource labels as compact chips.
 *
 * @param labels - Labels to render in the cell
 * @param maxVisible - Number of labels shown before the toggle appears
 */
const LabelList: FC<LabelListProps> = ({ labels, maxVisible = 1 }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(labels ?? {});

  if (entries.length === 0) {
    return <span>{t('—')}</span>;
  }

  const visible = expanded ? entries : entries.slice(0, maxVisible);
  const hiddenCount = entries.length - maxVisible;

  return (
    <Flex
      spaceItems={{ default: 'spaceItemsXs' }}
      flexWrap={{ default: 'wrap' }}
      alignItems={{ default: 'alignItemsCenter' }}
    >
      {visible.map(([key, value]) => (
        <FlexItem key={key}>
          <Label color="blue" isCompact>
            {key}={value}
          </Label>
        </FlexItem>
      ))}
      {hiddenCount > 0 && !expanded && (
        <FlexItem>
          <Button
            variant="link"
            isInline
            onClick={() => {
              setExpanded(true);
            }}
            data-test="label-list-show-more"
          >
            +{hiddenCount} {t('more')}
          </Button>
        </FlexItem>
      )}
      {expanded && hiddenCount > 0 && (
        <FlexItem>
          <Button
            variant="link"
            isInline
            onClick={() => {
              setExpanded(false);
            }}
            data-test="label-list-show-less"
          >
            {t('show less')}
          </Button>
        </FlexItem>
      )}
    </Flex>
  );
};

export { LabelList };
