# dev-tools

Collection of developer scripts, files, etc, for improving the developer process.

You can use `bootstrap` to "install" some of these tools, e.g., the `pre-commit` hook.

Note that we currently use `ln -s` to "install" git hooks rather than just making a copy so that we can actually update it in the repository and everyone will benefit from the update.

#### **_So, before you start the work with some repo including this current repo as a submodule, we recommend you to run this file with the following command in the root directory (Linux & macOS):_**

```
cd dev-tools && ./bootstrap.sh
```
