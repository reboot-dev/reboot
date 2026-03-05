# To test the imports we'll import them; to explain to linters that the unused
# imports aren't a problem we comment "noqa".
import google.protobuf  # noqa
import jinja2  # noqa
import pyprotoc_plugin  # noqa
import pyprotoc_plugin.helpers  # noqa
from pyprotoc_plugin.helpers import load_template  # noqa

print('All imports tested.')
