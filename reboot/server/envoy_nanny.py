# A "nanny" shell script that terminates Envoy once its standard input
# reaches EOF, which happens when the process that started it has
# exited, however it exited (including `SIGKILL`, which no cleanup code
# can observe), because that process holds the only write end of the
# pipe. Envoy gets 5 seconds to exit gracefully before being killed.
#
# The nanny covers only the endings where the process that started
# Envoy runs no code at all: a crash, an OOM kill, or a `SIGKILL`. On
# an orderly shutdown that process stops Envoy itself, through
# `LocalEnvoy.stop()`, and kills the nanny; and when it dies while the
# `rbt` that started it is alive, `rbt` terminates its whole process
# group, Envoy included. That is why the nanny can be this simple.
#
# It is a shell script rather than Python because the process starting
# Envoy may be Python embedded in Node.js, where `sys.executable` is
# not a Python interpreter, and because inside the Envoy Docker
# container a shell is the only interpreter we can count on. There
# Envoy is PID 1, which the kernel shields from a `SIGKILL` sent from
# within the container, so a hung Envoy in a container needs
# `docker stop`.
#
# Argument: Envoy's PID.
_ENVOY_NANNY_SCRIPT = '''
envoy_pid="$1"
cat >/dev/null
kill -TERM "$envoy_pid" 2>/dev/null || exit 0
sleep 5
kill -KILL "$envoy_pid" 2>/dev/null
'''


def envoy_nanny_command(envoy_pid: int) -> list[str]:
    """The command that runs a nanny for the Envoy with PID `envoy_pid`,
    which terminates that Envoy once the command's standard input
    reaches EOF. Start it with a pipe as its standard input and hold
    the pipe's write end for as long as Envoy should live."""
    return [
        '/bin/sh',
        '-c',
        _ENVOY_NANNY_SCRIPT,
        'envoy-nanny',
        str(envoy_pid),
    ]
