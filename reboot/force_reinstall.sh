#!/bin/bash -eu

wheel_path="$(pwd)/$1"
cd $BUILD_WORKING_DIRECTORY

if [[ ! -f "pyproject.toml" ]]; then
  echo "Please run this command in a project directory with pyproject.toml." >&2
  exit 1
fi

# Detect package manager: uv (has uv.lock) or rye (has requirements.lock).
if [[ -f "uv.lock" ]]; then
  # uv-managed project: add local wheel via [tool.uv.sources].
  echo "Detected uv-managed project"

  mutated_files="uv.lock pyproject.toml"
  if ! git diff --quiet -- $mutated_files 2>/dev/null; then
    echo "This command will overwrite [$mutated_files], but they are currently dirty." >&2
    exit 1
  fi

  # Add/update [tool.uv.sources] section with local wheel path.
  # This tells uv to use the local wheel instead of PyPI.
  if grep -q '^\[tool\.uv\.sources\]' pyproject.toml; then
    # Section exists - update or add reboot entry.
    if grep -q '^reboot = ' pyproject.toml; then
      # Update existing entry.
      sed -i "s|^reboot = .*|reboot = { path = \"$wheel_path\" }|" pyproject.toml
    else
      # Add entry after [tool.uv.sources] line.
      sed -i "/^\[tool\.uv\.sources\]/a reboot = { path = \"$wheel_path\" }" pyproject.toml
    fi
  else
    # Add new section at end of file.
    echo "" >> pyproject.toml
    echo "[tool.uv.sources]" >> pyproject.toml
    echo "reboot = { path = \"$wheel_path\" }" >> pyproject.toml
  fi

  # Sync to install the local wheel.
  uv sync

  git checkout -- $mutated_files
else
  # rye-managed project (legacy).
  echo "Detected rye-managed project"

  mutated_files="requirements.lock requirements-dev.lock pyproject.toml"
  if ! git diff --quiet -- $mutated_files; then
    echo "This command will overwrite [$mutated_files], but they are currently dirty." >&2
    exit 1
  fi

  rye remove --no-sync reboot || true
  rye remove --no-sync --dev reboot || true
  rye add --dev reboot --absolute --path="$wheel_path"

  git checkout -- $mutated_files
fi
