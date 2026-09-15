FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build-image

### BEGIN REMOTE SOURCE
# Use the COPY instruction only inside the REMOTE SOURCE block
# Use the COPY instruction only to copy files to the container path $REMOTE_SOURCES_DIR/arkmq-org-broker-operator-openshift-ui/app
ARG REMOTE_SOURCES_DIR=/tmp/remote_source
RUN mkdir -p $REMOTE_SOURCES_DIR/arkmq-org-broker-operator-openshift-ui/app
WORKDIR $REMOTE_SOURCES_DIR/arkmq-org-broker-operator-openshift-ui/app
ADD . $REMOTE_SOURCES_DIR/arkmq-org-broker-operator-openshift-ui/app
RUN command -v yarn || npm i -g yarn
### END REMOTE SOURCE

USER root

## Set directory
RUN mkdir -p /usr/src/
RUN cp -r $REMOTE_SOURCES_DIR/arkmq-org-broker-operator-openshift-ui/app /usr/src/
WORKDIR /usr/src/app

## Install dependencies
RUN yarn install --network-timeout 1000000

## Build application
RUN yarn build

FROM registry.access.redhat.com/ubi9/nginx-122:latest

USER root

## Upgrade packages
RUN dnf update -y --setopt=install_weak_deps=0 && rm -rf /var/cache/yum

COPY --from=build-image /usr/src/app/dist /usr/share/nginx/html

USER 1001

ENTRYPOINT ["nginx", "-g", "daemon off;"]

## Labels
LABEL name="arkmq-org/arkmq-org-broker-operator-openshift-ui"
LABEL description="OpenShift Console plugin UI for ArkMQ Broker Operator"
LABEL maintainer="ArkMQ <info@arkmq.org>"
LABEL version="0.0.1"
