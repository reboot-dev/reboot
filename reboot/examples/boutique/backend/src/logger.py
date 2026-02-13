import logging
from log.log import formatter

stream_handler = logging.StreamHandler()
stream_handler.setFormatter(formatter)

logger = logging.getLogger('demo')
logger.addHandler(stream_handler)
logger.setLevel(logging.INFO)
