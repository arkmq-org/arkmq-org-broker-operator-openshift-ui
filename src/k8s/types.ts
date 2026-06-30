import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export enum EditorType {
  FORM = 'form',
  YAML = 'yaml',
}

export interface MatchAddress {
  address: string;
}

export interface BrokerAppCapability {
  producerOf?: MatchAddress[];
  consumerOf?: MatchAddress[];
  subscriberOf?: MatchAddress[];
}

export interface BrokerAppSpec {
  selector?: { matchLabels?: Record<string, string> };
  capabilities?: BrokerAppCapability[];
}

export interface BrokerAppStatus {
  conditions?: K8sResourceCondition[];
  /** Set by the operator once the app is bound to a BrokerService. */
  service?: { name: string; namespace: string };
}

export type BrokerAppCR = K8sResourceCommon & {
  spec: BrokerAppSpec;
  status?: BrokerAppStatus;
};

export enum K8sResourceConditionStatus {
  True = 'True',
  False = 'False',
  Unknown = 'Unknown',
}

export interface K8sResourceCondition {
  type: string;
  status: K8sResourceConditionStatus;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

export interface BrokerServiceSpec {
  resources?: {
    limits?: {
      memory?: string;
    };
  };
  env?: {
    name: string;
    value: string;
  }[];
}

export type BrokerService = K8sResourceCommon & {
  spec?: BrokerServiceSpec;
  status?: {
    conditions?: K8sResourceCondition[];
  };
};
