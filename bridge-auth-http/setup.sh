#!/bin/bash
set -euo pipefail

oc process -f console-oauth-client.yaml | oc apply -f -
oc get oauthclient console-oauth-client-http -o jsonpath='{.secret}' > console-client-secret
oc apply -f sa-secrets.yaml

# Wait for the token controller to populate the secret with ca.crt
echo "Waiting for service account token secret to be populated..."
for i in {1..30}; do
    if oc get secret default-token -n default -o jsonpath='{.data.ca\.crt}' 2>/dev/null | grep -q '^[A-Za-z0-9+/=]\+$'; then
        echo "Secret populated after ${i} seconds"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "ERROR: Secret not populated after 30 seconds"
        exit 1
    fi
    sleep 1
done

oc get secrets -n default --field-selector type=kubernetes.io/service-account-token -o json | \
    jq '.items[0].data."ca.crt"' -r | python -m base64 -d > ca.crt
oc extract cm/kube-apiserver-server-ca -n openshift-kube-apiserver --confirm
chmod o+r ca-bundle.crt
chmod g+r ca-bundle.crt

