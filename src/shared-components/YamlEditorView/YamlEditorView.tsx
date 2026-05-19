import { FC, Suspense } from 'react';
import { Spinner } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import './YamlEditorView.css';

type YamlEditorViewProps = {
  initialResource: object;
  onChange?: (content: string) => void;
};

export const YamlEditorView: FC<YamlEditorViewProps> = ({ initialResource, onChange }) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <div className="plugin__arkmq-org-broker-operator-openshift-ui-yaml-editor">
      <Suspense fallback={<Spinner aria-label={t('Loading editor')} />}>
        <ResourceYAMLEditor
          initialResource={initialResource}
          create
          hideHeader
          onChange={onChange}
        />
      </Suspense>
    </div>
  );
};
