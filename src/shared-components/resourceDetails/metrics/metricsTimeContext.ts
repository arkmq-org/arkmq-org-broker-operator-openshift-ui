import { createContext } from 'react';

/** The time window every chart of a Metrics section is drawn over. */
export interface MetricsTime {
  /** Time range shown, in milliseconds. */
  timespan: number;
  /** Refresh interval in milliseconds; no refresh when undefined. */
  pollInterval?: number;
}

/**
 * Carries the section toolbar's time range and refresh to its charts, so a
 * chart placed in the section follows the toolbar without being wired to it.
 * Outside a section, a chart shows the last 30 minutes without refreshing.
 */
export const MetricsTimeContext = createContext<MetricsTime>({ timespan: 30 * 60_000 });
