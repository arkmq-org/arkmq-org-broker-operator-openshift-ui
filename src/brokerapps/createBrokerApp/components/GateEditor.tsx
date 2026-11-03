import * as React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Label,
  LabelGroup,
  Switch,
  TextInput,
  Tooltip,
} from '@patternfly/react-core';
import { OutlinedQuestionCircleIcon } from '@patternfly/react-icons';
import {
  ANY_NAMESPACE,
  compileGate,
  interpretGate,
  type GatePrincipal,
  type GateUniverse,
  type GateView,
} from '../../../dataflow/gates';
import { TypeaheadSelect } from '../../../shared-components/TypeaheadSelect';
import { validateCelExpression } from '../../../validation/k8s';

const PREFIX = 'plugin__arkmq-org-broker-operator-openshift-ui__address-manager';

/**
 * How the form holds one gate while editing. `principals` is the opinionated path
 * the form generates CEL for; `custom` keeps a hand-written expression verbatim
 * because the UI cannot turn it back into a list of parties.
 */
export type GateSetting =
  | { mode: 'principals'; principals: GatePrincipal[] }
  | { mode: 'custom'; expression: string };

/**
 * Turns a stored gate into its editable form: interpretable gates open as a list of
 * parties, anything else as a custom expression.
 *
 * @param expression - The CEL stored in the CR, if any
 * @param universe - Namespaces and apps to evaluate the gate against
 */
export const gateSettingFrom = (
  expression: string | undefined,
  universe: GateUniverse,
): GateSetting => {
  const view: GateView = interpretGate(expression, universe);
  if (view.kind === 'closed') return { mode: 'principals', principals: [] };
  if (view.kind === 'principals') return { mode: 'principals', principals: view.principals };
  return { mode: 'custom', expression: view.expression };
};

/** Human label of a principal: `namespace/app`, `namespace`, or the any-namespace wording. */
export const describePrincipal = (principal: GatePrincipal, anyNamespaceLabel: string): string => {
  const ns = principal.namespace === ANY_NAMESPACE ? anyNamespaceLabel : principal.namespace;
  return principal.appName ? `${ns}/${principal.appName}` : ns;
};

const samePrincipal = (a: GatePrincipal, b: GatePrincipal): boolean =>
  a.namespace === b.namespace && (a.appName ?? '') === (b.appName ?? '');

export interface GateEditorProps {
  /** Base for element ids and data-test attributes. */
  id: string;
  label: string;
  /** Already translated help text for the label tooltip. */
  helpText: string;
  value: GateSetting;
  onChange: (next: GateSetting) => void;
  universe: GateUniverse;
  universeLoaded: boolean;
}

/**
 * Edits who may use an owned address in one role. The default is a list of parties
 * (a namespace, or an app inside a namespace) from which the reducer writes the CEL;
 * the custom switch exposes the raw expression for anything the list cannot say.
 *
 * Switching from custom back to the list only works when the expression can be
 * interpreted, so a hand-written gate is never silently dropped.
 */
export const GateEditor: React.FC<GateEditorProps> = ({
  id,
  label,
  helpText,
  value,
  onChange,
  universe,
  universeLoaded,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [namespaceInput, setNamespaceInput] = useState('');
  const [appInput, setAppInput] = useState('');
  const [switchBlocked, setSwitchBlocked] = useState(false);

  const anyNamespaceLabel = t('Any namespace');
  const namespaceOptions = React.useMemo(
    () =>
      [anyNamespaceLabel, ...universe.namespaces].filter((ns) =>
        ns.toLowerCase().includes(namespaceInput.toLowerCase()),
      ),
    [universe.namespaces, namespaceInput, anyNamespaceLabel],
  );
  const chosenNamespace =
    namespaceInput.trim() === anyNamespaceLabel ? ANY_NAMESPACE : namespaceInput.trim();
  const appOptions = React.useMemo(
    () =>
      (universe.appsByNamespace[chosenNamespace] ?? []).filter((name) =>
        name.toLowerCase().includes(appInput.toLowerCase()),
      ),
    [universe.appsByNamespace, chosenNamespace, appInput],
  );

  const customError = value.mode === 'custom' ? validateCelExpression(value.expression) : null;

  const addPrincipal = () => {
    if (value.mode !== 'principals' || !chosenNamespace) return;
    const principal: GatePrincipal = appInput.trim()
      ? { namespace: chosenNamespace, appName: appInput.trim() }
      : { namespace: chosenNamespace };
    if (!value.principals.some((p) => samePrincipal(p, principal))) {
      onChange({ mode: 'principals', principals: [...value.principals, principal] });
    }
    setNamespaceInput('');
    setAppInput('');
  };

  const toggleMode = (custom: boolean) => {
    setSwitchBlocked(false);
    if (custom) {
      if (value.mode === 'principals') {
        onChange({ mode: 'custom', expression: compileGate(value.principals) });
      }
      return;
    }
    if (value.mode === 'custom') {
      const next = gateSettingFrom(value.expression, universe);
      if (next.mode === 'custom') {
        setSwitchBlocked(true);
        return;
      }
      onChange(next);
    }
  };

  return (
    <FormGroup
      label={label}
      fieldId={`${id}-namespace`}
      labelHelp={
        <Tooltip content={helpText}>
          <button
            type="button"
            aria-label={`${t('More info for')} ${label}`}
            onClick={(e) => {
              e.preventDefault();
            }}
            className={`${PREFIX}-help-icon`}
          >
            <OutlinedQuestionCircleIcon />
          </button>
        </Tooltip>
      }
      data-test={id}
    >
      <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
        <FlexItem>
          <Switch
            id={`${id}-custom-switch`}
            label={t('Custom expression')}
            isChecked={value.mode === 'custom'}
            onChange={(_e, checked) => {
              toggleMode(checked);
            }}
            data-test={`${id}-custom-switch`}
          />
          {switchBlocked && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant="warning">
                  {t(
                    'This expression cannot be edited as a list of namespaces. Clear it to start from a list.',
                  )}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FlexItem>

        {value.mode === 'custom' ? (
          <FlexItem>
            <TextInput
              id={`${id}-expression`}
              aria-label={`${label}: ${t('expression')}`}
              value={value.expression}
              onChange={(_e, expression) => {
                onChange({ mode: 'custom', expression });
              }}
              placeholder="app.metadata.namespace == 'team-b'"
              validated={customError ? 'error' : 'default'}
              data-test={`${id}-expression`}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={customError ? 'error' : 'default'}>
                  {customError
                    ? t(customError)
                    : t(
                        'Evaluated by the operator with the requesting BrokerApp bound to "app". Only namespace and app name gates are drawn on the diagram.',
                      )}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FlexItem>
        ) : (
          <>
            <FlexItem>
              <LabelGroup
                numLabels={8}
                aria-label={label}
                data-test={`${id}-principals`}
                categoryName={value.principals.length ? undefined : t('Nobody else')}
              >
                {value.principals.map((principal, i) => (
                  <Label
                    key={describePrincipal(principal, ANY_NAMESPACE)}
                    color={principal.appName ? 'purple' : 'blue'}
                    onClose={() => {
                      onChange({
                        mode: 'principals',
                        principals: value.principals.filter((p) => !samePrincipal(p, principal)),
                      });
                    }}
                    closeBtnAriaLabel={`${t('Remove')} ${describePrincipal(principal, anyNamespaceLabel)}`}
                    data-test={`${id}-principal-${String(i)}`}
                  >
                    {describePrincipal(principal, anyNamespaceLabel)}
                  </Label>
                ))}
              </LabelGroup>
            </FlexItem>
            <FlexItem>
              <Flex
                spaceItems={{ default: 'spaceItemsSm' }}
                alignItems={{ default: 'alignItemsFlexStart' }}
              >
                <FlexItem flex={{ default: 'flex_1' }}>
                  <TypeaheadSelect
                    id={`${id}-namespace`}
                    value={namespaceInput}
                    onChange={(val) => {
                      setNamespaceInput(val);
                      setAppInput('');
                    }}
                    onSelect={(val) => {
                      setNamespaceInput(val);
                      setAppInput('');
                    }}
                    options={namespaceOptions}
                    placeholder={t('Namespace')}
                    ariaLabel={`${label}: ${t('namespace')}`}
                    allowCreate
                    emptyText={universeLoaded ? t('No matching namespaces found') : t('Loading...')}
                    dataTest={`${id}-namespace`}
                  />
                </FlexItem>
                <FlexItem flex={{ default: 'flex_1' }}>
                  <TypeaheadSelect
                    id={`${id}-app`}
                    value={appInput}
                    onChange={setAppInput}
                    onSelect={setAppInput}
                    options={appOptions}
                    placeholder={t('Any app')}
                    ariaLabel={`${label}: ${t('app name')}`}
                    allowCreate
                    emptyText={t('No BrokerApps found in this namespace')}
                    isDisabled={!chosenNamespace}
                    dataTest={`${id}-app`}
                  />
                </FlexItem>
                <FlexItem>
                  <Button
                    variant="secondary"
                    onClick={addPrincipal}
                    isDisabled={!chosenNamespace}
                    data-test={`${id}-add`}
                  >
                    {t('Allow')}
                  </Button>
                </FlexItem>
              </Flex>
            </FlexItem>
          </>
        )}
      </Flex>
    </FormGroup>
  );
};
