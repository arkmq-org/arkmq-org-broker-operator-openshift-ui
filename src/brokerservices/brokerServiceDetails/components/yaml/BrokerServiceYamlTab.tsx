import type { FC } from 'react';
import { Suspense } from 'react';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import { PageSection, Spinner } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import type { BrokerService } from '../../../../k8s/types';
import '../../../../shared-components/yaml-editor-wrapper.css';

export interface BrokerServiceYamlTabProps {
  /** Watched BrokerService CR passed through HorizontalNav. */
  obj?: BrokerService;
}

/**
 * Editable YAML tab on the BrokerService details page.
 * The custom edit form is reached via the /edit route from list and details actions.
 */
export const BrokerServiceYamlTab: FC<BrokerServiceYamlTabProps> = ({ obj }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  if (!obj) {
    return null;
  }

  return (
    <PageSection data-test="broker-service-yaml-tab">
      <div className="plugin__arkmq-org-broker-operator-openshift-ui__yaml-editor-wrapper plugin__arkmq-org-broker-operator-openshift-ui__yaml-editor-wrapper--details">
        <Suspense fallback={<Spinner aria-label={t('Loading editor')} />}>
          <ResourceYAMLEditor initialResource={obj} />
        </Suspense>
      </div>
    </PageSection>
  );
};
