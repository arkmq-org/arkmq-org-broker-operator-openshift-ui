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

interface YamlEditorWithChangeTrackingProps {
  initialResource: object;
  create: boolean;
  onContentChange: (content: string, hasUnsavedChanges: boolean) => void;
  onSave: (yaml: string) => void;
}

/** Tracks YAML edits in an isolated instance that remounts when the editor session resets. */
const YamlEditorWithChangeTracking: React.FC<YamlEditorWithChangeTrackingProps> = ({
  initialResource,
  create,
  onContentChange,
  onSave,
}) => {
  const baselineYamlRef = useRef<string | null>(null);

  const handleYamlChange = useCallback(
    (content: string) => {
      if (baselineYamlRef.current === null) {
        baselineYamlRef.current = content;
        onContentChange(content, false);
        return;
      }
      onContentChange(content, content !== baselineYamlRef.current);
    },
    [onContentChange],
  );

  return (
    <YamlEditorWrapper
      initialResource={initialResource}
      create={create}
      onChange={handleYamlChange}
      onSave={onSave}
    />
  );
};

interface ResourceFormEditorProps {
  initialResource: object;
  isFormValid?: boolean;
  onFormSubmit: () => Promise<void>;
  onYamlSave: (yaml: string) => Promise<void>;
  onSwitchToForm: (yaml: string) => SwitchResult;
  onCancel: () => void;
  submitLabel?: string;
  onReload?: () => void | Promise<void>;
  /** Enables cancel/reload confirmation modals when the form has unsaved changes. */
  hasChanges?: boolean;
  /** Resource kind shown in the reload modal title (e.g. "BrokerApp"). */
  resourceName?: string;
  isReloading?: boolean;
  /** Bumps when the backing resource is re-fetched so the YAML editor remounts. */
  editorResetKey?: number;
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
  isReloading = false,
  editorResetKey = 0,
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
  const [hasUnsavedYamlChanges, setHasUnsavedYamlChanges] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isReloadModalOpen, setIsReloadModalOpen] = useState(false);

  const hasAnyUnsavedChanges = hasChanges || hasUnsavedYamlChanges;
  const yamlSessionKey = `${String(yamlKey)}-${String(editorResetKey)}`;
  const isCreateMode = !onReload;

  const handleYamlContentChange = useCallback((content: string, yamlChanged: boolean) => {
    yamlContentRef.current = content;
    setHasUnsavedYamlChanges(yamlChanged);
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
      setHasUnsavedYamlChanges(false);
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
    setHasUnsavedYamlChanges(false);
    setYamlKey((k) => k + 1);
  };

  const performReload = useCallback(async () => {
    setSubmitError(undefined);
    setHasUnsavedYamlChanges(false);
    try {
      await onReload?.();
    } finally {
      setYamlKey((k) => k + 1);
    }
  }, [onReload]);

  const handleCancel = useCallback(() => {
    if (hasAnyUnsavedChanges) {
      setIsCancelModalOpen(true);
    } else {
      onCancel();
    }
  }, [hasAnyUnsavedChanges, onCancel]);

  const handleReload = useCallback(() => {
    if (!onReload) return;
    if (hasAnyUnsavedChanges) {
      setIsReloadModalOpen(true);
    } else {
      void performReload();
    }
  }, [hasAnyUnsavedChanges, onReload, performReload]);

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
                isReloading={isReloading}
                createButtonTestId={createButtonTestId}
                cancelButtonTestId={cancelButtonTestId}
                reloadButtonTestId={reloadButtonTestId}
              />
            </Form>
          </StackItem>
        ) : (
          <StackItem>
            <YamlEditorWithChangeTracking
              key={yamlSessionKey}
              initialResource={initialResource}
              create={isCreateMode}
              onContentChange={handleYamlContentChange}
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
                void performReload();
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
