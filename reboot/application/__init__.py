from rbt.v1alpha1.application.application_rbt import Application, ExamplePrompt
from reboot.application.servicer import ApplicationServicer
from reboot.run_environments import application_name

__all__ = [
    # Re-exporting `ExamplePrompt` so developers don't have to reach
    # into the generated protobuf package.
    "ExamplePrompt",
    "ref",
    "servicers",
]


def ref() -> Application.WeakReference:
    """Returns a reference to the "singleton" `Application` keyed on the
    application name.
    """
    return Application.ref(application_name())


def servicers():
    return [ApplicationServicer]
