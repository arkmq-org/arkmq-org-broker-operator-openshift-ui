export const k8sCreate = jest.fn();
export const k8sGet = jest.fn();
export const k8sList = jest.fn();
export const k8sUpdate = jest.fn();
export const k8sDelete = jest.fn();
export const useK8sWatchResource = jest.fn(() => [[], false, undefined]);
export const useAccessReview = jest.fn(() => [true, false]);
