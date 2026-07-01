import type { FC } from 'react';
import { Label } from '@patternfly/react-core';

type LabelColor = 'green' | 'yellow' | 'grey';

export const STATUS_COLORS: Record<string, LabelColor> = {
  Provisioned: 'green',
  Running: 'green',
  Pending: 'yellow',
  Warning: 'yellow',
};

/**
 * Shows a status value with a matching label color.
 *
 * @param status - Status text to display
 */
const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const color: LabelColor = STATUS_COLORS[status] ?? 'grey';
  return <Label color={color}>{status}</Label>;
};

export { StatusBadge };
