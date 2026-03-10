"""Defines a macro for running a single shell multiple times with different environment"""

def multi_env_sh_test(multi_env, *args, **kwargs):
    """Defines one `sh_test` per entry in `multi_env`.

    Args:
      multi_env: a mapping from environment name to a dict of environment
        variables to set in that copy of the test.
      *args: arguments passed through to `sh_test`.
      **kwargs: keyword arguments passed through to `sh_test`.
    """
    base_name = kwargs.pop("name")
    shared_env = kwargs.pop("env", {})
    for env_name, env_overrides in multi_env.items():
        env = dict(shared_env)
        env.update(env_overrides)
        name = base_name + "_" + env_name
        native.sh_test(name = name, env = env, *args, **kwargs)
