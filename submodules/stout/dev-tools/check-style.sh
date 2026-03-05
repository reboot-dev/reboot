#!/bin/bash
# This scripts runs our various code checks. Specifically it runs:
# * check_style_of_all_files.sh - clang-format and extra line length checking;
# * buildifier;
# * yapf;
# * isort;
# * prettier;
# * markdown-autodocs.
#
# The script has two modes in which it can operate:
# * pre-commit - checks only the file in the current commit.
# * full - checks all the files under version control.
# To save time, we only run over the files in the current commit in the
# precommit hook. We then run the more extensive full check as part of our
# branch protection rules. For a fuller discussion, please see
# https://github.com/reboot-dev/respect/issues/1374.
#
print_help() {
    echo "Use as $0 [--full|--pre-commit]"
    echo ""
    echo " --full to check all files under version control."
    echo " --pre-commit to check the files in the current commit."
    echo ""
}
case $1 in
    "--full" )
        mode="full" # Used later to decide how to invoke clang format.
        # Get all files under version control. These are the superset of files
        # we will want to check.
        affected_files=$(git ls-tree --full-tree --name-only -r HEAD)
        ;;
    "--pre-commit" )
        mode="pre-commit" # Used later to decide how to invoke clang format.
        # Get all files in current commit. We will restrict the checking to
        # these.
        affected_files=$(git diff --cached --name-only --diff-filter=ACM HEAD)
        ;;
    * )
        echo "Unknown argument: $1"
        print_help
        exit 2
esac


# Unset variable would be a sign of programmer error. We are not using '-e' in
# this script as we'd like to handle these cases ourselves where relevant, i.e.,
# allow more than one code check failure per run.
set -u

# Work from the git root. This is important to help some tools pick up the
# correct configuration.
git_root=$(git rev-parse --show-toplevel)
cd "${git_root}"

# Define a cummulative status code for the script. The value is Updated through
# 'run_check' when running checks. A status code creater than 0 will indicate
# that one or more checks failed.
status_code=0

# Run a code check command and update the cummulative error code.
run_check() {
    $@
    status_code=$(($status_code + $?))
}

# Helper function to filter affected files by extension.
get_files_by_extension() {
    filter=""
    for ext in $@; do
        # We want a `.` to be a full stop, not a regexp wildcard.
        filter="$(echo $ext | sed -e 's|^\.|\\.|')$|${filter}"
    done
    filter=$(echo $filter | sed -e 's/|$//')

    echo $affected_files | tr ' ' '\n' | egrep $filter
}

# Helper function to get a checksum of a file list.
# Calculates a per-file checksum, sorts by filename, and then returns a sum over
# the sums.
calculate_checksum() {
    sha256sum $@ | sort -k 2 | sha256sum
}

# Check files that we can clang-format.
clang_format_files=$(get_files_by_extension .cc .cpp .h .hpp .proto)
if [ ! -z "${clang_format_files}" ]; then
    # Run clang-format. In fact, run our wrapper script around-clang format that
    # also contains logic for checking the line length.
    #
    # ISSUE https://github.com/reboot-dev/respect/issues/1371: This script is
    # very slow as we process each file sequentially and do the line length
    # checking in bash.
    #
    # Depending on whether we are in pre-commit mode of full mode, we want to
    # invoke these scripts differently:
    # TODO: Consider tidying up this and perhaps solve the above ISSUE in the
    # process.
    dev_tools_path=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
    case $mode in
        "full" )
            # For full checking, we can invoke the wrapper script directly.
            run_check "${dev_tools_path}/check-code-style/check_style_of_all_files.sh"
        ;;
        "pre-commit" )
            # For the pre-commit check we must source another bash script and
            # then we have a function available to us...
            source "${dev_tools_path}/check-code-style/check_style.sh"
            run_check check_style_of_files_in_commit
        ;;
        * )
            # For safety catch these.
            echo "Unsupported mode: $mode. This should not happen."
            exit 1
        ;;
    esac
fi

# Check bazel files
bazel_files=$(get_files_by_extension .bzl .bazel BUILD WORKSPACE)
if [ ! -z "${bazel_files}" ]; then
    run_check buildifier --lint=warn --warnings=all --mode=check ${bazel_files}
fi

# Check python files.
python_files=$(get_files_by_extension .py)
if [ ! -z "${python_files}" ]; then
    # Run yapf.
    run_check yapf -d -p ${python_files}

    # Run ruff.
    run_check ruff check ${python_files}

    # Run isort
    run_check isort --check --diff ${python_files}
fi

# Check "any" file.
if [ ! -z "${affected_files}" ]; then
    # Run prettier.
    run_check prettier --ignore-unknown --check --loglevel=warn ${affected_files}

    # Check documentation snippets (which can be affected by changes in any other file).
    # Markdown files exclude `node_modules` (pulled NPM packages) and `site-packages` (pulled Python packages).
    markdown_files=$(find . -type f \( -name "*.md" -o -name "*.mdx" \) -not \( -path "*/node_modules/*" -o -path "*/site-packages/*" \))
    unindent_auto_doc_script=$(find . -type f -name 'unindent_auto_doc.py')
    pre_autodocs_checksum=$(calculate_checksum $markdown_files)
    run_check markdown-autodocs -c code-block -o ${markdown_files} > /dev/null && python $unindent_auto_doc_script ${markdown_files} > /dev/null
    post_autodocs_checksum=$(calculate_checksum $markdown_files)
    if [ "$pre_autodocs_checksum" != "$post_autodocs_checksum" ]; then
        echo "There are code changes after running 'markdown-autodocs'."
        echo "Please review the new changes, determine if they should be part of this commit, and if so, add them to the commit before continuing."

        status_code=1
    fi
fi

# Return the cummulative status code. The status code will be zero if all checks
# completed successfully and non-zero otherwise. If the script exits with a
# non-zero value, the commit is aborted.
exit $status_code
