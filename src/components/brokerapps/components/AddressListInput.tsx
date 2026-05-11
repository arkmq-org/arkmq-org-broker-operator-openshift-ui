import * as React from 'react';
import { useState } from 'react';
import {
  InputGroup,
  InputGroupItem,
  Label,
  LabelGroup,
  Button,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core';

type AddressListInputProps = {
  addresses: string[];
  onAdd: (address: string) => void;
  onRemove: (address: string) => void;
  placeholder: string;
  addLabel: string;
  inputId: string;
};

export const AddressListInput: React.FC<AddressListInputProps> = ({
  addresses,
  onAdd,
  onRemove,
  placeholder,
  addLabel,
  inputId,
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onAdd(trimmed);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Stack hasGutter>
      <StackItem>
        <InputGroup className="plugin__arkmq-org-broker-operator-openshift-ui__address-input-row">
          <InputGroupItem isFill>
            <TextInput
              id={inputId}
              value={inputValue}
              onChange={(_e, val) => setInputValue(val)}
              onKeyDown={handleKeyDown}
              onBlur={handleAdd}
              placeholder={placeholder}
              aria-label={placeholder}
            />
          </InputGroupItem>
          <InputGroupItem>
            <Button variant="secondary" onClick={handleAdd}>
              {addLabel}
            </Button>
          </InputGroupItem>
        </InputGroup>
      </StackItem>
      {addresses.length > 0 && (
        <StackItem>
          <LabelGroup>
            {addresses.map((addr) => (
              <Label key={addr} onClose={() => onRemove(addr)} closeBtnAriaLabel={`Remove ${addr}`}>
                {addr}
              </Label>
            ))}
          </LabelGroup>
        </StackItem>
      )}
    </Stack>
  );
};
