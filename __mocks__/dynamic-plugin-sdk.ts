import React from 'react';

export const k8sCreate = jest.fn();
export const k8sGet = jest.fn();
export const k8sList = jest.fn();
export const k8sUpdate = jest.fn();
export const k8sDelete = jest.fn();
export const useK8sWatchResource = jest.fn(() => [[], false, undefined]);
export const useAccessReview = jest.fn(() => [true, false]);

// Minimal pass-through stubs for the project-overview inventory components.
// These are rendered by BrokerAppOverviewItem; stubs let unit tests verify
// structure and content without needing the full console shell.
// Use data-test (not data-testid) to match the project's testIdAttribute convention.
export const InventoryItem: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement('div', { 'data-test': 'InventoryItem' }, children);

export const InventoryItemTitle: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement('div', { 'data-test': 'InventoryItemTitle' }, children);

export const InventoryItemBody: React.FC<{
  children?: React.ReactNode;
  error?: Error | null;
}> = ({ children, error }) =>
  React.createElement(
    'div',
    { 'data-test': 'InventoryItemBody', 'data-error': error ? 'true' : undefined },
    children,
  );

export const InventoryItemLoading: React.FC = () =>
  React.createElement('span', { 'data-test': 'InventoryItemLoading' });

export const InventoryItemStatus: React.FC<{
  count: number;
  linkTo: string;
  icon?: React.ReactNode;
}> = ({ count, linkTo }) =>
  React.createElement('span', {
    'data-test': 'InventoryItemStatus',
    'data-count': count,
    'data-link': linkTo,
  });
