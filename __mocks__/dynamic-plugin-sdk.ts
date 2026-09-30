import { createElement, type FC, type ReactNode } from 'react';

export const k8sCreate = jest.fn();
export const k8sGet = jest.fn();
export const k8sList = jest.fn();
export const k8sUpdate = jest.fn();
export const k8sDelete = jest.fn();
export const useK8sWatchResource = jest.fn(() => [[], false, undefined]);
export const useK8sWatchResources = jest.fn(() => ({}));
export const usePrometheusPoll = jest.fn(() => [undefined, false, undefined]);
export const useAccessReview = jest.fn(() => [true, false]);
export const useDeleteModal = jest.fn(() => jest.fn());
export const useLabelsModal = jest.fn(() => jest.fn());
export const useAnnotationsModal = jest.fn(() => jest.fn());
export const useUserPreference = jest.fn(() => [[], jest.fn(), true]);
export const useActivePerspective = jest.fn(() => ['admin', jest.fn()]);

export const useActiveNamespace = jest.fn(() => ['test-namespace', jest.fn()]);

export const ALL_NAMESPACES_KEY = '#ALL_NS#';

export const isAllNamespacesKey = jest.fn((ns: string) => ns === ALL_NAMESPACES_KEY);

export const DocumentTitle: FC<{ children: ReactNode }> = ({ children }) =>
  createElement('title', null, children);

export const ListPageHeader: FC<{
  title: string;
  children?: ReactNode;
  hideFavoriteButton?: boolean;
}> = ({ title, children }) =>
  createElement('div', { 'data-test': 'list-page-header' }, title, children);

export const ListPageBody: FC<{ children: ReactNode }> = ({ children }) =>
  createElement('div', { 'data-test': 'list-page-body' }, children);

export const ListPageCreateLink: FC<{
  to: string;
  children: ReactNode;
  createAccessReview?: unknown;
}> = ({ to, children }) =>
  createElement('a', { href: to, 'data-test': 'list-page-create-link' }, children);

export const ResourceLink: FC<{
  groupVersionKind: object;
  name: string;
  namespace?: string;
  dataTest?: string;
}> = ({ name, dataTest }) =>
  createElement('a', { 'data-test': dataTest ?? `resource-link-${name}` }, name);

export const Timestamp: FC<{ timestamp: string }> = ({ timestamp }) =>
  createElement('span', { 'data-test': 'timestamp' }, timestamp);

export const ErrorStatus: FC<{ title: string }> = ({ title }) =>
  createElement('span', { 'data-test': 'error-status' }, title);

export const getGroupVersionKindForModel = jest.fn(
  (model: { apiGroup: string; apiVersion: string; kind: string }) => ({
    group: model.apiGroup,
    version: model.apiVersion,
    kind: model.kind,
  }),
);

export const ResourceIcon: FC<{ groupVersionKind?: object }> = () =>
  createElement('span', { 'data-test': 'resource-icon' });

/** Renders tab names and the first page component so details Overview can be asserted in unit tests. */
export const HorizontalNav: FC<{
  pages: Array<{ name: string; href?: string; component: FC<{ obj?: unknown }> }>;
  resource?: unknown;
}> = ({ pages, resource }) => {
  const FirstPage = pages[0]?.component;
  return createElement(
    'div',
    { 'data-test': 'horizontal-nav' },
    ...pages.map((page) =>
      createElement('span', { key: page.name, 'data-test': `nav-tab-${page.name}` }, page.name),
    ),
    FirstPage ? createElement(FirstPage, { obj: resource }) : null,
  );
};

export const ResourceYAMLEditor: FC<{ initialResource: object; create?: boolean }> = () =>
  createElement('div', { 'data-test': 'resource-yaml-editor' });

export const QueryBrowser: FC<{
  queries: string[];
  namespace?: string;
  timespan?: number;
  pollInterval?: number;
  showLegend?: boolean;
  units?: string;
}> = ({ queries }) =>
  createElement('div', { 'data-test': 'query-browser', 'data-queries': JSON.stringify(queries) });

export enum PrometheusEndpoint {
  LABEL = 'api/v1/label',
  QUERY = 'api/v1/query',
  QUERY_RANGE = 'api/v1/query_range',
  RULES = 'api/v1/rules',
  TARGETS = 'api/v1/targets',
}
