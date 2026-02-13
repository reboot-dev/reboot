# To ensure idempotency for our email sending process, we rely on
# querying an endpoint that provides a list of events related to the
# email delivery. The endpoint we query for events operates on an
# eventually consistent basis, which means that there might be a
# slight delay in reflecting the latest events.
#
# Based on a statistical analysis of O(1000) emails, this delay is 5
# seconds in the worst case.
#
# We wait for 10 seconds to add an extra safety margin.
MAILGUN_EVENT_API_CONSISTENCY_DELAY_SEC = 10

MAILGUN_API_KEY_SECRET_NAME = "mailgun-api-key"
