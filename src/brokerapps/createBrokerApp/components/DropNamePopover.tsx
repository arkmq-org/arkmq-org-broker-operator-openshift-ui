import * as React from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionGroup, Button, Form, FormGroup, Popover, TextInput } from '@patternfly/react-core';
import { DATAFLOW_CLASS } from '../../../dataflow/pipelineComponents';

/** How many matching names are offered under the field. */
const SUGGESTION_LIMIT = 6;

export interface DropNamePopoverProps {
  /** What is being named, already translated: "Namespace", "App in acme-ident", "Queue in scorer". */
  title: string;
  placeholder: string;
  /** Names worth offering (namespaces of the cluster, apps of a namespace); filtered as the user types. */
  suggestions: string[];
  /** Where the item was dropped, in pixels inside the positioned canvas wrapper. */
  at: { x: number; y: number };
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

/**
 * The one question a palette drop needs answered, asked right where the item
 * landed: its name. The popover anchors on an unseen marker at the drop point, so
 * the user's eye never leaves the diagram; Enter confirms, Escape or a click
 * elsewhere cancels, and a cancelled drop leaves nothing behind.
 */
export const DropNamePopover: React.FC<DropNamePopoverProps> = ({
  title,
  placeholder,
  suggestions,
  at,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const anchor = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const matches = suggestions
    .filter((s) => s !== trimmed && s.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, SUGGESTION_LIMIT);
  const confirm = () => {
    if (trimmed) onConfirm(trimmed);
  };
  return (
    <>
      <div
        ref={anchor}
        className={`${DATAFLOW_CLASS}-drop-anchor`}
        style={{ left: at.x, top: at.y }}
        data-test="drop-anchor"
      />
      <Popover
        isVisible
        triggerRef={anchor}
        position="right-start"
        hasAutoWidth
        shouldClose={() => {
          onCancel();
        }}
        headerContent={title}
        bodyContent={
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              confirm();
            }}
            data-test="drop-name-form"
          >
            <FormGroup fieldId="drop-name">
              <TextInput
                id="drop-name"
                autoFocus
                value={name}
                placeholder={placeholder}
                onChange={(_event, value) => {
                  setName(value);
                }}
                aria-label={title}
                data-test="drop-name-input"
              />
            </FormGroup>
            {matches.length > 0 && (
              <div className={`${DATAFLOW_CLASS}-drop-suggestions`}>
                {matches.map((match) => (
                  <Button
                    key={match}
                    variant="link"
                    size="sm"
                    isInline
                    onClick={() => {
                      onConfirm(match);
                    }}
                    data-test="drop-name-suggestion"
                  >
                    {match}
                  </Button>
                ))}
              </div>
            )}
            <ActionGroup>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isDisabled={!trimmed}
                data-test="drop-name-confirm"
              >
                {t('Add')}
              </Button>
              <Button variant="link" size="sm" onClick={onCancel} data-test="drop-name-cancel">
                {t('Cancel')}
              </Button>
            </ActionGroup>
          </Form>
        }
      />
    </>
  );
};
