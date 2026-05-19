import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export type BrokerServiceSpec = {
  resources?: {
    limits?: {
      memory?: string;
    };
  };
  env?: Array<{
    name: string;
    value: string;
  }>;
};

export type BrokerService = K8sResourceCommon & {
  spec?: BrokerServiceSpec;
  status?: {
    conditions?: Array<{
      type: string;
      status: string;
      lastTransitionTime?: string;
      reason?: string;
      message?: string;
    }>;
  };
};

// Editor type for Form/YAML toggle
export enum EditorType {
  FORM = 'form',
  YAML = 'yaml',
}
