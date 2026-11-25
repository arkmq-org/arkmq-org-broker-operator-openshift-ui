import type { FC } from 'react';
import { Label } from '@patternfly/react-core';
import type { K8sResourceCondition } from '../../k8s/types';
import {
  getReadyConditionDisplay,
  type ReadyConditionLabelKey,
} from '../resourceList/getReadyConditionDisplay';

export interface ResourceStatusBadgeProps {
  /** Condition list used to derive the badge semantic state. */
  conditions?: K8sResourceCondition[];
  /** Translated label for each semantic state key (e.g. Running → "Running" or "Provisioned"). */
  statusLabels: Record<ReadyConditionLabelKey, string>;
  /** Condition type to evaluate. Defaults to Ready; BrokerApp uses Deployed. */
  conditionType?: string;
  /** Mapping for non-error False statuses
   * BrokerService defaults to Warning; BrokerApp uses Pending.
   */
  falseWithoutErrorAs?: 'Warning' | 'Pending';
  /** Whether the resource is being deleted with pending message drain. */
  isDraining?: boolean;
  /** Optional test id for the badge element. */
  dataTest?: string;
}

/**
 * Shows a PatternFly status Label derived from a CR Ready-style condition.
 * Shared by BrokerService and BrokerApp details headers so list and details
 * pages stay consistent about Running / Warning / Failed / Pending mapping.
 */
export const ResourceStatusBadge: FC<ResourceStatusBadgeProps> = ({
  conditions,
  statusLabels,
  conditionType = 'Ready',
  falseWithoutErrorAs = 'Warning',
  isDraining = false,
  dataTest,
}) => {
  const { labelKey, color } = getReadyConditionDisplay(
    conditions,
    conditionType,
    falseWithoutErrorAs,
    isDraining,
  );

  return (
    <Label color={color} data-test={dataTest ?? 'resource-status-badge'}>
      {statusLabels[labelKey]}
    </Label>
  );
};
