import { render, screen } from '@testing-library/react';
import { usePrometheusPoll } from '@openshift-console/dynamic-plugin-sdk';
import type { PrometheusResponse } from '@openshift-console/dynamic-plugin-sdk';
import {
  BrokerServiceMemoryCell,
  brokerServiceMemoryQuery,
  formatMemoryMiGi,
  readInstantBytes,
} from './BrokerServiceMemoryCell';

const mockUsePrometheusPoll = usePrometheusPoll as jest.Mock;

/** Instant-vector response with one sample value. */
const vector = (bytes: string): PrometheusResponse => ({
  status: 'success',
  data: {
    resultType: 'vector',
    result: [{ metric: {}, value: [1_700_000_000, bytes] }],
  },
});

describe('formatMemoryMiGi', () => {
  it('formats bytes into binary Mi/Gi units', () => {
    expect(formatMemoryMiGi(512)).toBe('512 B');
    expect(formatMemoryMiGi(1536)).toBe(
      `${(1.5).toLocaleString(undefined, { maximumFractionDigits: 1 })} Ki`,
    );
    expect(formatMemoryMiGi(3.2 * 1024 ** 3)).toBe(
      `${(3.2).toLocaleString(undefined, { maximumFractionDigits: 1 })} Gi`,
    );
  });
});

describe('brokerServiceMemoryQuery', () => {
  it('returns empty query when name or namespace is missing so polling stays off', () => {
    expect(brokerServiceMemoryQuery(undefined, 'ns')).toBe('');
    expect(brokerServiceMemoryQuery('svc', undefined)).toBe('');
  });

  it('pins the broker pod working-set query to the service namespace', () => {
    expect(brokerServiceMemoryQuery('my-service', 'svc-ns')).toBe(
      'sum(container_memory_working_set_bytes{namespace="svc-ns", pod="my-service-ss-0", container!=""})',
    );
  });
});

describe('readInstantBytes', () => {
  it('returns undefined for empty or missing results', () => {
    expect(readInstantBytes(undefined)).toBeUndefined();
    expect(
      readInstantBytes({ status: 'success', data: { resultType: 'vector', result: [] } }),
    ).toBeUndefined();
  });

  it('parses the instant sample as a number of bytes', () => {
    expect(readInstantBytes(vector('3435973836.8'))).toBeCloseTo(3.2 * 1024 ** 3);
  });
});

describe('BrokerServiceMemoryCell', () => {
  beforeEach(() => {
    mockUsePrometheusPoll.mockReset();
    mockUsePrometheusPoll.mockReturnValue([undefined, false, undefined]);
  });

  it('shows N/A without polling when name or namespace is missing', () => {
    render(<BrokerServiceMemoryCell namespace="svc-ns" />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(mockUsePrometheusPoll).toHaveBeenCalledWith(expect.objectContaining({ query: '' }));
  });

  it('shows a loading spinner while the Prometheus poll has not finished', () => {
    mockUsePrometheusPoll.mockReturnValue([undefined, false, undefined]);
    render(<BrokerServiceMemoryCell name="my-service" namespace="svc-ns" />);
    expect(screen.getByLabelText('Loading memory')).toBeInTheDocument();
  });

  it('shows N/A when the query finished with no series (no running pod)', () => {
    mockUsePrometheusPoll.mockReturnValue([
      { status: 'success', data: { resultType: 'vector', result: [] } },
      true,
      undefined,
    ]);
    render(<BrokerServiceMemoryCell name="my-service" namespace="svc-ns" />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('shows N/A when the Prometheus poll returned an error', () => {
    mockUsePrometheusPoll.mockReturnValue([undefined, true, new Error('forbidden')]);
    render(<BrokerServiceMemoryCell name="my-service" namespace="svc-ns" />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('formats the working-set bytes from Prometheus', () => {
    mockUsePrometheusPoll.mockReturnValue([vector(String(3.2 * 1024 ** 3)), true, undefined]);
    render(<BrokerServiceMemoryCell name="my-service" namespace="svc-ns" />);
    expect(
      screen.getByText(`${(3.2).toLocaleString(undefined, { maximumFractionDigits: 1 })} Gi`),
    ).toBeInTheDocument();
    expect(mockUsePrometheusPoll).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'api/v1/query',
        namespace: 'svc-ns',
        query:
          'sum(container_memory_working_set_bytes{namespace="svc-ns", pod="my-service-ss-0", container!=""})',
        delay: 30_000,
      }),
    );
  });
});
