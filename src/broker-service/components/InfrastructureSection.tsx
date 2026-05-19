import { FC } from 'react';
import { FormGroup, FormSection } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import {
  useBrokerServiceFormState,
  useBrokerServiceFormDispatch,
} from '../../reducers/broker-service/reducer';
import { MemoryInput } from './MemoryInput';

type InfrastructureSectionProps = {
  memoryError?: string;
};

export const InfrastructureSection: FC<InfrastructureSectionProps> = ({ memoryError }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const { memoryValue, memoryUnit } = useBrokerServiceFormState();
  const dispatch = useBrokerServiceFormDispatch();

  return (
    <FormSection title={t('Infrastructure & Capacity')} style={{ marginTop: 0 }}>
      <FormGroup label={t('Memory (RAM)')} isRequired fieldId="broker-service-memory">
        <MemoryInput
          value={memoryValue}
          unit={memoryUnit}
          onValueChange={(val) => dispatch({ type: 'SET_MEMORY_VALUE', payload: val })}
          onUnitChange={(unit) => dispatch({ type: 'SET_MEMORY_UNIT', payload: unit })}
          error={memoryError}
        />
      </FormGroup>
    </FormSection>
  );
};
