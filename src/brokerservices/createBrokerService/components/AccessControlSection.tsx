import type { FC } from 'react';
import { useState } from 'react';
import {
  ExpandableSection,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  List,
  ListItem,
  TextArea,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../../../reducers/brokerservice/reducer';
import { validateCelExpression } from '../../../validation/k8s';

/**
 * Access Control form section for BrokerService create/edit pages.
 * Renders a CEL expression editor field that controls which BrokerApps
 * can bind to this service, with help text documenting available variables
 * and the default same-namespace-only behavior.
 */
export const AccessControlSection: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { cr } = useBrokerServiceFormState();
  const dispatch = useBrokerServiceFormDispatch();

  const [isVariablesExpanded, setIsVariablesExpanded] = useState(false);

  const expression = cr.spec?.appSelectorExpression ?? '';
  const celError = validateCelExpression(expression) ?? undefined;

  return (
    <FormSection title={t('Access Control')}>
      <FormGroup
        label={t('App Selector Expression')}
        fieldId="broker-service-app-selector-expression"
      >
        <TextArea
          id="broker-service-app-selector-expression"
          name="broker-service-app-selector-expression"
          value={expression}
          onChange={(_event, val) => {
            dispatch({ type: 'SET_APP_SELECTOR_EXPRESSION', payload: val });
          }}
          validated={celError ? 'error' : 'default'}
          placeholder="app.metadata.namespace == service.metadata.namespace"
          aria-label={t('App Selector Expression')}
          data-test="broker-service-app-selector-expression-input"
          className="pf-v6-u-font-family-code-vf"
          rows={3}
          resizeOrientation="vertical"
        />
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={celError ? 'error' : 'default'}>
              {celError ??
                t(
                  'CEL expression that controls which BrokerApps can bind to this service. Leave empty for same-namespace only (default).',
                )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <ExpandableSection
          toggleText={
            isVariablesExpanded ? t('Hide available variables') : t('Show available variables')
          }
          isExpanded={isVariablesExpanded}
          onToggle={(_event, expanded) => {
            setIsVariablesExpanded(expanded);
          }}
          isIndented
          data-test="cel-variables-expandable"
        >
          <List isPlain>
            <ListItem>
              <strong>app</strong> &mdash;{' '}
              {t('BrokerApp object (.metadata.name, .metadata.namespace, .metadata.labels, .spec)')}
            </ListItem>
            <ListItem>
              <strong>service</strong> &mdash;{' '}
              {t(
                'BrokerService object (.metadata.name, .metadata.namespace, .metadata.labels, .spec)',
              )}
            </ListItem>
            <ListItem>
              <strong>appNamespace</strong> &mdash; {t('Namespace object where the app resides')}
            </ListItem>
            <ListItem>
              <strong>serviceNamespace</strong> &mdash;{' '}
              {t('Namespace object where the service resides')}
            </ListItem>
          </List>
        </ExpandableSection>
      </FormGroup>
    </FormSection>
  );
};
