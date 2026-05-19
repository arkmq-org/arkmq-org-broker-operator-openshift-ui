// K8s model definitions for BrokerService resources
import { K8sModel } from '@openshift-console/dynamic-plugin-sdk';

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
