import type { K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';

export enum EditorType {
  FORM = 'form',
  YAML = 'yaml',
}

/**
 * A capability entry: the app produces to or consumes from an address.
 * Without `appName` the address is the app's own (the operator treats it as owned
 * even when it is missing from `spec.addresses`); with `appName` it references an
 * address another app owns and gates.
 */
export interface AddressRef {
  address: string;
  /** Owning app of a cross-app reference; empty for the app's own addresses. */
  appName?: string;
  /** Namespace of the owning app; defaults to this app's namespace when `appName` is set. */
  appNamespace?: string;
  pubSub?: boolean;
  subscriptions?: string[];
}

export interface BrokerAppCapability {
  producerOf?: AddressRef[];
  consumerOf?: AddressRef[];
}

export interface ResourceList {
  cpu?: string;
  memory?: string;
}

export interface ResourceRequirements {
  requests?: ResourceList;
  limits?: ResourceList;
}

/**
 * An address this app owns. Private by default: other apps may only use it in a
 * role whose gate admits them. A gate is a CEL expression evaluated by the operator
 * with the requesting BrokerApp bound to `app`.
 */
export interface AddressSpec {
  address: string;
  pubSub?: boolean;
  subscriptions?: string[];
  /** Which apps may produce to this address; empty means none but the owner. */
  producerOfAppSelector?: string;
  /** Which apps may consume from this address; empty means none but the owner. */
  consumerOfAppSelector?: string;
}

export interface BrokerAppSpec {
  serviceSelector: { matchLabels?: Record<string, string> };
  capabilities?: BrokerAppCapability[];
  resources?: ResourceRequirements;
  /** Addresses whose lifecycle is tied to this app. */
  addresses?: AddressSpec[];
}

export interface BrokerAppServiceBinding {
  name: string;
  namespace: string;
  assignedPort: number;
}

export interface BrokerAppStatus {
  conditions?: K8sResourceCondition[];
  /** Set by the operator once the app is bound to a BrokerService. */
  service?: BrokerAppServiceBinding;
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
  /**
   * Optional container image override for the broker pods.
   * When absent the operator uses its built-in default image.
   */
  image?: string;
  /**
   * CEL expression that controls which BrokerApps can bind to this service.
   * Available variables: app, service, appNamespace, serviceNamespace.
   * When absent or empty the operator enforces same-namespace only
   * (app.metadata.namespace == service.metadata.namespace).
   */
  appSelectorExpression?: string;
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

/**
 * A BrokerApp the operator rejected during provisioning validation for a BrokerService.
 * Populated on BrokerService status when label/CEL (and similar) checks fail for a candidate app.
 */
export interface RejectedApp {
  /** Rejected BrokerApp name. */
  name: string;
  /** Rejected BrokerApp namespace. */
  namespace: string;
  /** Operator-supplied explanation of why provisioning was refused. */
  reason: string;
}

export type BrokerService = K8sResourceCommon & {
  spec?: BrokerServiceSpec;
  status?: {
    conditions?: K8sResourceCondition[];
    /** BrokerApps applied to this service, each as `<namespace>/<name>@<generation>`. */
    provisionedApps?: string[];
    /**
     * BrokerApps rejected during provisioning validation on this service.
     * Absent or empty when there are no rejections to show.
     */
    rejectedApps?: RejectedApp[];
  };
};
