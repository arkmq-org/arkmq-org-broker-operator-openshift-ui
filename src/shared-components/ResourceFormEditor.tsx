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
  mode?: 'create' | 'edit';
  onReload?: () => void | Promise<void>;
  /** When true in edit mode, Cancel and Reload prompt before discarding unsaved form changes. */
  hasUnsavedChanges?: boolean;
  isReloading?: boolean;
  /** Bumps when the backing resource is re-fetched so the YAML editor remounts. */
  editorResetKey?: number;
  createButtonTestId?: string;
  saveButtonTestId?: string;
  reloadButtonTestId?: string;
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
  mode = 'create',
  onReload,
  hasUnsavedChanges = false,
  isReloading = false,
  editorResetKey = 0,
  createButtonTestId,
  saveButtonTestId,
  reloadButtonTestId,
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
  const [hasUnsavedYamlChanges, setHasUnsavedYamlChanges] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);

  const hasAnyUnsavedChanges = hasUnsavedChanges || hasUnsavedYamlChanges;
  const yamlSessionKey = `${String(yamlKey)}-${String(editorResetKey)}`;

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

  const performReload = async () => {
    setSubmitError(undefined);
    setHasUnsavedYamlChanges(false);
    try {
      await onReload?.();
    } finally {
      setYamlKey((k) => k + 1);
    }
  };

  const handleReloadRequest = () => {
    if (mode === 'edit' && hasAnyUnsavedChanges) {
      setShowReloadConfirm(true);
      return;
    }
    void performReload();
  };

  const handleCancelRequest = () => {
    if (mode === 'edit' && hasAnyUnsavedChanges) {
      setShowCancelConfirm(true);
      return;
    }
    onCancel();
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
              mode={mode}
              onSubmit={() => {
                void handleFormSubmit();
              }}
              onReload={onReload ? handleReloadRequest : undefined}
              isReloading={isReloading}
              onCancel={handleCancelRequest}
              createButtonTestId={createButtonTestId}
              saveButtonTestId={saveButtonTestId}
              reloadButtonTestId={reloadButtonTestId}
              cancelButtonTestId={cancelButtonTestId}
            />
          </Form>
        </StackItem>
      ) : (
        <StackItem>
          <YamlEditorWithChangeTracking
            key={yamlSessionKey}
            initialResource={initialResource}
            create={mode === 'create'}
            onContentChange={handleYamlContentChange}
            onSave={(yaml) => {
              void handleYamlSave(yaml);
            }}
          />
        </StackItem>
      )}

      <Modal
        isOpen={showCancelConfirm}
        variant="small"
        onClose={() => {
          setShowCancelConfirm(false);
        }}
        aria-label={t('Unsaved changes')}
      >
        <ModalHeader title={t('Unsaved changes')} />
        <ModalBody>
          {t('You are about to quit the editor. Configuration that is not applied will be lost.')}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setShowCancelConfirm(false);
              onCancel();
            }}
            data-test="confirm-discard-cancel-button"
          >
            {t('Confirm')}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setShowCancelConfirm(false);
            }}
            data-test="dismiss-discard-cancel-button"
          >
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={showReloadConfirm}
        variant="small"
        onClose={() => {
          setShowReloadConfirm(false);
        }}
        aria-label={t('Unsaved changes')}
      >
        <ModalHeader title={t('Unsaved changes')} />
        <ModalBody>{t('Upon reloading, the modified changes will be lost.')}</ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setShowReloadConfirm(false);
              void performReload();
            }}
            data-test="confirm-discard-reload-button"
          >
            {t('Confirm')}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setShowReloadConfirm(false);
            }}
            data-test="dismiss-discard-reload-button"
          >
            {t('Cancel')}
          </Button>
        </ModalFooter>
      </Modal>

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
