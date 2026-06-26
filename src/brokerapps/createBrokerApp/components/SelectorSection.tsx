import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FormGroup,
  FormHelperText,
  FormSection,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Split,
  SplitItem,
  Stack,
  StackItem,
  TextInputGroup,
  TextInputGroupMain,
} from '@patternfly/react-core';
import { PlusCircleIcon, TimesIcon } from '@patternfly/react-icons';
import { useK8sWatchResource } from '@openshift-console/dynamic-plugin-sdk';
import type { BrokerService } from '../../../k8s/types';
import { BrokerServiceModel } from '../../../k8s/models';
import {
  useBrokerAppFormState,
  useBrokerAppFormDispatch,
} from '../../../reducers/brokerapp/reducer';

export interface SelectorSectionProps {
  namespace: string;
}

/** Identifies which field dropdown is currently open, if any. */
interface OpenField {
  labelId: string;
  field: 'key' | 'value';
}

/**
 * Service Selector section with typeahead dropdowns for BrokerService labels.
 * Watches BrokerServices in the namespace and provides key/value suggestions.
 */
export const SelectorSection: React.FC<SelectorSectionProps> = ({ namespace }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const state = useBrokerAppFormState();
  const dispatch = useBrokerAppFormDispatch();

  const [services, servicesLoaded, servicesError] = useK8sWatchResource<BrokerService[]>({
    groupVersionKind: {
      group: BrokerServiceModel.apiGroup,
      version: BrokerServiceModel.apiVersion,
      kind: BrokerServiceModel.kind,
    },
    namespace,
    isList: true,
  }) as [BrokerService[], boolean, Error | undefined];

  /** Maps label keys to their possible values from watched BrokerServices. */
  const valuesByKey = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!servicesLoaded || !Array.isArray(services)) return map;
    services.forEach((svc) => {
      const labels = svc.metadata?.labels ?? {};
      Object.entries(labels).forEach(([k, v]) => {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k)?.add(v);
      });
    });
    return map;
  }, [services, servicesLoaded]);

  /** Sorted list of all unique label keys across available BrokerServices. */
  const availableKeys = React.useMemo(() => Array.from(valuesByKey.keys()).sort(), [valuesByKey]);

  /** Prevents duplicate label keys across rows.*/
  const usedKeys = React.useMemo(
    () => new Set(state.matchLabels.map((l) => l.key).filter(Boolean)),
    [state.matchLabels],
  );

  /** Returns sorted values for a given label key. */
  const getValuesForKey = React.useCallback(
    (key: string): string[] => {
      const vals = valuesByKey.get(key);
      return vals ? Array.from(vals).sort() : [];
    },
    [valuesByKey],
  );

  // Typed open-field state — avoids string encoding (e.g. "${id}:key") and
  // keeps the dropdown open/closed independently of Redux or input values.
  const [openField, setOpenField] = React.useState<OpenField | null>(null);

  /**
   * Renders dropdown options with consistent loading/error/empty states.
   */
  const renderSelectOptions = (options: string[], emptyMessage: string): React.ReactNode => {
    if (servicesError) {
      return (
        <SelectOption isDisabled value="">
          {t('Error loading services')}
        </SelectOption>
      );
    }

    if (options.length > 0) {
      return options.map((option) => (
        <SelectOption key={option} value={option}>
          {option}
        </SelectOption>
      ));
    }

    return (
      <SelectOption isDisabled value="">
        {servicesLoaded ? emptyMessage : t('Loading...')}
      </SelectOption>
    );
  };

  return (
    <FormSection title={t('Service Selector')}>
      <FormGroup fieldId="brokerapp-selector">
        <FormHelperText>
          <HelperText>
            <HelperTextItem>
              {t(
                'Enter labels to match a BrokerService. Your app will be provisioned to a service with matching labels.',
              )}
            </HelperTextItem>
          </HelperText>
        </FormHelperText>
        <Stack hasGutter>
          {state.matchLabels.map((label) => {
            const isKeyOpen = openField?.labelId === label.id && openField.field === 'key';
            const isValueOpen = openField?.labelId === label.id && openField.field === 'value';

            const filteredKeys = availableKeys.filter(
              (k) =>
                (!label.key || k.toLowerCase().includes(label.key.toLowerCase())) &&
                (!usedKeys.has(k) || k === label.key),
            );
            const filteredValues = getValuesForKey(label.key).filter(
              (v) => !label.value || v.toLowerCase().includes(label.value.toLowerCase()),
            );

            return (
              <StackItem key={label.id}>
                <Split hasGutter>
                  <SplitItem isFilled>
                    <Select
                      id={`selector-key-${label.id}`}
                      isOpen={isKeyOpen}
                      onSelect={(_e, value) => {
                        dispatch({
                          type: 'UPDATE_MATCH_LABEL',
                          payload: { id: label.id, key: String(value), value: '' },
                        });
                        setOpenField(null);
                      }}
                      onOpenChange={(open) => {
                        if (!open) setOpenField(null);
                      }}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          variant="typeahead"
                          onClick={() => {
                            setOpenField(isKeyOpen ? null : { labelId: label.id, field: 'key' });
                          }}
                          isExpanded={isKeyOpen}
                          isFullWidth
                        >
                          <TextInputGroup isPlain>
                            <TextInputGroupMain
                              value={label.key}
                              onClick={() => {
                                setOpenField({ labelId: label.id, field: 'key' });
                              }}
                              onChange={(_e, val) => {
                                dispatch({
                                  type: 'UPDATE_MATCH_LABEL',
                                  payload: { id: label.id, key: val, value: label.value },
                                });
                                if (!isKeyOpen) setOpenField({ labelId: label.id, field: 'key' });
                              }}
                              autoComplete="off"
                              placeholder={t('Key (e.g., tier)')}
                              aria-label={t('Label key')}
                            />
                          </TextInputGroup>
                        </MenuToggle>
                      )}
                    >
                      <SelectList>
                        {renderSelectOptions(filteredKeys, t('No matching keys found'))}
                      </SelectList>
                    </Select>
                  </SplitItem>

                  <SplitItem className="pf-v6-u-color-200 pf-v6-u-flex-shrink-0">=</SplitItem>

                  <SplitItem isFilled>
                    <Select
                      id={`selector-value-${label.id}`}
                      isOpen={isValueOpen}
                      onSelect={(_e, value) => {
                        dispatch({
                          type: 'UPDATE_MATCH_LABEL',
                          payload: { id: label.id, key: label.key, value: String(value) },
                        });
                        setOpenField(null);
                      }}
                      onOpenChange={(open) => {
                        if (!open) setOpenField(null);
                      }}
                      toggle={(toggleRef) => (
                        <MenuToggle
                          ref={toggleRef}
                          variant="typeahead"
                          onClick={() => {
                            setOpenField(
                              isValueOpen ? null : { labelId: label.id, field: 'value' },
                            );
                          }}
                          isExpanded={isValueOpen}
                          isFullWidth
                        >
                          <TextInputGroup isPlain>
                            <TextInputGroupMain
                              value={label.value}
                              onClick={() => {
                                setOpenField({ labelId: label.id, field: 'value' });
                              }}
                              onChange={(_e, val) => {
                                dispatch({
                                  type: 'UPDATE_MATCH_LABEL',
                                  payload: { id: label.id, key: label.key, value: val },
                                });
                                if (!isValueOpen)
                                  setOpenField({ labelId: label.id, field: 'value' });
                              }}
                              autoComplete="off"
                              placeholder={t('Value (e.g., production)')}
                              aria-label={t('Label value')}
                            />
                          </TextInputGroup>
                        </MenuToggle>
                      )}
                    >
                      <SelectList>
                        {renderSelectOptions(filteredValues, t('No matching values found'))}
                      </SelectList>
                    </Select>
                  </SplitItem>

                  <SplitItem>
                    <Button
                      variant="plain"
                      onClick={() => {
                        if (state.matchLabels.length === 1) {
                          dispatch({
                            type: 'UPDATE_MATCH_LABEL',
                            payload: { id: label.id, key: '', value: '' },
                          });
                        } else {
                          dispatch({ type: 'REMOVE_MATCH_LABEL', payload: label.id });
                        }
                        setOpenField(null);
                      }}
                      aria-label={t('Remove label')}
                      isDisabled={state.matchLabels.length === 1 && !label.key && !label.value}
                      icon={<TimesIcon />}
                    />
                  </SplitItem>
                </Split>
              </StackItem>
            );
          })}
          <StackItem>
            <Button
              variant="link"
              onClick={() => {
                dispatch({ type: 'ADD_MATCH_LABEL' });
              }}
              icon={<PlusCircleIcon />}
            >
              {t('Add Match Label')}
            </Button>
          </StackItem>
        </Stack>
      </FormGroup>
    </FormSection>
  );
};
