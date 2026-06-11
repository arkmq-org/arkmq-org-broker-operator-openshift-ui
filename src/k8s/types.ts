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

export type BrokerAppCR = K8sResourceCommon & {
  spec: BrokerAppSpec;
};

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
    conditions?: {
      type: string;
      status: string;
      lastTransitionTime?: string;
      reason?: string;
      message?: string;
    }[];
  };
};
