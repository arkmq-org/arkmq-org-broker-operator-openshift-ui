import type { Dispatch, FC, RefObject } from 'react';
import { useState } from 'react';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  Flex,
  FlexItem,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  type MetricsToolbarAction,
  type MetricsToolbarState,
  type PollTime,
  type Span,
  pollTimeOptions,
  spanOptions,
} from './metricsTypes';

/**
 * Human-readable span labels. Uses literal t() keys so yarn i18n keeps them in locales
 * (dynamic keys like t(`last_${span}`) are stripped by the parser).
 */
function spanLabel(t: TFunction, span: Span): string {
  switch (span) {
    case '5m':
      return t('last 5 minutes');
    case '15m':
      return t('last 15 minutes');
    case '30m':
      return t('last 30 minutes');
    case '1h':
      return t('last 1 hour');
    case '6h':
      return t('last 6 hours');
    case '12h':
      return t('last 12 hours');
    case '1d':
      return t('last 1 day');
    case '2d':
      return t('last 2 days');
    case '1w':
      return t('last 1 week');
    case '2w':
      return t('last 2 weeks');
    default:
      return span;
  }
}

/** Human-readable refresh-interval labels with literal t() keys for i18n extraction. */
function pollTimeLabel(t: TFunction, pollTime: PollTime): string {
  switch (pollTime) {
    case '0':
      return t('Refresh Off');
    case '15s':
      return t('15 seconds');
    case '30s':
      return t('30 seconds');
    case '1m':
      return t('1 minute');
    case '5m':
      return t('5 minutes');
    case '15m':
      return t('15 minutes');
    case '30m':
      return t('30 minutes');
    case '1h':
      return t('1 hour');
    case '6h':
      return t('6 hours');
    case '1d':
      return t('1 day');
    case '2d':
      return t('2 days');
    case '1w':
      return t('1 week');
    case '2w':
      return t('2 weeks');
    default:
      return pollTime;
  }
}

export interface MetricsActionsProps {
  /** Current toolbar selections from the Metrics reducer. */
  state: MetricsToolbarState;
  /** Dispatches typed toolbar actions (poll / span / group). */
  dispatch: Dispatch<MetricsToolbarAction>;
  /** The groups of the section's charts, listed by the filter after All Metrics. */
  groups: string[];
}

/** The filter entry showing every chart; no group can be named empty. */
const ALL_GROUPS = '';

interface MetricsDropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface MetricsDropdownProps<T extends string = string> {
  ariaLabel: string;
  selected: T;
  options: MetricsDropdownOption<T>[];
  onSelect: (value: T) => void;
  dataTest?: string;
}

/** One metrics toolbar dropdown (filter, time range, or refresh). */
const MetricsDropdown = <T extends string>({
  ariaLabel,
  selected,
  options,
  onSelect,
  dataTest,
}: MetricsDropdownProps<T>): ReturnType<FC> => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === selected);
  const toggleLabel = selectedOption?.label ?? selected;

  return (
    <Dropdown
      isOpen={isOpen}
      onSelect={() => {
        setIsOpen(false);
      }}
      toggle={(toggleRef: RefObject<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => {
            setIsOpen((open) => !open);
          }}
          isExpanded={isOpen}
          aria-label={ariaLabel}
          data-test={dataTest}
        >
          {toggleLabel}
        </MenuToggle>
      )}
    >
      <DropdownList>
        {options.map((option) => (
          <DropdownItem
            key={option.value}
            onClick={() => {
              onSelect(option.value);
            }}
          >
            {option.label}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  );
};

/** Metrics toolbar: group filter, time range, and refresh interval. */
export const MetricsActions: FC<MetricsActionsProps> = ({ state, dispatch, groups }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const groupDropdownOptions: MetricsDropdownOption[] = [
    { value: ALL_GROUPS, label: t('All Metrics') },
    ...groups.map((group) => ({ value: group, label: group })),
  ];

  const spanDropdownOptions: MetricsDropdownOption<Span>[] = spanOptions.map((span) => ({
    value: span,
    label: spanLabel(t, span),
  }));

  const pollDropdownOptions: MetricsDropdownOption<PollTime>[] = pollTimeOptions.map(
    (pollTime) => ({
      value: pollTime,
      label: pollTimeLabel(t, pollTime),
    }),
  );

  return (
    <Flex
      spaceItems={{ default: 'spaceItemsMd' }}
      alignItems={{ default: 'alignItemsCenter' }}
      data-test="metrics-actions"
    >
      <FlexItem>
        <MetricsDropdown
          ariaLabel={t('Metric filter')}
          selected={state.group ?? ALL_GROUPS}
          options={groupDropdownOptions}
          onSelect={(value) => {
            dispatch({ type: 'FILTER_BY_GROUP', payload: value === ALL_GROUPS ? null : value });
          }}
          dataTest="metrics-actions-metrics-type"
        />
      </FlexItem>
      <FlexItem>
        <MetricsDropdown
          ariaLabel={t('Time range')}
          selected={state.span}
          options={spanDropdownOptions}
          onSelect={(value) => {
            dispatch({ type: 'CHANGE_TIME_RANGE', payload: value });
          }}
          dataTest="metrics-actions-span"
        />
      </FlexItem>
      <FlexItem>
        <MetricsDropdown
          ariaLabel={t('Refresh interval')}
          selected={state.pollTime}
          options={pollDropdownOptions}
          onSelect={(value) => {
            dispatch({ type: 'CHANGE_REFRESH_INTERVAL', payload: value });
          }}
          dataTest="metrics-actions-poll-time"
        />
      </FlexItem>
    </Flex>
  );
};
