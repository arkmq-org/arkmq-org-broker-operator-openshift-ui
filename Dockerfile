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

## Install dependencies
RUN yarn install --network-timeout 1000000

## Build application
RUN yarn build

FROM registry.access.redhat.com/ubi9-minimal:9.8-1789546276

USER root

## Install nginx (pinned version, matching operator base image approach)
RUN microdnf -y module enable nginx:1.22 && \
    microdnf -y install --setopt=install_weak_deps=0 nginx-1:1.22.1 && \
    microdnf clean all

## Create writable directories for non-root / OpenShift arbitrary UID operation
RUN mkdir -p /var/run/nginx /var/cache/nginx/client_temp /var/cache/nginx/proxy_temp \
             /var/cache/nginx/fastcgi_temp /var/cache/nginx/uwsgi_temp /var/cache/nginx/scgi_temp && \
    chown -R 1001:0 /var/run/nginx /var/cache/nginx /var/log/nginx && \
    chmod -R g=u /var/run/nginx /var/cache/nginx /var/log/nginx

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build-image /tmp/remote_source/arkmq-org-broker-operator-openshift-ui/app/dist /usr/share/nginx/html

USER 1001

ENTRYPOINT ["nginx", "-g", "daemon off;"]

## Labels
LABEL name="arkmq-org/arkmq-org-broker-operator-openshift-ui"
LABEL description="OpenShift Console plugin UI for ArkMQ Broker Operator"
LABEL maintainer="ArkMQ <info@arkmq.org>"
LABEL version="0.0.1"
