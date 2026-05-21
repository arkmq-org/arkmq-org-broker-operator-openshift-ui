import { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export enum EditorType {
  FORM = 'form',
  YAML = 'yaml',
}

export type MatchAddress = {
  address: string;
};

export type BrokerAppCapability = {
  producerOf?: MatchAddress[];
  consumerOf?: MatchAddress[];
  subscriberOf?: MatchAddress[];
};

export type BrokerAppSpec = {
  selector?: { matchLabels?: { [key: string]: string } };
  capabilities?: BrokerAppCapability[];
};

export type BrokerAppCR = K8sResourceCommon & {
  spec: BrokerAppSpec;
};
