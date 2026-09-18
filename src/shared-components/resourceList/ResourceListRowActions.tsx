import type { FC, RefObject } from 'react';
import { useState } from 'react';
import type { K8sModel, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import { getGroupVersionKindForModel, useDeleteModal } from '@openshift-console/dynamic-plugin-sdk';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { EllipsisVIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

export interface ResourceListRowActionsProps {
  resource: K8sResourceCommon;
  model: K8sModel;
  editActionLabel: string;
  deleteActionLabel: string;
  /** Overrides the default YAML edit path. */
  editFormPath?: string;
  dataTest?: string;
}

export const ResourceListRowActions: FC<ResourceListRowActionsProps> = ({
  resource,
  model,
  editActionLabel,
  deleteActionLabel,
  editFormPath,
  dataTest,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const launchDeleteModal = useDeleteModal(resource);

  const name = resource.metadata?.name;
  const namespace = resource.metadata?.namespace;

  if (!name || !namespace) {
    return null;
  }

  const { group, version, kind } = getGroupVersionKindForModel(model);
  if (!group || !version || !kind) {
    return null;
  }

  const editPath = `/k8s/ns/${namespace}/${group}~${version}~${kind}/${name}/yaml`;

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      popperProps={{ position: 'right' }}
      toggle={(toggleRef: RefObject<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          variant="plain"
          onClick={() => {
            setIsOpen((open) => !open);
          }}
          isExpanded={isOpen}
          aria-label={t('Actions')}
          data-test={dataTest ?? `resource-actions-${namespace}-${name}`}
        >
          <EllipsisVIcon />
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem
          onClick={() => {
            setIsOpen(false);
            void navigate(editFormPath ?? editPath);
          }}
          data-test={`edit-${namespace}-${name}`}
        >
          {editActionLabel}
        </DropdownItem>
        <DropdownItem
          onClick={() => {
            setIsOpen(false);
            launchDeleteModal();
          }}
          data-test={`delete-${namespace}-${name}`}
        >
          {deleteActionLabel}
        </DropdownItem>
      </DropdownList>
    </Dropdown>
  );
};
