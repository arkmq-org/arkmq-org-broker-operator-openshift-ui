import type { FC } from 'react';
import { FormGroup, FormSection } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../../../reducers/brokerservice/reducer';
import { validateMemoryValue } from '../../../validation/k8s';
import { MemoryInput } from './MemoryInput';

export const InfrastructureSection: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { memoryValue, memoryUnit } = useBrokerServiceFormState();
  const dispatch = useBrokerServiceFormDispatch();

  const memoryError = validateMemoryValue(memoryValue) ?? undefined;

  return (
    <FormSection title={t('Infrastructure & Capacity')}>
      <FormGroup label={t('Memory (RAM)')} isRequired fieldId="broker-service-memory">
        <MemoryInput
          value={memoryValue}
          unit={memoryUnit}
          onValueChange={(val) => {
            dispatch({ type: 'SET_MEMORY_VALUE', payload: val });
          }}
          onUnitChange={(unit) => {
            dispatch({ type: 'SET_MEMORY_UNIT', payload: unit });
          }}
          error={memoryError}
        />
      </FormGroup>
    </FormSection>
  );
};
