import type { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

export const BrokerAppModel: K8sModel = {
  apiGroup: 'broker.arkmq.org',
  apiVersion: 'v1beta2',
  kind: 'BrokerApp',
  label: 'BrokerApp',
  labelPlural: 'BrokerApps',
  plural: 'brokerapps',
  abbr: 'BAPP',
  namespaced: true,
  crd: true,
};

export const BrokerServiceModel: K8sModel = {
  apiVersion: 'v1beta2',
  apiGroup: 'broker.arkmq.org',
  kind: 'BrokerService',
  plural: 'brokerservices',
  namespaced: true,
  label: 'BrokerService',
  labelPlural: 'BrokerServices',
  abbr: 'BS',
  crd: true,
};
