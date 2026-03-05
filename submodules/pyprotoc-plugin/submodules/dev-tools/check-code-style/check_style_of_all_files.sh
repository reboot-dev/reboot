#!/bin/bash

source $(dirname "$0")/check_style.sh

# Check every file for correct code style.
check_style_of_all_files() {
  # Find all files we want to check excluding directories with 'submodules' name.
  #
  # TODO(Artur): take a list of directories to exclude as part of the action so that
  # anyone using this can exclude what ever directory they want rather than assume
  # that everyone using this will want to exclude the 'submodules' directory.
  # NOTE: do not forget to do the same in the 'check_style_bzl.sh'!!!
  # https://github.com/3rdparty/dev-tools/blob/main/check-code-style/check_style_bzl.sh
  IFS=:
  # NOTE: Make sure that the file extensions matches the file extensions in `check_style.sh`.
  file_paths=$(find . -type f \( -name '*.cc' -o -name '*.cpp' -o -name '*.h' -o -name '*.hpp' -o -name '*.proto' \) -not -path "*/submodules/*")
  unset IFS

  if [[ ${#file_paths} == 0 ]]; then
    printf "There are no files to check!\n"
    return 0
  fi

  local -i status=0

  for file in ${file_paths}; do
    check_style "${file}"

    if [[ $? != 0 ]]; then
      status=1
    fi
  done

  return ${status}
}

check_style_of_all_files
