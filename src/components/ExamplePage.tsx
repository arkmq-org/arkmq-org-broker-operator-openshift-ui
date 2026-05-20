import type { FC } from 'react';
import { DocumentTitle } from '@openshift-console/dynamic-plugin-sdk';
import { Trans, useTranslation } from 'react-i18next';
import { Content, PageSection, Title } from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import './example.css';

const ExamplePage: FC = () => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');

  return (
    <>
      <DocumentTitle>{t('Hello, Plugin!')}</DocumentTitle>
      <PageSection>
        <Title headingLevel="h1">{t('Hello, Plugin!')}</Title>
      </PageSection>
      <PageSection>
        <Content component="p">
          <span className="plugin__arkmq-org-broker-operator-openshift-ui">
            <CheckCircleIcon /> {t('Success!')}
          </span>{' '}
          {t('Your plugin is working.')}
        </Content>
        <Content component="p">
          <Trans t={t}>
            This is a custom page contributed by the console plugin template. The extension that
            adds the page is declared in console-extensions.json in the project root along with the
            corresponding nav item. Update console-extensions.json to change or add extensions. Code
            references in console-extensions.json must have a corresponding property{' '}
            <code>exposedModules</code> in package.json mapping the reference to the module.
          </Trans>
        </Content>
        <Content component="p">
          <Trans t={t}>
            After cloning this project, replace references to <code>console-template-plugin</code>{' '}
            and other plugin metadata in package.json with values for your plugin.
          </Trans>
        </Content>
      </PageSection>
    </>
  );
};

export default ExamplePage;
