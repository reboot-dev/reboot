#!/bin/bash

# We need this export to enable color output to the terminal using GitHub
# Actions. If no, we will get the error while using commands in bash such as
# `tput`.
export TERM=xterm-color

# Helper that returns 0 if the version in the first argument is greater than or
# equal to the version in the second argument, otherwise returns 1.
check_version() {
  local found="${1}"
  local required="${2}"

  # Use 'sort -V' in order to sort the versions and select the "oldest".
  local oldest="$(printf '%s\n' "${found}" "${required}" | sort -V | head -n1)"

  # Ensure the "oldest" of the two versions is what's required.
  [[ "${oldest}" == "${required}" ]]
}

# Helper that takes a file and ensures it doesn't have lines exceeding 80
# characters. Note that we do this check here versus using clang-format because
# we clang-format to respect programmer added newlines in places where it makes
# the code easier to read than what clang-format might have done itself.
# To skip the length check for a line (e.g. for a long URL), put
# "check_line_length skip" in a comment on the previous line or at the very end
# of an already long line.
check_line_length() {
  local file="${1}"
  local -i status=0
  local -i number=1
  local skip_next_line=false
  while IFS= read -r line; do
    if [[ $skip_next_line == true ]]; then
      skip_next_line=false
      (( number++ )) && continue
    fi
    # If a single line says "ignore", then ignore all subsequent lines. This is
    # useful for files imported from other sources that can't be formatted.
    if [[ $line == *"check_line_length ignore"* ]]; then
      return ${status}
    fi
    # If a line says "skip", then skip the next line. This is useful for single
    # lines that are too long, but that can't be broken up.
    if [[ $line == *"check_line_length skip"* ]]; then
      skip_next_line=true
    fi

    # Skip line if a line contains the magic "check_line_length skip" string at
    # the very end.
    (echo $line | grep -Eq '^.*check_line_length skip$') &&
      (( number++ )) && continue

    local -i length=${#line}
    if (( length > 80 )); then
      status=1
      tput bold
      printf "%s:%i:%i: " "$1" "${number}" "${length}"
      tput setaf 1 # Red.
      printf "error: "
      tput sgr0 # Reset terminal.
      tput bold
      printf "line exceeds 80 characters\n"
      tput sgr0 # Reset terminal.
      printf "%s\n" "${line}"
    fi
    (( number++ ))
  done < "${file}"
  return ${status}
}

# Check if the specific file has correct code format.
#
# If the file is well formatted the command below will return 0.
# We use this fact to print a more helpful message.
check_clang_format() {
  local file="${1}"

  # Check for existence of git.
  which git >/dev/null
  if [[ $? != 0 ]]; then
    printf "Failed to find 'git' (please install or update your path)\n"
    return 1
  fi

  # Check for existence of clang-format.
  which clang-format >/dev/null
  if [[ ${?} != 0 ]]; then
    printf "Failed to find 'clang-format'\n"
    return 1
  fi

  # IMPORTANT NOTE.
  # The command `clang-format --version` behaves differently on different OS.
  # For example, on Ubuntu this command will message us out with the following
  # content:
  #   Ubuntu clang-format version 19.1.7 (++20250114103238+cd708029e0b2-1~exp1~20250114103342.77)
  # That's why commands like `cut`, `head`, `tr` are not the way we wanna grab
  # the version's numbers.

  # Store in `clang_format_version_output` clang-format --version output.
  clang_format_version_output="$(clang-format --version)"

  # Retain the part after the `version ` (including space too).
  clang_format_version_found=${clang_format_version_output##*version }

  # Retain the part before ` `.
  clang_format_version_found=${clang_format_version_found% *}

  clang_format_version_required="19.1.7"

  check_version ${clang_format_version_found} ${clang_format_version_required}

  if [[ ${?} != 0 ]]; then
    printf "clang-format version '%s' is required but found '%s'\n" \
      "${clang_format_version_required}" \
      "${clang_format_version_found}"
    return 1
  fi

  # Get top-level directory so we can look for .clang-format file.
  directory=$(git rev-parse --show-toplevel)

  # Check for .clang-format file.
  if [[ ! -f "${directory}/.clang-format" ]]; then
    printf "Failed to find '.clang-format' file at '%s'\n" "${directory}"
    return 1
  fi

  clang-format --dry-run -Werror --ferror-limit=0  "${file}"
}

check_style() {
  local file="${1}"
  check_clang_format "${file}" && check_line_length "${file}"
}

# Check files that are part of the current commit.
check_style_of_files_in_commit() {
  local -i status=0

  # Check for existence of git.
  which git >/dev/null
  if [[ $? != 0 ]]; then
    printf "Failed to find 'git' (please install or update your path)\n"
    return 1
  fi

  # NOTE: Make sure that the file extensions matches the file extensions in `check_style_of_all_files.sh`.
  files=$(git diff --cached --name-only --diff-filter=ACM HEAD | grep -iE '\.(cc|cpp|h|hpp|proto)$')
  for file in ${files}; do
    check_style "${file}"

    if [[ ${?} != 0 ]]; then
      status=1
    fi
  done

  return ${status}
}
