import * as React from 'react';
import { Flex, Radio } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { EditorType } from '../k8s/types';

type EditorToggleProps = {
  value: EditorType;
  onChange: (value: EditorType) => void;
  isDisabled?: boolean;
};

export const EditorToggle: React.FC<EditorToggleProps> = ({ value, onChange, isDisabled }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <Flex
      spaceItems={{ default: 'spaceItemsMd' }}
      alignItems={{ default: 'alignItemsCenter' }}
      role="radiogroup"
      aria-labelledby="radio-group-title-editor-toggle"
    >
      <label id="radio-group-title-editor-toggle">{t('Configure Via')}</label>
      <Radio
        id={EditorType.FORM}
        name="editor-type"
        label={t('Form View')}
        isChecked={value === EditorType.FORM}
        onChange={(event) => onChange(event.currentTarget.value as EditorType)}
        value={EditorType.FORM}
        isDisabled={isDisabled}
        data-test="form-view-input"
      />
      <Radio
        id={EditorType.YAML}
        name="editor-type"
        label={t('YAML View')}
        isChecked={value === EditorType.YAML}
        onChange={(event) => onChange(event.currentTarget.value as EditorType)}
        value={EditorType.YAML}
        isDisabled={isDisabled}
        data-test="yaml-view-input"
      />
    </Flex>
  );
};
