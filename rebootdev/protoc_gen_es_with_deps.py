import os


# This is a separate function (rather than just being in `__main__`) so that we
# can refer to it as a `script` in our `pyproject.rbt.toml` file.
def main():
    protoc_gen_es_with_deps_cjs = 'protoc_gen_es_with_deps.cjs'
    os.execl(
        f"{os.path.join(os.path.dirname(os.path.abspath(__file__)), protoc_gen_es_with_deps_cjs)}",
        protoc_gen_es_with_deps_cjs,
    )


if __name__ == '__main__':
    main()
