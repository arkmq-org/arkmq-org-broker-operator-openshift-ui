import * as React from 'react';
import { Suspense } from 'react';
import { Spinner } from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { ResourceYAMLEditor } from '@openshift-console/dynamic-plugin-sdk';
import './yaml-editor-wrapper.css';

type YamlEditorWrapperProps = {
  initialResource: object;
  onChange: (yaml: string) => void;
  onSave?: (content: string) => void;
};

export const YamlEditorWrapper: React.FC<YamlEditorWrapperProps> = ({
  initialResource,
  onChange,
  onSave,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <div className="plugin__arkmq-org-broker-operator-openshift-ui__yaml-editor-wrapper">
      <Suspense fallback={<Spinner aria-label={t('Loading editor')} />}>
        <ResourceYAMLEditor
          initialResource={initialResource}
          create
          hideHeader
          onChange={onChange}
          onSave={onSave}
        />
      </Suspense>
    </div>
  );
};
