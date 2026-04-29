# Mailgun

`rbt.thirdparty.mailgun.v1`

----

Third-party integration that supports sending email messages using the Mailgun API.

To use the Mailgun integration, set the `MAILGUN_API_KEY`
environment variable to your Mailgun API key. See [Secrets](../learn_more/secrets.mdx)
for how to set this for local development and for deployments to
Reboot Cloud.

## Message {#rbtthirdpartymailgunv1message}
A single message sent using the integration.

Created and scheduled using its constructor: `await Message.send(...)`.

### Send

> **rpc** Send([SendRequest](#sendrequest))
    [SendResponse](#sendresponse)

Construct and send an email message using the Mailgun API.

Returns a `task_id` which can be used for the message to have
been sent.

## Messages

### SendRequest {#sendrequest}
See `Send`.

| Field | Type | Description |
| ----- | ---- | ----------- |
| recipient | string | The email address of the recipient of the message. |
| sender | string | The email address of the sender of the message. |
| subject | string | The subject of the message. |
| domain | string | The domain to send from. |
| [**oneof**](https://developers.google.com/protocol-buffers/docs/proto3#oneof) body.text | string | The body content of the message, as text. |
| [**oneof**](https://developers.google.com/protocol-buffers/docs/proto3#oneof) body.html | string | The body content of the message, as HTML. |


### SendResponse {#sendresponse}
See `Send`.


| Field | Type | Description |
| ----- | ---- | ----------- |
| task_id | rbt.v1alpha1.TaskId | ID of the task scheduled to send the email. |


## Testing

If your servicer sends emails, you can mock this functionality using
`reboot.thirdparty.mailgun.servicers.MockMessageServicer`. This mock service
stores emails in memory, allowing you to verify the emails sent during
your tests. Simply pass it as a servicer to the Reboot class servicers list
and use the `emails_sent` list to check the emails sent.

```python
# Some servicer method call, which should send an email.

await MockMessageServicer.emails_sent_sema.acquire()
self.assertEqual(1, len(MockMessageServicer.emails_sent))
```

:::note
When using `MockMessageServicer`, ensure that the `MAILGUN_API_KEY`
environment variable is set (any non-empty value works for the
mock).
:::
