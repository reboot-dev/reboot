#!/bin/bash
set -e
set -u

ENVOY_CONFIG_FILENAME=/reboot/envoy.generated.yaml

# All input arguments to this program are forwarded to `curl`.
CURL_ARGS=""
for CURL_ARG in "$@"; do
  CURL_ARGS="$CURL_ARGS '$CURL_ARG'"
done

# Validate Envoy configs.
/usr/local/bin/envoy \
  -c $ENVOY_CONFIG_FILENAME \
  -l debug \
  --mode validate \
  >/tmp/envoy.log \
  2>/tmp/envoy.err \
  || cat /tmp/envoy.log /tmp/envoy.err

# If we got here, Envoy can successfully start. Start it in the background.
/usr/local/bin/envoy \
  -c $ENVOY_CONFIG_FILENAME \
  -l debug \
  >/tmp/envoy.log \
  2>/tmp/envoy.err &

# Wait until Envoy has started.
while ! nc -z localhost 8080; do
  sleep .1
done

# Now we can reach reach Envoy.
# Run curl with `-v` so it prints out the response headers.
eval "curl -v $CURL_ARGS localhost:8080 2> /tmp/curl.err"
# The interesting output of this curl (the response headers) was sent to
# stderr, so print curl's stderr.
cat /tmp/curl.err

## The following can be uncommented for debugging, if desired.
## Print the Envoy logs to make them visible.
# echo "##### Envoy STDOUT #####"
# cat /tmp/envoy.log
# echo "##### Envoy STDERR #####"
# cat /tmp/envoy.err
