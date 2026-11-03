import type { FC } from 'react';
import { Suspense, useMemo, useState } from 'react';
import {
  ExpandableSection,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  List,
  ListItem,
  Spinner,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  CodeEditor,
  ResourceLink,
  getGroupVersionKindForModel,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { evaluate as celEvaluate } from 'cel-js';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../../../reducers/brokerservice/reducer';
import { validateCelExpression } from '../../../validation/k8s';
import { BrokerAppModel } from '../../../k8s/models';
import type { BrokerAppCR } from '../../../k8s/types';

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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  const expression = cr.spec?.appSelectorExpression ?? '';
  const celError = validateCelExpression(expression) ?? undefined;
  const namespace = cr.metadata?.namespace ?? '';

  const [brokerApps, appsLoaded, appsError] = useK8sWatchResource<BrokerAppCR[]>({
    groupVersionKind: {
      group: BrokerAppModel.apiGroup,
      version: BrokerAppModel.apiVersion,
      kind: BrokerAppModel.kind,
    },
    isList: true,
  }) as [BrokerAppCR[], boolean, Error | undefined];

  /**
   * Evaluates the CEL expression against each BrokerApp and partitions
   * into matched and unmatched lists. Skips evaluation when the expression
   * is empty or has syntax errors.
   */
  const matched = useMemo(() => {
    if (!appsLoaded || !Array.isArray(brokerApps) || celError || !expression.trim()) {
      return [] as BrokerAppCR[];
    }

    const results: BrokerAppCR[] = [];
    for (const app of brokerApps) {
      try {
        const context = {
          app,
          service: cr,
          appNamespace: { metadata: { name: app.metadata?.namespace } },
          serviceNamespace: { metadata: { name: namespace } },
        };
        if (celEvaluate(expression, context) === true) {
          results.push(app);
        }
      } catch {
        // App doesn't satisfy the expression (e.g., missing field) — skip it
      }
    }
    return results;
  }, [expression, celError, brokerApps, appsLoaded, cr, namespace]);

  return (
    <FormSection title={t('Access Control')}>
      <FormGroup
        label={t('App Selector Expression')}
        fieldId="broker-service-app-selector-expression"
      >
        <div style={{ height: '120px', display: 'flex', flexDirection: 'column' }}>
          <Suspense fallback={<Spinner aria-label={t('Loading editor')} />}>
            <CodeEditor
              value={expression}
              language="plaintext"
              minHeight="120px"
              onChange={(val: string) => {
                dispatch({ type: 'SET_APP_SELECTOR_EXPRESSION', payload: val });
              }}
              isLineNumbersVisible={false}
              options={{
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                renderLineHighlight: 'none',
                folding: false,
              }}
              data-test="broker-service-app-selector-expression-input"
            />
          </Suspense>
        </div>
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={celError ? 'error' : 'default'}>
              {celError
                ? t('Invalid CEL syntax: {{details}}', { details: celError })
                : t(
                    'CEL expression that controls which BrokerApps can bind to this service. Leave empty for same-namespace only (default). Example: app.metadata.namespace == service.metadata.namespace',
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
        <ExpandableSection
          toggleText={
            isPreviewExpanded ? t('Hide matched apps preview') : t('Show matched apps preview')
          }
          isExpanded={isPreviewExpanded}
          onToggle={(_event, expanded) => {
            setIsPreviewExpanded(expanded);
          }}
          isIndented
          data-test="cel-preview-expandable"
        >
          <CelPreviewContent
            expression={expression}
            celError={celError}
            appsLoaded={appsLoaded}
            appsError={appsError}
            matched={matched}
            brokerAppsCount={brokerApps.length}
          />
        </ExpandableSection>
      </FormGroup>
    </FormSection>
  );
};

interface CelPreviewContentProps {
  expression: string;
  celError: string | undefined;
  appsLoaded: boolean;
  appsError: Error | undefined;
  matched: BrokerAppCR[];
  brokerAppsCount: number;
}

/**
 * Renders the preview results: matched apps list, loading/error states,
 * or contextual messages when the expression is empty or invalid.
 */
const CelPreviewContent: FC<CelPreviewContentProps> = ({
  expression,
  celError,
  appsLoaded,
  appsError,
  matched,
  brokerAppsCount,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  if (celError) {
    return (
      <HelperText>
        <HelperTextItem variant="warning">
          {t('Fix syntax errors to preview matched apps.')}
        </HelperTextItem>
      </HelperText>
    );
  }

  if (!expression.trim()) {
    return (
      <HelperText>
        <HelperTextItem>
          {t('No expression set. Default behavior: only apps in the same namespace will match.')}
        </HelperTextItem>
      </HelperText>
    );
  }

  if (appsError) {
    return (
      <HelperText>
        <HelperTextItem variant="error">
          {t('Error loading BrokerApps: {{details}}', { details: appsError.message })}
        </HelperTextItem>
      </HelperText>
    );
  }

  if (!appsLoaded) {
    return <Spinner size="md" aria-label={t('Loading BrokerApps')} />;
  }

  if (brokerAppsCount === 0) {
    return (
      <HelperText>
        <HelperTextItem>{t('No BrokerApps found')}</HelperTextItem>
      </HelperText>
    );
  }

  if (matched.length === 0) {
    return (
      <HelperText>
        <HelperTextItem variant="warning">
          {t('No BrokerApps match this expression ({{count}} evaluated).', {
            count: brokerAppsCount,
          })}
        </HelperTextItem>
      </HelperText>
    );
  }

  return (
    <>
      <HelperText>
        <HelperTextItem>
          {t('{{matched}} of {{total}} BrokerApps match this expression:', {
            matched: matched.length,
            total: brokerAppsCount,
          })}
        </HelperTextItem>
      </HelperText>
      <List isPlain>
        {matched.map((app) => (
          <ListItem key={`${app.metadata?.namespace ?? ''}/${app.metadata?.name ?? ''}`}>
            <ResourceLink
              groupVersionKind={getGroupVersionKindForModel(BrokerAppModel)}
              name={app.metadata?.name}
              namespace={app.metadata?.namespace}
            />
          </ListItem>
        ))}
      </List>
    </>
  );
};
