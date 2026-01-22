#!/bin/bash
curl \
    --retry 300\
    --retry-connrefused\
    --retry-delay 5\
    --retry-max-time 600\
    --head\
    http://localhost:9000 > /dev/null \
    && echo "Console is up and running." \
    || (echo "::error::Timed out waiting for console to start." && exit 1)


