import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  AlertActionCloseButton,
  Button,
  Form,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Stack,
  StackItem,
} from '@patternfly/react-core';
import { EditorType } from '../k8s/types';
import { EditorToggle } from './EditorToggle';
import { YamlEditorWrapper } from './YamlEditorWrapper';
import { FormActionGroup } from './FormActionGroup';

export type SwitchResult = { ok: true } | { ok: false; error: string };

interface ResourceFormEditorProps {
  initialResource: object;
  isFormValid?: boolean;
  onFormSubmit: () => Promise<void>;
  onYamlSave: (yaml: string) => Promise<void>;
  onSwitchToForm: (yaml: string) => SwitchResult;
  onCancel: () => void;
  createButtonTestId?: string;
  cancelButtonTestId?: string;
  children: React.ReactNode;
}

export const ResourceFormEditor: React.FC<ResourceFormEditorProps> = ({
  initialResource,
  isFormValid = true,
  onFormSubmit,
  onYamlSave,
  onSwitchToForm,
  onCancel,
  createButtonTestId,
  cancelButtonTestId,
  children,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const [editorType, setEditorType] = useState<EditorType>(EditorType.FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [yamlConvertError, setYamlConvertError] = useState<string | undefined>(undefined);
  const yamlContentRef = useRef('');
  const [yamlKey, setYamlKey] = useState(0);

  const handleYamlChange = useCallback((content: string) => {
    yamlContentRef.current = content;
    setSubmitError(undefined);
  }, []);

  const handleModeSwitch = (newType: EditorType) => {
    setSubmitError(undefined);
    if (newType === EditorType.FORM && yamlContentRef.current) {
      const result = onSwitchToForm(yamlContentRef.current);
      if (!result.ok) {
        setYamlConvertError(result.error);
        return;
      }
    }
    if (newType === EditorType.YAML) {
      setYamlKey((k) => k + 1);
    }
    setEditorType(newType);
  };

  /** Closes the YAML-conversion-failed modal and keeps the current YAML content for the user to fix. */
  const handleKeepYaml = () => {
    setYamlConvertError(undefined);
  };

  /** Closes the modal and remounts the YAML editor from initialResource, discarding the user's edits. */
  const handleResetToDefault = () => {
    setYamlConvertError(undefined);
    setYamlKey((k) => k + 1);
  };

  const handleFormSubmit = async () => {
    setSubmitError(undefined);
    setIsSubmitting(true);
    try {
      await onFormSubmit();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleYamlSave = async (yaml: string) => {
    if (isSubmitting) return;
    setSubmitError(undefined);
    setIsSubmitting(true);
    try {
      await onYamlSave(yaml);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack hasGutter>
      <StackItem>
        <EditorToggle value={editorType} onChange={handleModeSwitch} isDisabled={isSubmitting} />
      </StackItem>

      {submitError && (
        <StackItem>
          <Alert
            variant="danger"
            isInline
            title={t('An error occurred')}
            actionClose={
              <AlertActionCloseButton
                onClose={() => {
                  setSubmitError(undefined);
                }}
              />
            }
          >
            {submitError}
          </Alert>
        </StackItem>
      )}

      {editorType === EditorType.FORM ? (
        <StackItem>
          <Form>
            {children}
            <FormActionGroup
              isSubmitting={isSubmitting}
              isFormValid={isFormValid}
              onSubmit={() => {
                void handleFormSubmit();
              }}
              onCancel={onCancel}
              createButtonTestId={createButtonTestId}
              cancelButtonTestId={cancelButtonTestId}
            />
          </Form>
        </StackItem>
      ) : (
        <StackItem>
          <YamlEditorWrapper
            key={yamlKey}
            initialResource={initialResource}
            onChange={handleYamlChange}
            onSave={(yaml) => {
              void handleYamlSave(yaml);
            }}
          />
        </StackItem>
      )}

      <Modal
        isOpen={yamlConvertError !== undefined}
        variant="small"
        onClose={handleKeepYaml}
        aria-label={t('YAML cannot be converted to form view')}
      >
        <ModalHeader
          title={t('Cannot switch to Form view')}
          titleIconVariant="danger"
          description={t('Your YAML could not be converted to the form. Choose how to proceed.')}
        />
        <ModalBody>
          <Alert variant="danger" isInline title={t('Conversion error')}>
            {yamlConvertError}
          </Alert>
        </ModalBody>
        <ModalFooter>
          <Button variant="primary" onClick={handleKeepYaml}>
            {t('Edit YAML')}
          </Button>
          <Button variant="secondary" onClick={handleResetToDefault}>
            {t('Reset to Default')}
          </Button>
        </ModalFooter>
      </Modal>
    </Stack>
  );
};
