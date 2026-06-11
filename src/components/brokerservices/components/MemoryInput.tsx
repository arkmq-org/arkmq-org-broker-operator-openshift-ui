import { type FC, useState } from 'react';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  FormHelperText,
  HelperText,
  HelperTextItem,
  InputGroup,
  InputGroupItem,
  MenuToggle,
  type MenuToggleElement,
  TextInput,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';

export interface MemoryInputProps {
  value: string;
  unit: 'Mi' | 'Gi';
  onValueChange: (value: string) => void;
  onUnitChange: (unit: 'Mi' | 'Gi') => void;
  error?: string;
}

export const MemoryInput: FC<MemoryInputProps> = ({
  value,
  unit,
  onValueChange,
  onUnitChange,
  error,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const [isOpen, setIsOpen] = useState(false);

  const onToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const onSelect = (selectedUnit: 'Mi' | 'Gi') => {
    onUnitChange(selectedUnit);
    setIsOpen(false);
  };

  return (
    <>
      <InputGroup>
        <InputGroupItem isFill>
          <TextInput
            id="broker-service-memory"
            name="broker-service-memory"
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(_event, val) => {
              onValueChange(val);
            }}
            validated={error ? 'error' : 'default'}
            aria-label={t('Memory value')}
            data-test="memory-value-input"
          />
        </InputGroupItem>
        <InputGroupItem>
          <Dropdown
            isOpen={isOpen}
            onOpenChange={setIsOpen}
            onSelect={() => {
              setIsOpen(false);
            }}
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle ref={toggleRef} onClick={onToggle} isExpanded={isOpen}>
                {unit}
              </MenuToggle>
            )}
          >
            <DropdownList>
              <DropdownItem
                key="Mi"
                onClick={() => {
                  onSelect('Mi');
                }}
              >
                Mi
              </DropdownItem>
              <DropdownItem
                key="Gi"
                onClick={() => {
                  onSelect('Gi');
                }}
              >
                Gi
              </DropdownItem>
            </DropdownList>
          </Dropdown>
        </InputGroupItem>
      </InputGroup>
      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={error ? 'error' : 'default'}>
            {error ?? t('Memory allocation per broker pod.')}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </>
  );
};
