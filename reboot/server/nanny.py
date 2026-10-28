# A "nanny" shell script that terminates a process once its standard
# input reaches EOF, which happens when the process that started the
# nanny has exited, however it exited (including `SIGKILL`, which no
# cleanup code can observe), because that process holds the only
# write end of the pipe. The process gets 5 seconds to exit gracefully
# before being killed.
#
# The nanny covers only the endings where the process that started
# it runs no code at all: a crash, an OOM kill, or a `SIGKILL`. On an
# orderly shutdown that process stops what it started itself and
# kills the nanny; and when it dies while the `rbt` that started it is
# alive, `rbt` terminates its whole process group, the nannied process
# included. That is why the nanny can be this simple.
#
# It is a shell script rather than Python because the process starting
# it may be Python embedded in Node.js, where `sys.executable` is not
# a Python interpreter, and because inside a Docker container a shell
# is the only interpreter we can count on. There the nannied process
# is PID 1, which the kernel shields from a `SIGKILL` sent from within
# the container, so a hung one in a container needs `docker stop`.
#
# Argument: the PID of the process to terminate.
_NANNY_SCRIPT = '''
pid="$1"
cat >/dev/null
kill -TERM "$pid" 2>/dev/null || exit 0
sleep 5
kill -KILL "$pid" 2>/dev/null
'''


def nanny_command(pid: int) -> list[str]:
    """The command that runs a nanny for the process with PID `pid`,
    which terminates that process once the command's standard input
    reaches EOF. Start it with a pipe as its standard input and hold
    the pipe's write end for as long as the process should live."""
    return [
        '/bin/sh',
        '-c',
        _NANNY_SCRIPT,
        'nanny',
        str(pid),
    ]
