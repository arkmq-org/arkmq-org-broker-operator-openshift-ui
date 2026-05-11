import * as React from 'react';
import { useState } from 'react';
import { Label, LabelGroup, TextInput } from '@patternfly/react-core';

interface AddressListInputProps {
  addresses: string[];
  onAdd: (address: string) => void;
  onRemove: (address: string) => void;
  placeholder: string;
  inputId: string;
  categoryName: string;
}

export const AddressListInput: React.FC<AddressListInputProps> = ({
  addresses,
  onAdd,
  onRemove,
  placeholder,
  inputId,
  categoryName,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleConfirm = () => {
    const trimmed = inputValue.trim();
    if (trimmed) onAdd(trimmed);
    setInputValue('');
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === 'Escape') {
      setInputValue('');
      setIsAdding(false);
    }
  };

  return (
    <LabelGroup
      categoryName={categoryName}
      isEditable
      addLabelControl={
        isAdding ? (
          <TextInput
            id={inputId}
            value={inputValue}
            onChange={(_e, val) => {
              setInputValue(val);
            }}
            onBlur={handleConfirm}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
          />
        ) : (
          <Label
            variant="add"
            onClick={() => {
              setIsAdding(true);
            }}
          >
            Add address
          </Label>
        )
      }
    >
      {addresses.map((addr) => (
        <Label
          key={addr}
          onClose={() => {
            onRemove(addr);
          }}
          closeBtnAriaLabel={`Remove ${addr}`}
        >
          {addr}
        </Label>
      ))}
    </LabelGroup>
  );
};
