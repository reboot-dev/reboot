#!/bin/bash

set -e # Exit if a command exits with an error.
set -x # Echo executed commands to help debug failures.

# Check that this script has been invoked with the right working directory, by
# checking that the expected subdirectories exist.
ls -l api/ backend/src/ 2> /dev/null > /dev/null || {
  echo "ERROR: this script must be invoked from the root of the 'reboot-hello-nodejs' repository."
  echo "Current working directory is '$(pwd)'."
  exit 1
}

stop_container_and_restore_package_json() {
  if [ -n "$container_id" ]; then
    docker stop "$container_id"
  fi

  # Restore the original package.json file on exit is it was not restored
  # before.
  if [ -f "package.json.bak" ]; then
    mv package.json.bak package.json
  fi
}

perform_curl() {
  local state_id="$1"
  local method="$2"
  local actual_output_file="$3"
  local data="$4"
  local url="localhost:8787/chat_room.v1.ChatRoomMethods/${method}"
  local curl_args=(
    -v -s
    -o "$actual_output_file"
    -w "%{http_code}"
    -XPOST
    -H "x-reboot-state-ref:chat_room.v1.ChatRoom:${state_id}"
  )

  if [ -n "$data" ]; then
    curl_args+=(-H "Content-Type: application/json" -d "$data")
  fi

  # Discard the 'curl' exit code, since we want to
  # continue even if the request fails.
  http_status=$(curl "${curl_args[@]}" $url || true)

  # Print the output of 'curl' to aid in debugging.
  cat "$actual_output_file"

  if [ "$http_status" -ne 200 ]; then
    return 1
  fi
  return 0
}

# Ensure the container is stopped on script exit or Ctrl+C.
trap stop_container_and_restore_package_json EXIT
trap stop_container_and_restore_package_json SIGINT

# Confirm that we can build the Docker image.
#
# We will only do this if this machine has the `docker` command installed.
if command -v docker &> /dev/null; then
  # Since Docker can't follow symlinks to files outside the build context, we
  # can't build the Docker image in a directory where the Dockerfile is a symlink.
  # That situation occurs when e.g. running this test on Bazel. Follow the symlink
  # back to the original directory and build from there.
  pushd $(dirname $(readlink --canonicalize ./Dockerfile))
  # Build the "reboot-dev/reboot-hello-nodejs" image.
  image_name="reboot-dev/reboot-hello-nodejs"

  if [[ -v REBOOT_NPM_PACKAGE ]]; then
    # We want to use the unpublished version of the Reboot library in the Docker
    # image. To do this, we need to modify the package.json file to point to the
    # local tarball file.
    version="$REBOOT_VERSION"
    reboot_package_name="@reboot-dev/reboot"
    reboot_tarball_name=$(basename "$REBOOT_NPM_PACKAGE")
    reboot_tarball_path="/build/.unpublished-reboot-libraries/$reboot_tarball_name"

    # Also add a new dependency to the Reboot API package, because the Reboot
    # package depends on it, and we want its unreleased version also.
    reboot_api_package_name="@reboot-dev/reboot-api"
    reboot_api_tarball_name=$(basename "$REBOOT_API_NPM_PACKAGE")
    reboot_api_tarball_path="/build/.unpublished-reboot-libraries/$reboot_api_tarball_name"

    cp package.json package.json.bak

    jq ".dependencies[\"$reboot_package_name\"] = \"file:$reboot_tarball_path\"" package.json > tmp.json && mv tmp.json package.json
    jq ".dependencies[\"$reboot_api_package_name\"] = \"file:$reboot_api_tarball_path\"" package.json > tmp.json && mv tmp.json package.json
  fi

  docker build -t $image_name .

  mv package.json.bak package.json
  # Pick a port to run the container on. We can't use the default 9991, since in
  # tests on Reboot's GitHub Actions it is already in use by the devcontainer.
  container_id=$( \
    docker run \
      --rm \
      --env=PORT=8787 \
      --env=RBT_STATE_DIRECTORY=/app/state/ \
      --env=RBT_SERVERS=2 \
      -p8787:8787 \
      --detach \
      $image_name \
  )

  actual_output_file=$(mktemp)

  # Try to reach the backend using the known state ID to
  # wait for the server to be ready.
  retries=0
  while ! perform_curl "chat-room-nodejs" "Messages" "$actual_output_file"; do
    if [ "$retries" -ge 30 ]; then
      # This is taking an unusually long time. Print the Docker logs to aid in
      # debugging.
      echo "###### Docker logs ######"
      docker logs $container_id
      echo "###### End Docker logs ######"
      retries=0
    fi
    sleep 1
    retries=$((retries+1))
  done

  # Check the output of the known state ID.
  if ! diff -u "${SANDBOX_ROOT}$EXPECTED_CURL_OUTPUT_FILE" "$actual_output_file"; then
    echo "The actual output does not match the expected output."
    exit 1
  fi

  # At this point we know the server is up and can respond to requests.
  # Now we want to test that all servers in the cluster are reachable,
  # by sending requests to 30 different random state IDs so that
  # the load balancer distributes them across all servers.
  # If all requests succeed, all servers should be reachable.
  for i in $(seq 1 30); do
    state_id=$(cat /proc/sys/kernel/random/uuid)
    # First, send a message to construct the state.
    if ! perform_curl "$state_id" "Send" "$actual_output_file" '{"message":"test"}'; then
      echo "Send request to state ID '$state_id' failed."
      echo "###### Docker logs ######"
      docker logs $container_id
      echo "###### End Docker logs ######"
      exit 1
    fi
    # Then, read the messages back and verify the content.
    if ! perform_curl "$state_id" "Messages" "$actual_output_file"; then
      echo "Messages request to state ID '$state_id' failed."
      echo "###### Docker logs ######"
      docker logs $container_id
      echo "###### End Docker logs ######"
      exit 1
    fi
    # Verify the response contains the message we sent.
    # Collapse whitespace since the JSON response is pretty-printed.
    if ! tr -d ' \n' < "$actual_output_file" | grep -q '"messages":\["test"\]'; then
      echo "Expected '\"messages\":[\"test\"]' in response for state ID '$state_id', got:"
      cat "$actual_output_file"
      exit 1
    fi
  done

  rm "$actual_output_file"
  popd
else
  exit 1
fi
