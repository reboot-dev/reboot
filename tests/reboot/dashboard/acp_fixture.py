"""Deterministic ACP wire fixture, not a real provider."""
import json
import os
import sys
from pathlib import Path


def send(value):
    print(json.dumps({'jsonrpc': '2.0', **value}), flush=True)


prompt_id = None
for line in sys.stdin:
    message = json.loads(line)
    method = message.get('method')
    params = message.get('params', {})
    number = message.get('id')
    if method == 'initialize':
        send({'id': number, 'result': {'protocolVersion': 2 if 'v2' in sys.argv else 1, 'agentCapabilities': {'loadSession': 'no-load' not in sys.argv}}})
    elif method in ('session/new', 'session/load'):
        assert params['cwd'] == os.getcwd()
        if 'auth-error' in sys.argv:
            print('Authentication required: Bearer private-test-token', file=sys.stderr, flush=True)
            send({'id': number, 'error': {'code': -32000, 'message': 'Authentication required: private-test-token'}})
            continue
        send({'method': 'session/update', 'params': {'sessionId': 'fixture-session', 'update': {'sessionUpdate': 'available_commands_update', 'availableCommands': []}}})
        send({'id': number, 'result': {'sessionId': 'fixture-session'}})
    elif method == 'session/prompt':
        text = params['prompt'][0]['text']
        if text == 'crash':
            sys.exit(1)
        if text == 'malformed':
            print('not json', flush=True)
            continue
        prompt_id = number
        send({'method': 'session/update', 'params': {'sessionId': 'fixture-session', 'update': {'sessionUpdate': 'tool_call', 'toolCallId': 'edit', 'title': 'Edit application', 'status': 'pending'}}})
        send({'id': 'permission-1', 'method': 'session/request_permission', 'params': {'sessionId': 'fixture-session', 'toolCall': {'toolCallId': 'edit', 'title': 'Edit app.py'}, 'options': [{'optionId': 'allow', 'name': 'Allow once', 'kind': 'allow_once'}, {'optionId': 'deny', 'name': 'Reject', 'kind': 'reject_once'}]}})
    elif method == 'session/cancel':
        if 'late-permission' in sys.argv:
            # The adapter races cancellation with another approval request.
            send({'id': 'permission-late', 'method': 'session/request_permission', 'params': {'sessionId': 'fixture-session', 'toolCall': {'toolCallId': 'late', 'title': 'Late edit'}, 'options': [{'optionId': 'allow', 'name': 'Allow once', 'kind': 'allow_once'}]}})
        elif 'hang' not in sys.argv:
            send({'id': prompt_id, 'result': {'stopReason': 'cancelled'}})
    elif number == 'permission-late':
        Path('late-outcome.json').write_text(json.dumps(message['result']))
        send({'id': prompt_id, 'result': {'stopReason': 'cancelled'}})
    elif number == 'permission-1':
        outcome = message['result']['outcome']
        if outcome.get('optionId') == 'allow':
            path = Path('app.py')
            old = path.read_text()
            new = old.replace('hello', 'edited')
            path.write_text(new)
            send({'method': 'session/update', 'params': {'sessionId': 'fixture-session', 'update': {'sessionUpdate': 'tool_call_update', 'toolCallId': 'edit', 'status': 'completed', 'content': [{'type': 'diff', 'path': str(path.resolve()), 'oldText': old, 'newText': new}]}}})
        if outcome['outcome'] != 'cancelled':
            send({'method': 'session/update', 'params': {'sessionId': 'fixture-session', 'update': {'sessionUpdate': 'agent_message_chunk', 'content': {'type': 'text', 'text': 'Fixture turn complete'}}}})
            send({'id': prompt_id, 'result': {'stopReason': 'end_turn'}})
