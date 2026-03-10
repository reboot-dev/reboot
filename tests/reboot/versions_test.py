import json
import os
import unittest
import yaml
from tests.reboot.workspace_directory import WORKSPACE_DIR

ALL_PACKAGE_NAMES = [
    'reboot',
    '@reboot-dev/reboot',
    '@reboot-dev/reboot-react',
    '@reboot-dev/reboot-api',
    'ghcr.io/reboot-dev/reboot-base',
]
BASE_IMAGE_NAME = "ghcr.io/reboot-dev/reboot-base"


class RebootVersionTest(unittest.TestCase):

    def test_reboot_versions(self) -> None:
        """Test that all Reboot related packages are pinned to the same
        version.
        """
        versions = open('reboot/versions.bzl', 'r')
        lines = versions.readlines()

        # Get the package version.
        version = ''
        for line in lines:
            if not line[0] == '#' and '=' in line:
                version_name, version_value = line.split('=')
                # Invariant here is that this version_name must match
                # REBOOT_VERSION in versions.bzl.
                if version_name.strip() == 'REBOOT_VERSION':
                    version = version_value.strip()[1:-1]
                    break

        if version == '':
            self.fail('Version not found in versions.bzl.')

        # Find all file paths.
        package_json_file_paths = set()
        requirements_txt_file_paths = set()
        dockerfile_paths = set()
        helm_chart_paths = set()
        skill_md_paths = set()
        for (dirpath, _, filenames) in os.walk(WORKSPACE_DIR):
            # Skip these. Not the source code that we are looking for.
            if any(
                path in dirpath
                for path in ['bazel-', 'submodules', '.venv', 'node_modules']
            ):
                continue

            # The expectation is all Node package files are named package.json.
            if 'package.json' in filenames:
                package_json_file_paths.add(f'{dirpath}/package.json')
            # Also look for `package.json.j2` (templates for package.json).
            if 'package.json.j2' in filenames:
                package_json_file_paths.add(f'{dirpath}/package.json.j2')
            # Also look for `backend_package.json.j2` (templates for package.json).
            if 'backend_package.json.j2' in filenames:
                package_json_file_paths.add(
                    f'{dirpath}/backend_package.json.j2'
                )

            # The expectation is all Python package files are named
            #  requirements.txt
            if 'requirements.txt' in filenames:
                requirements_txt_file_paths.add(f'{dirpath}/requirements.txt')

            # We are checking for Dockerfiles, that are parts of examples
            # and are using the 'reboot-base' image, Dockerfiles in
            # 'reboot/containers' are own images for development, so we
            # skip them.
            if 'Dockerfile' in filenames and 'reboot/examples' in dirpath:
                dockerfile_paths.add(f'{dirpath}/Dockerfile')

            if 'charts' in dirpath and 'Chart.yaml' in filenames:
                helm_chart_paths.add(f'{dirpath}/Chart.yaml')

            if 'SKILL.md' in filenames:
                skill_md_paths.add(f'{dirpath}/SKILL.md')

        for path in package_json_file_paths:
            with open(path) as package_json_file:
                package_json = json.load(package_json_file)
                deps = package_json.get('dependencies')
                if deps is None:
                    continue
                if any(
                    [
                        package_name in deps
                        for package_name in ALL_PACKAGE_NAMES
                    ]
                ):
                    for package_name in ALL_PACKAGE_NAMES:
                        if deps.get(package_name) is None:
                            continue
                        if deps.get(package_name) == 'workspace:*':
                            continue
                        # We expect all files to be updated to the same version.
                        if version not in deps.get(package_name):
                            self.fail(
                                f'{path} contains a package version for: ' \
                                f'{package_name} that is out of date with' \
                                f' version {version} (found '
                                f'"{deps.get(package_name)}")'
                            )

        for path in requirements_txt_file_paths:
            with open(path, 'r') as requirements_file:
                package_file_lines = requirements_file.readlines()
                for line in package_file_lines:
                    # If any of the package names in ALL_PACKAGE_NAMES is present
                    # in the file, check that the version listed is the same as
                    # the version in 'versions.bzl'.
                    if any(
                        [
                            package_name in line
                            for package_name in ALL_PACKAGE_NAMES
                        ]
                    ):
                        # We expect all files to be updated to the same version.
                        if version not in line:
                            self.fail(
                                f'{path} contains a package version on line: ' \
                                f'{line} that is out of date with' \
                                f' version {version}'
                            )

        for path in dockerfile_paths:
            with open(path, 'r') as dockerfile:
                dockerfile_lines = dockerfile.readlines()
                for line in dockerfile_lines:
                    if line.startswith("FROM") and BASE_IMAGE_NAME in line:
                        # We expect all files to be updated to the same version.
                        if version not in line:
                            self.fail(
                                f'{path} contains a package version on line: ' \
                                f'{line} that is out of date with' \
                                f' version {version}'
                            )

        for path in helm_chart_paths:
            with open(path, 'r') as helm_chart_file:
                helm_chart = yaml.safe_load(helm_chart_file)
                for key in ('version', 'appVersion'):
                    if not helm_chart[key].startswith(version):
                        self.fail(
                            f'{path} contains package version `{helm_chart[key]}` '
                            f'in key `{key}`, '
                            f'which is out of date with version {version}'
                        )

        for path in skill_md_paths:
            with open(path, 'r') as skill_md_file:
                skill_md_lines = skill_md_file.readlines()
                for line in skill_md_lines:
                    # Only check lines that look like version pins (i.e.
                    # contain a version specifier such as `>=`, `==`, or
                    # `^`), so that we won't accidentally check lines
                    # that just mention the package name without a version,
                    # since `SKILL.md` files doesn't have a standard
                    # format and usually are pure text.
                    if not any(
                        specifier in line for specifier in (
                            '>=',
                            '==',
                            '^',
                        )
                    ):
                        continue
                    if any(
                        [
                            package_name in line
                            for package_name in ALL_PACKAGE_NAMES
                        ]
                    ):
                        if version not in line:
                            self.fail(
                                f'{path} contains a package version on line: '
                                f'{line} that is out of date with'
                                f' version {version}'
                            )


if __name__ == '__main__':
    unittest.main()
