# !/bin/bash

# We need this export to enable color output to the terminal using GitHub
# Actions. If no, we will get the error while using commands in bash such
# as `tput`.
export TERM=xterm-color

# Check for existence of buildifier.
which buildifier >/dev/null
if [[ $? != 0 ]]; then
  printf "Failed to find 'buildifier'\n"
  exit 1
fi

# Find all files we want to check excluding directories with 'submodules' name.
#
# TODO(Artur): take a list of directories to exclude as part of the action so that
# anyone using this can exclude what ever directory they want rather than assume
# that everyone using this will want to exclude the 'submodules' directory.
# NOTE: do not forget to do the same in the 'check_style_of_all_files.sh'!!!
# https://github.com/3rdparty/dev-tools/blob/main/check-code-style/check_style_of_all_files.sh 
IFS=:
bzl_files_paths=$(find . -type f \( -name '*.bzl' -o -name '*.bazel' -o -name 'BUILD' -o -name 'WORKSPACE' \) -not -path "*/submodules/*")

unset IFS

if [[ ${#bzl_files_paths} == 0 ]]; then
    printf "There are no bazel files to check!\n"
    exit 0
fi

status_exit=0

for file in ${bzl_files_paths}
do
    # Check if the specific file has correct code format.
    buildifier --lint=warn --warnings=all --mode=check ${file}
    format_status=$(echo $?)

    if [[ ${format_status} != 0 ]]; then
        tput bold # Bold text in terminal.
        tput setaf 1 # Red font in terminal.
        printf "${file} file has incorrect code format!\n"
        tput sgr0
        tput bold # Bold text in terminal.
        printf "Command to format ${file}: "
        tput setaf 2 # Green font in terminal.
        printf "buildifier --lint=fix --warnings=all "${file}"\n"
        tput sgr0 # Reset terminal.
        tput bold
        printf "If you have no buildifier install it with the command: \n"
        tput setaf 2 # Green font in terminal.
        printf "brew install buildifier\n"
        tput sgr0 # Reset terminal.
        status_exit=1
    fi
done

exit ${status_exit}
