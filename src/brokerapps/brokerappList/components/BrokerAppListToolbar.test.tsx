import { Children, cloneElement, isValidElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrokerAppListToolbar } from './BrokerAppListToolbar';
import type { BrokerAppFilters } from './BrokerAppListToolbar';

// Mirror how DataViewFilters actually works: it receives onChange + values and
// injects value/onChange into each child via cloneElement, keyed by filterId.
jest.mock('@patternfly/react-data-view', () => ({
  DataViewToolbar: ({
    filters,
    pagination,
  }: {
    filters?: React.ReactNode;
    pagination?: React.ReactNode;
  }) => (
    <div>
      {filters}
      {pagination}
    </div>
  ),
  DataViewFilters: ({
    children,
    onChange,
    values,
  }: {
    children?: React.ReactElement[];
    onChange?: (key: string, values: Partial<BrokerAppFilters>) => void;
    values?: BrokerAppFilters;
    [k: string]: unknown;
  }) => (
    <>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const filterId = (child.props as { filterId: string }).filterId;
        return cloneElement(
          child as React.ReactElement<{
            value: string;
            onChange: (e: unknown, v: string) => void;
          }>,
          {
            value: values?.[filterId as keyof BrokerAppFilters] ?? '',
            onChange: (_e: unknown, v: string) => onChange?.(filterId, { [filterId]: v }),
          },
        );
      })}
    </>
  ),
  DataViewTextFilter: ({
    onChange,
    value,
    placeholder,
    'data-test': dataTest,
  }: {
    onChange?: (e: unknown, v: string) => void;
    value?: string;
    placeholder?: string;
    'data-test'?: string;
    [k: string]: unknown;
  }) => (
    <input
      data-test={dataTest ?? 'DataViewTextFilter'}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e, e.target.value)}
    />
  ),
}));

jest.mock('@patternfly/react-core', () => ({
  Pagination: ({
    itemCount,
    page,
    perPage,
    'data-test': dataTest,
  }: {
    itemCount?: number;
    page?: number;
    perPage?: number;
    'data-test'?: string;
    [k: string]: unknown;
  }) => (
    <div
      data-test={dataTest ?? 'Pagination'}
      data-count={itemCount}
      data-page={page}
      data-per-page={perPage}
    />
  ),
}));

const noop = jest.fn();

describe('BrokerAppListToolbar', () => {
  it('renders the search input with the current filter value', () => {
    render(
      <BrokerAppListToolbar
        filters={{ name: 'foo', status: '', provisionedService: '' }}
        itemCount={10}
        page={1}
        perPage={20}
        onSetFilters={noop}
        onSetPage={noop}
        onPerPageSelect={noop}
      />,
    );
    expect(screen.getByTestId('brokerapp-search')).toHaveValue('foo');
  });

  it('calls onSetFilters with the new name when the search input changes', () => {
    const onSetFilters = jest.fn();
    render(
      <BrokerAppListToolbar
        filters={{ name: '', status: '', provisionedService: '' }}
        itemCount={5}
        page={1}
        perPage={20}
        onSetFilters={onSetFilters}
        onSetPage={noop}
        onPerPageSelect={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('brokerapp-search'), {
      target: { value: 'order' },
    });
    expect(onSetFilters).toHaveBeenCalledWith({ name: 'order' });
  });

  it('calls onSetFilters with the new status when the status input changes', () => {
    const onSetFilters = jest.fn();
    render(
      <BrokerAppListToolbar
        filters={{ name: '', status: '', provisionedService: '' }}
        itemCount={5}
        page={1}
        perPage={20}
        onSetFilters={onSetFilters}
        onSetPage={noop}
        onPerPageSelect={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('brokerapp-status-filter'), {
      target: { value: 'Pending' },
    });
    expect(onSetFilters).toHaveBeenCalledWith({ status: 'Pending' });
  });

  it('calls onSetFilters with the service name when the service input changes', () => {
    const onSetFilters = jest.fn();
    render(
      <BrokerAppListToolbar
        filters={{ name: '', status: '', provisionedService: '' }}
        itemCount={5}
        page={1}
        perPage={20}
        onSetFilters={onSetFilters}
        onSetPage={noop}
        onPerPageSelect={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('brokerapp-service-filter'), {
      target: { value: 'prod-cluster' },
    });
    expect(onSetFilters).toHaveBeenCalledWith({ provisionedService: 'prod-cluster' });
  });

  it('renders the pagination with the correct item count and page', () => {
    render(
      <BrokerAppListToolbar
        filters={{ name: '', status: '', provisionedService: '' }}
        itemCount={42}
        page={2}
        perPage={20}
        onSetFilters={noop}
        onSetPage={noop}
        onPerPageSelect={noop}
      />,
    );
    const pagination = screen.getByTestId('brokerapp-pagination');
    expect(pagination).toHaveAttribute('data-count', '42');
    expect(pagination).toHaveAttribute('data-page', '2');
  });

  it('renders the search placeholder text', () => {
    render(
      <BrokerAppListToolbar
        filters={{ name: '', status: '', provisionedService: '' }}
        itemCount={0}
        page={1}
        perPage={20}
        onSetFilters={noop}
        onSetPage={noop}
        onPerPageSelect={noop}
      />,
    );
    expect(screen.getByPlaceholderText('Search by name...')).toBeInTheDocument();
  });
});
