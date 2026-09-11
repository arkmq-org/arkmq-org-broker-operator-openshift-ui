import type { FC, RefObject } from 'react';
import { useState } from 'react';
import type { K8sModel, K8sResourceCommon } from '@openshift-console/dynamic-plugin-sdk';
import {
  getGroupVersionKindForModel,
  useAnnotationsModal,
  useDeleteModal,
  useLabelsModal,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  MenuToggle,
  type MenuToggleElement,
} from '@patternfly/react-core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

export interface ResourceDetailsActionsMenuProps {
  /** CR shown on the details page; drives labels, annotations, edit, and delete actions. */
  resource: K8sResourceCommon;
  /** K8s model used to build the YAML edit path. */
  model: K8sModel;
  /** Label for the edit action. */
  editActionLabel: string;
  /** Label for the delete action. */
  deleteActionLabel: string;
  /** Path to return to after a successful delete. */
  listPath: string;
  /** Overrides the default YAML edit path. */
  editFormPath?: string;
  dataTest?: string;
}

/** Actions dropdown for resource details pages (labels, annotations, edit, delete). */
export const ResourceDetailsActionsMenu: FC<ResourceDetailsActionsMenuProps> = ({
  resource,
  model,
  editActionLabel,
  deleteActionLabel,
  listPath,
  editFormPath,
  dataTest,
}) => {
  const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const launchLabelsModal = useLabelsModal(resource);
  const launchAnnotationsModal = useAnnotationsModal(resource);
  const launchDeleteModal = useDeleteModal(resource, listPath);

  const name = resource.metadata?.name;
  const namespace = resource.metadata?.namespace;

  if (!name || !namespace || resource.metadata?.deletionTimestamp) {
    return null;
  }

  const { group, version, kind } = getGroupVersionKindForModel(model);
  if (!group || !version || !kind) {
    return null;
  }

  const editPath = `/k8s/ns/${namespace}/${group}~${version}~${kind}/${name}/yaml`;
  const menuDataTest = dataTest ?? `resource-details-actions-${namespace}-${name}`;

  return (
    <Dropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      popperProps={{ position: 'right' }}
      toggle={(toggleRef: RefObject<MenuToggleElement>) => (
        <MenuToggle
          ref={toggleRef}
          onClick={() => {
            setIsOpen((open) => !open);
          }}
          isExpanded={isOpen}
          aria-label={t('Actions')}
          data-test={menuDataTest}
        >
          {t('Actions')}
        </MenuToggle>
      )}
    >
      <DropdownList>
        <DropdownItem
          onClick={() => {
            setIsOpen(false);
            launchLabelsModal();
          }}
          data-test={`edit-labels-${namespace}-${name}`}
        >
          {t('Edit labels')}
        </DropdownItem>
        <DropdownItem
          onClick={() => {
            setIsOpen(false);
            launchAnnotationsModal();
          }}
          data-test={`edit-annotations-${namespace}-${name}`}
        >
          {t('Edit annotations')}
        </DropdownItem>
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
