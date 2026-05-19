import { FC, FormEvent } from 'react';
import { Flex, Radio } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { EditorType } from '../k8s/types';

type EditorToggleProps = {
  value: EditorType;
  onChange: (editorType: EditorType) => void;
  isDisabled?: boolean;
};

export const EditorToggle: FC<EditorToggleProps> = ({ value, onChange, isDisabled }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  const handleChange = (_checked: boolean, event: FormEvent<HTMLInputElement>) => {
    onChange(event.currentTarget.value as EditorType);
  };

  return (
    <Flex
      spaceItems={{ default: 'spaceItemsMd' }}
      alignItems={{ default: 'alignItemsCenter' }}
      role="radiogroup"
      aria-labelledby="radio-group-title-editor-toggle"
    >
      <label id="radio-group-title-editor-toggle">{t('Configure Via')}</label>
      <Radio
        isChecked={value === EditorType.FORM}
        name={EditorType.FORM}
        onChange={(event, _checked: boolean) => handleChange(_checked, event)}
        label={t('Form View')}
        id={EditorType.FORM}
        value={EditorType.FORM}
        isDisabled={isDisabled}
        data-test="form-view-input"
      />
      <Radio
        isChecked={value === EditorType.YAML}
        name={EditorType.YAML}
        onChange={(event, _checked: boolean) => handleChange(_checked, event)}
        label={t('YAML View')}
        id={EditorType.YAML}
        value={EditorType.YAML}
        data-test="yaml-view-input"
        isDisabled={isDisabled}
      />
    </Flex>
  );
};
