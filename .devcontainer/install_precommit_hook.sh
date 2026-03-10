#!/bin/bash
#
function install_precommit_hook() {
    local repo_top_level="$(git rev-parse --show-toplevel)"
    # In the mono repo, submodules live under `public/`; in the standalone
    # public repo they live directly at the top level.
    local prefix=""
    if [[ -d "${repo_top_level}/public" ]]; then
        prefix="public/"
    fi
    local dev_tools_commit_hook_path="${repo_top_level}/${prefix}submodules/dev-tools/pre-commit";
    local local_dev_tools_commit_hook_path="${repo_top_level}/.git/hooks/dev-tools-pre-commit";
    local rbt_documentation_commit_hook_path="${repo_top_level}/${prefix}documentation/pre-commit";
    local local_rbt_documentation_commit_hook_path="${repo_top_level}/.git/hooks/rbt-documentation-pre-commit";
    local local_combined_commit_hook_path="${repo_top_level}/.git/hooks/pre-commit";

    # Check that the dev-tools hook file exists.
    if [[ ! -f "${dev_tools_commit_hook_path}" ]]; then
        echo "Commit hook from dev-tools not found at '${dev_tools_commit_hook_path}' Aborting.";
        return 1
    fi

    # Check that the rbt documentation hook file exists.
    if [[ ! -f "${rbt_documentation_commit_hook_path}" ]]; then
        echo "Commit hook from documentation not found at '${rbt_documentation_commit_hook_path}' Aborting.";
        return 1
    fi

    # Create a local symlink for the dev-tools hook. Remove any old ones first,
    # in case the paths we're working with have changed.
    rm -f "${local_dev_tools_commit_hook_path}"
    ln -s -f "${dev_tools_commit_hook_path}" "${local_dev_tools_commit_hook_path}"

    # Create a local symlink for the rbt documentation hook. Remove any old
    # ones first, in case the paths we're working with have changed.
    rm -f "${local_rbt_documentation_commit_hook_path}"
    ln -s -f "${rbt_documentation_commit_hook_path}" "${local_rbt_documentation_commit_hook_path}"

    # Delete any old precommit hook. It's important to explicitly delete (rather
    # than just overwriting) in case the old version was a symlink pointing to a
    # file that we don't actually want to overwrite).
    rm -f "${local_combined_commit_hook_path}"

    # Create a top-level precommit hook that calls the pulled-in files.
    echo "${local_dev_tools_commit_hook_path}; if [ ! \$? -eq 0 ]; then exit 1; fi; ${local_rbt_documentation_commit_hook_path}; exit \$?" > "${local_combined_commit_hook_path}"
    chmod +x "${local_combined_commit_hook_path}"
}

install_precommit_hook
