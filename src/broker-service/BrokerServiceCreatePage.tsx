import { FC, useReducer, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom-v5-compat';
import { useTranslation } from 'react-i18next';
import { PageSection, Title, Content, Stack, StackItem } from '@patternfly/react-core';
import { load as parseYAML } from 'js-yaml';
import { EditorType } from '../k8s/types';
import { EditorToggle } from '../shared-components/EditorToggle';
import { BrokerServiceFormView } from './components/BrokerServiceFormView';
import { YamlEditorView } from '../shared-components/YamlEditorView/YamlEditorView';
import {
  brokerServiceReducer,
  createInitialBrokerServiceState,
  createEmptyBrokerService,
  BrokerServiceFormStateContext,
  BrokerServiceFormDispatchContext,
} from '../reducers/broker-service/reducer';

const BrokerServiceCreatePage: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { ns: namespace } = useParams<{ ns: string }>();

  const initialCr = useMemo(() => createEmptyBrokerService(namespace || ''), [namespace]);
  const [formState, dispatch] = useReducer(
    brokerServiceReducer,
    createInitialBrokerServiceState(initialCr),
  );

  const yamlContentRef = useRef('');

  const handleYamlChange = useCallback((content: string) => {
    yamlContentRef.current = content;
  }, []);

  const onSelectEditorType = (editorType: EditorType) => {
    if (formState.editorType === EditorType.YAML && editorType === EditorType.FORM) {
      if (yamlContentRef.current) {
        try {
          const parsed = parseYAML(yamlContentRef.current) as typeof formState.cr;
          dispatch({ type: 'SET_MODEL', payload: parsed });
        } catch {
          return;
        }
      }
      dispatch({ type: 'SET_EDITOR_TYPE', payload: EditorType.FORM });
    } else {
      dispatch({ type: 'SET_EDITOR_TYPE', payload: EditorType.YAML });
    }
  };

  return (
    <BrokerServiceFormStateContext.Provider value={formState}>
      <BrokerServiceFormDispatchContext.Provider value={dispatch}>
        <PageSection>
          <Stack hasGutter>
            <StackItem>
              <Title headingLevel="h1" size="2xl">
                {t('Create BrokerService')}
              </Title>
            </StackItem>
            <StackItem>
              <Content>
                {t(
                  'Provision a shared messaging infrastructure broker cluster. This resource defines the underlying broker deployment that applications will connect to via BrokerApp resources.',
                )}
              </Content>
            </StackItem>
            <StackItem>
              <EditorToggle value={formState.editorType} onChange={onSelectEditorType} />
            </StackItem>
            <StackItem>
              {formState.editorType === EditorType.FORM ? (
                <BrokerServiceFormView namespace={namespace || ''} />
              ) : (
                <YamlEditorView initialResource={formState.cr} onChange={handleYamlChange} />
              )}
            </StackItem>
          </Stack>
        </PageSection>
      </BrokerServiceFormDispatchContext.Provider>
    </BrokerServiceFormStateContext.Provider>
  );
};

export default BrokerServiceCreatePage;
