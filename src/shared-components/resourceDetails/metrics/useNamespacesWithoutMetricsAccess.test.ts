import { renderHook, waitFor } from '@testing-library/react';
import { checkAccess } from '@openshift-console/dynamic-plugin-sdk';
import {
  metricsAccessIn,
  useNamespacesWithoutMetricsAccess,
} from './useNamespacesWithoutMetricsAccess';

const mockCheckAccess = checkAccess as jest.Mock;

/** Refuses the given namespaces, allows the others. */
const refusing =
  (...refused: string[]) =>
  ({ namespace }: { namespace: string }) =>
    Promise.resolve({ status: { allowed: !refused.includes(namespace) } });

describe('useNamespacesWithoutMetricsAccess', () => {
  beforeEach(() => {
    mockCheckAccess.mockReset();
  });

  it('asks for the permission the metrics proxy checks, in each namespace', async () => {
    mockCheckAccess.mockImplementation(refusing());
    renderHook(() => useNamespacesWithoutMetricsAccess(['team-b', 'team-a']));
    await waitFor(() => {
      expect(mockCheckAccess).toHaveBeenCalledTimes(2);
    });
    expect(mockCheckAccess).toHaveBeenCalledWith(metricsAccessIn('team-a'));
    expect(metricsAccessIn('team-a')).toEqual({
      group: 'metrics.k8s.io',
      resource: 'pods',
      verb: 'get',
      namespace: 'team-a',
    });
  });

  it('returns the namespaces refused, sorted', async () => {
    mockCheckAccess.mockImplementation(refusing('team-c', 'team-a'));
    const { result } = renderHook(() =>
      useNamespacesWithoutMetricsAccess(['team-c', 'team-b', 'team-a']),
    );
    await waitFor(() => {
      expect(result.current).toEqual(['team-a', 'team-c']);
    });
  });

  it('takes a review that fails as allowed', async () => {
    mockCheckAccess.mockImplementation(() => Promise.reject(new Error('unavailable')));
    const { result } = renderHook(() => useNamespacesWithoutMetricsAccess(['team-a']));
    await waitFor(() => {
      expect(mockCheckAccess).toHaveBeenCalled();
    });
    expect(result.current).toEqual([]);
  });

  it('drops the answer for namespaces the page no longer charts', async () => {
    mockCheckAccess.mockImplementation(refusing('team-a'));
    const { result, rerender } = renderHook(
      ({ namespaces }) => useNamespacesWithoutMetricsAccess(namespaces),
      { initialProps: { namespaces: ['team-a'] } },
    );
    await waitFor(() => {
      expect(result.current).toEqual(['team-a']);
    });
    rerender({ namespaces: ['team-b'] });
    expect(result.current).toEqual([]);
  });

  it('asks nothing without namespaces', () => {
    const { result } = renderHook(() => useNamespacesWithoutMetricsAccess([]));
    expect(mockCheckAccess).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });
});
