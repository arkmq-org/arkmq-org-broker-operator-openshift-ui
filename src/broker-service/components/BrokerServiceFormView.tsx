import { FC, useState } from 'react';
import { useNavigate } from 'react-router-dom-v5-compat';
import { Form, Divider } from '@patternfly/react-core';
import { k8sCreate } from '@openshift-console/dynamic-plugin-sdk';
import { BrokerServiceModel } from '../../k8s/models';
import { validateDNS1123, validateMemoryValue } from '../../validation/k8s';
import { useBrokerServiceFormState } from '../../reducers/broker-service/reducer';
import { FormActionGroup } from '../../shared-components/FormActionGroup';
import { GeneralDetailsSection } from './GeneralDetailsSection';
import { InfrastructureSection } from './InfrastructureSection';

type BrokerServiceFormViewProps = {
  namespace: string;
};

export const BrokerServiceFormView: FC<BrokerServiceFormViewProps> = ({ namespace }) => {
  const navigate = useNavigate();
  const formState = useBrokerServiceFormState();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [memoryError, setMemoryError] = useState<string | undefined>();

  const { cr, memoryValue } = formState;
  const name = cr.metadata?.name || '';

  const isFormValid = !validateDNS1123(name) && !validateMemoryValue(memoryValue);

  const validateForm = (): boolean => {
    const nameErr = validateDNS1123(name) ?? undefined;
    const memErr = validateMemoryValue(memoryValue) ?? undefined;
    setNameError(nameErr);
    setMemoryError(memErr);
    return !nameErr && !memErr;
  };

  const handleSubmit = () => {
    setSubmitError(undefined);

    if (!validateForm()) return;

    setIsSubmitting(true);
    k8sCreate({ model: BrokerServiceModel, data: cr })
      .then(() => navigate(-1))
      .catch((error: Error) => setSubmitError(error.message))
      .finally(() => setIsSubmitting(false));
  };

  return (
    <Form isWidthLimited>
      <Divider />

      <GeneralDetailsSection namespace={namespace} nameError={nameError} />

      <Divider />

      <InfrastructureSection memoryError={memoryError} />

      <Divider />

      <FormActionGroup
        isSubmitting={isSubmitting}
        isFormValid={isFormValid}
        submitError={submitError}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
        createButtonTestId="create-broker-service-button"
        cancelButtonTestId="cancel-broker-service-button"
      />
    </Form>
  );
};
