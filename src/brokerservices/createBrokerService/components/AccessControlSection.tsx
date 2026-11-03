import type { FC } from 'react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import {
  Button,
  ExpandableSection,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  List,
  ListItem,
  Popover,
  Spinner,
} from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import {
  CodeEditor,
  ResourceLink,
  getGroupVersionKindForModel,
  useK8sWatchResource,
} from '@openshift-console/dynamic-plugin-sdk';
import { evaluate as celEvaluate } from '@marcbachmann/cel-js';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../../../reducers/brokerservice/reducer';
import { validateCelExpression } from '../../../validation/k8s';
import { BrokerAppModel } from '../../../k8s/models';
import type { BrokerAppCR } from '../../../k8s/types';

/** CEL variable/field tree for Monaco autocomplete suggestions. */
const CEL_COMPLETIONS: Record<string, string[]> = {
  app: ['metadata', 'spec'],
  service: ['metadata', 'spec'],
  appNamespace: ['metadata'],
  serviceNamespace: ['metadata'],
  metadata: ['name', 'namespace', 'labels'],
};

const EMPTY_APPS: BrokerAppCR[] = [];

/** Extracts the first line of a CEL error, stripping source-position snippets. */
const cleanCelError = (message: string): string => {
  const firstLine = message.split('\n')[0] ?? message;
  return firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;
};

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

  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

  const expression = cr.spec?.appSelectorExpression ?? '';
  const celError = validateCelExpression(expression) ?? undefined;
  const namespace = cr.metadata?.namespace ?? '';
  const [isEditorTouched, setIsEditorTouched] = useState(expression !== '');
  const showError = isEditorTouched && celError;

  /* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- Monaco types unavailable through the SDK */
  const onEditorDidMount = useCallback((editor: any, monaco: any) => {
    editor.onDidFocusEditorWidget(() => {
      setIsEditorTouched(false);
    });
    editor.onDidBlurEditorWidget(() => {
      setIsEditorTouched(true);
    });

    const completionDisposable = monaco.languages.registerCompletionItemProvider('plaintext', {
      triggerCharacters: ['.'],
      provideCompletionItems: (model: any, position: any) => {
        const textUntilPosition: string = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const match = /(?:(\w+)\.)?(\w*)$/.exec(textUntilPosition);
        const parent = match?.[1] ?? '';
        const partial = match?.[2] ?? '';
        const replaceRange = {
          startLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        const fields = parent ? CEL_COMPLETIONS[parent] : undefined;

        if (parent && !fields) {
          return { suggestions: [] };
        }

        if (fields) {
          return {
            suggestions: fields.map((field: string) => ({
              label: field,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: field,
              range: replaceRange,
            })),
          };
        }

        const topLevel = Object.keys(CEL_COMPLETIONS).filter((k) => !['metadata'].includes(k));
        return {
          suggestions: topLevel.map((label) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: label,
            range: replaceRange,
          })),
        };
      },
    });

    editor.onDidDispose(() => {
      completionDisposable.dispose();
    });
  }, []);
  /* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */

  const hasExpression = Boolean(expression.trim());
  const [watchedApps, appsLoaded, appsError] = useK8sWatchResource<BrokerAppCR[]>(
    hasExpression
      ? {
          groupVersionKind: {
            group: BrokerAppModel.apiGroup,
            version: BrokerAppModel.apiVersion,
            kind: BrokerAppModel.kind,
          },
          isList: true,
        }
      : null,
  ) as [BrokerAppCR[] | undefined, boolean, Error | undefined];
  const brokerApps = watchedApps ?? EMPTY_APPS;

  /**
   * Evaluates the CEL expression against each BrokerApp.
   * Skips evaluation when the expression is empty or has syntax errors.
   * Tracks per-app failures so a universal error can be surfaced with detail.
   */
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- capturedError is a local variable, not an external dependency
  const { matched, allFailed, firstError } = useMemo(() => {
    if (!appsLoaded || celError || !expression.trim()) {
      return { matched: [] as BrokerAppCR[], allFailed: false, firstError: undefined };
    }

    const results: BrokerAppCR[] = [];
    let failCount = 0;
    let capturedError: string | undefined;
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
      } catch (e) {
        failCount++;
        capturedError ??= e instanceof Error ? e.message : String(e);
      }
    }
    return {
      matched: results,
      allFailed: brokerApps.length > 0 && failCount === brokerApps.length,
      firstError: capturedError ? cleanCelError(capturedError) : undefined,
    };
  }, [expression, celError, brokerApps, appsLoaded, cr, namespace]);

  const previewToggleText = isPreviewExpanded
    ? t('Hide matched apps preview')
    : !expression.trim() || celError || !appsLoaded || appsError
      ? t('Show matched apps preview')
      : t('Show matched apps preview ({{matched}} of {{total}})', {
          matched: matched.length,
          total: brokerApps.length,
        });

  return (
    <FormSection title={t('Access Control')}>
      <FormGroup
        label={t('App Selector Expression')}
        labelHelp={
          <Popover
            headerContent={t('Available Variables')}
            bodyContent={
              <List isPlain>
                <ListItem>
                  <strong>app</strong> &mdash;{' '}
                  {t(
                    'BrokerApp object (.metadata.name, .metadata.namespace, .metadata.labels, .spec)',
                  )}
                </ListItem>
                <ListItem>
                  <strong>service</strong> &mdash;{' '}
                  {t(
                    'BrokerService object (.metadata.name, .metadata.namespace, .metadata.labels, .spec)',
                  )}
                </ListItem>
                <ListItem>
                  <strong>appNamespace</strong> &mdash;{' '}
                  {t('Namespace object where the app resides')}
                </ListItem>
                <ListItem>
                  <strong>serviceNamespace</strong> &mdash;{' '}
                  {t('Namespace object where the service resides')}
                </ListItem>
              </List>
            }
          >
            <Button
              variant="plain"
              aria-label={t('Available Variables')}
              icon={<OutlinedQuestionCircleIcon />}
              data-test="cel-variables-popover"
            />
          </Popover>
        }
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
              onEditorDidMount={onEditorDidMount}
              isLineNumbersVisible={false}
              options={{
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                renderLineHighlight: 'none',
                folding: false,
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
              }}
              data-test="broker-service-app-selector-expression-input"
            />
          </Suspense>
        </div>
        <FormHelperText>
          <HelperText>
            <HelperTextItem variant={showError ? 'error' : 'default'}>
              {showError
                ? t('Invalid CEL expression. Check syntax near the end of your input.')
                : t(
                    'CEL expression that controls which BrokerApps can bind to this service. Leave empty for same-namespace only (default). Example: app.metadata.namespace == service.metadata.namespace',
                  )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <ExpandableSection
          toggleText={previewToggleText}
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
            allFailed={allFailed}
            firstError={firstError}
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
  allFailed: boolean;
  firstError: string | undefined;
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
  allFailed,
  firstError,
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
        <HelperTextItem variant="warning">
          {t(
            'Preview requires cluster-wide read access to BrokerApps. The expression will still be evaluated by the operator when saved.',
          )}
        </HelperTextItem>
      </HelperText>
    );
  }

  if (!appsLoaded) {
    return <Spinner size="md" aria-label={t('Loading BrokerApps')} />;
  }

  if (allFailed && firstError) {
    return (
      <HelperText>
        <HelperTextItem variant="warning">
          {t('Expression could not be evaluated: {{details}}', { details: firstError })}
        </HelperTextItem>
      </HelperText>
    );
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
          {t('No BrokerApps match this expression ({{total}} evaluated).', {
            total: brokerAppsCount,
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
