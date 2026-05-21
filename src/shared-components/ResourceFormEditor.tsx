import * as React from 'react';
import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, EmptyStateBody, Form, Stack, StackItem } from '@patternfly/react-core';
import { EditorType } from '../k8s/types';
import { EditorToggle } from './EditorToggle';
import { YamlEditorWrapper } from './YamlEditorWrapper';
import { FormActionGroup } from './FormActionGroup';

/**
 * Result of an onSwitchToForm call.
 * On failure the caller provides the message to display to the user.
 */
export type SwitchResult = { ok: true } | { ok: false; error: string };

type ResourceFormEditorProps = {
  initialResource: object;
  isFormValid?: boolean;
  onFormSubmit: () => Promise<void>;
  onYamlSave: (yaml: string) => Promise<void>;
  onSwitchToForm: (yaml: string) => SwitchResult;
  onCancel: () => void;
  createButtonTestId?: string;
  cancelButtonTestId?: string;
  children: React.ReactNode;
};

/**
 * Orchestrates editing a k8s resource in either Form or YAML mode.
 *
 * Owns all transient UI state (editor mode, submit loading, error message) so
 * that page components only manage domain state (the resource CR). A single
 * error Alert is rendered between the toggle and the editor content, ensuring
 * it is always visible regardless of which mode is active. The error is always
 * cleared when the user switches modes to prevent stale messages appearing in
 * the wrong context.
 *
 * Callers provide async callbacks that throw on failure. ResourceFormEditor
 * catches those throws and extracts the message safely via instanceof guard,
 * matching the pattern used in certManagerUtils.ts (SPP).
 *
 * @param initialResource - Resource object used to seed the YAML editor on each YAML→FORM→YAML cycle
 * @param isFormValid - Whether the form passes validation; disables Create when false
 * @param onFormSubmit - Async callback for form-mode submit; must throw on k8s error so the catch block can display it
 * @param onYamlSave - Async callback for YAML-mode save; receives raw YAML string; must throw on error
 * @param onSwitchToForm - Called when switching YAML→Form; parses YAML and updates domain state; returns SwitchResult
 * @param onCancel - Called when the Cancel button is clicked
 * @param createButtonTestId - Optional data-test attribute for the Create button
 * @param cancelButtonTestId - Optional data-test attribute for the Cancel button
 * @param children - Form field sections rendered inside a Form in FORM mode; must not include action buttons
 */
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
  const yamlContentRef = useRef('');
  const yamlKeyRef = useRef(0);

  const handleYamlChange = useCallback((content: string) => {
    yamlContentRef.current = content;
  }, []);

  const handleModeSwitch = (newType: EditorType) => {
    setSubmitError(undefined);
    if (newType === EditorType.FORM && yamlContentRef.current) {
      const result = onSwitchToForm(yamlContentRef.current);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
    }
    if (newType === EditorType.YAML) {
      yamlKeyRef.current += 1;
    }
    setEditorType(newType);
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
          <EmptyState headingLevel="h4" titleText={t('An error occurred')} status="danger">
            <EmptyStateBody>{submitError}</EmptyStateBody>
          </EmptyState>
        </StackItem>
      )}

      {editorType === EditorType.FORM ? (
        <StackItem>
          <Form>
            {children}
            <FormActionGroup
              isSubmitting={isSubmitting}
              isFormValid={isFormValid}
              onSubmit={handleFormSubmit}
              onCancel={onCancel}
              createButtonTestId={createButtonTestId}
              cancelButtonTestId={cancelButtonTestId}
            />
          </Form>
        </StackItem>
      ) : (
        <StackItem>
          <YamlEditorWrapper
            key={yamlKeyRef.current}
            initialResource={initialResource}
            onChange={handleYamlChange}
            onSave={handleYamlSave}
          />
        </StackItem>
      )}
    </Stack>
  );
};
