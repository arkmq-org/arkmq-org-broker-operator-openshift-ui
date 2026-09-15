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
  submitLabel?: string;
  onReload?: () => void;
  /** Enables cancel/reload confirmation modals when the form has unsaved changes. */
  hasChanges?: boolean;
  /** Resource kind shown in the reload modal title (e.g. "BrokerApp"). */
  resourceName?: string;
  createButtonTestId?: string;
  cancelButtonTestId?: string;
  reloadButtonTestId?: string;
  children: React.ReactNode;
}

export const ResourceFormEditor: React.FC<ResourceFormEditorProps> = ({
  initialResource,
  isFormValid = true,
  onFormSubmit,
  onYamlSave,
  onSwitchToForm,
  onCancel,
  submitLabel,
  onReload,
  hasChanges = false,
  resourceName,
  createButtonTestId,
  cancelButtonTestId,
  reloadButtonTestId,
  children,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const [editorType, setEditorType] = useState<EditorType>(EditorType.FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [yamlConvertError, setYamlConvertError] = useState<string | undefined>(undefined);
  const yamlContentRef = useRef('');
  const [yamlKey, setYamlKey] = useState(0);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isReloadModalOpen, setIsReloadModalOpen] = useState(false);

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

  const handleCancel = useCallback(() => {
    if (hasChanges) {
      setIsCancelModalOpen(true);
    } else {
      onCancel();
    }
  }, [hasChanges, onCancel]);

  const handleReload = useCallback(() => {
    if (!onReload) return;
    if (hasChanges) {
      setIsReloadModalOpen(true);
    } else {
      onReload();
    }
  }, [hasChanges, onReload]);

  return (
    <>
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
                onCancel={handleCancel}
                submitLabel={submitLabel}
                onReload={onReload ? handleReload : undefined}
                createButtonTestId={createButtonTestId}
                cancelButtonTestId={cancelButtonTestId}
                reloadButtonTestId={reloadButtonTestId}
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
      </Stack>

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

      <Modal
        isOpen={isCancelModalOpen}
        variant="small"
        onClose={() => {
          setIsCancelModalOpen(false);
        }}
        aria-label={t('Confirm cancel')}
      >
        <ModalHeader title={t('Discard changes?')} titleIconVariant="warning" />
        <ModalBody>
          {t('You are about to leave the editor. Changes that are not saved will be lost.')}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => {
              setIsCancelModalOpen(false);
              onCancel();
            }}
            data-test="confirm-cancel-btn"
          >
            {t('Discard')}
          </Button>
          <Button
            variant="link"
            onClick={() => {
              setIsCancelModalOpen(false);
            }}
          >
            {t('Keep editing')}
          </Button>
        </ModalFooter>
      </Modal>

      {onReload && (
        <Modal
          isOpen={isReloadModalOpen}
          variant="small"
          onClose={() => {
            setIsReloadModalOpen(false);
          }}
          aria-label={t('Confirm reload')}
        >
          <ModalHeader
            title={
              resourceName ? t('Reload {{resourceName}}?', { resourceName }) : t('Reload resource?')
            }
            titleIconVariant="warning"
          />
          <ModalBody>
            {t(
              'Upon reloading, local modifications will be lost. The form will be reset to the current state of the resource on the cluster.',
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="primary"
              onClick={() => {
                setIsReloadModalOpen(false);
                onReload();
              }}
              data-test="confirm-reload-btn"
            >
              {t('Reload')}
            </Button>
            <Button
              variant="link"
              onClick={() => {
                setIsReloadModalOpen(false);
              }}
            >
              {t('Cancel')}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
};
