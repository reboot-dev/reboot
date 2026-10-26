import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentChat } from '../../../reboot/dashboard/web/src/agent_chat';
vi.mock('@reboot-dev/reboot-react', () => ({ useRebootClient: () => ({ url: 'http://127.0.0.1:9871', bearerToken: 'test-token' }) }));
vi.mock('../../../reboot/dashboard/web/src/constants', () => ({ IN_MCP_HOST: false }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('disabled by default', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ enabled: false })));
  render(<AgentChat />);
  await act(async () => {});
  expect(screen.queryByLabelText('Local coding agent')).toBeNull();
});

test('streams edits, actual options and cancels without browser session or commands', async () => {
  let controller: ReadableStreamDefaultController;
  const calls: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).endsWith('/config')) return Response.json({ enabled: true, providers: ['codex', 'claude'] });
    if (String(url).endsWith('/connect')) return new Response(new ReadableStream({ start(c) { controller = c; } }));
    return Response.json({ ok: true });
  }));
  const emit = async (value: object) => act(async () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); });
  render(<AgentChat />);
  fireEvent.click(await screen.findByText('New session'));
  await waitFor(() => expect(controller).toBeDefined());
  await emit({ type: 'ready', channel: 'opaque', cwd: '/application', canResume: true });
  fireEvent.change(screen.getByLabelText('Message agent'), { target: { value: 'Edit the application' } });
  fireEvent.click(screen.getByText('Send'));
  await emit({ type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Working' } } });
  await emit({ type: 'permission', request: 'request-1', toolCall: { toolCallId: 'edit', title: 'Edit app.py' }, options: [{ optionId: 'native-allow', name: 'Allow this edit', kind: 'allow_once' }, { optionId: 'native-reject', name: 'Reject', kind: 'reject_once' }] });
  fireEvent.click(screen.getByText('Allow this edit (allow_once)'));
  await waitFor(() => expect(calls.some(([, init]) => init.body?.includes('native-allow'))).toBe(true));
  await emit({ type: 'update', update: { sessionUpdate: 'tool_call', toolCallId: 'edit', title: 'Edited', status: 'completed', content: [{ type: 'diff', path: '/application/app.py', oldText: 'before', newText: 'after' }] } });
  expect(screen.getByLabelText('After edit').textContent).toBe('after');
  fireEvent.click(screen.getByText('Cancel turn'));
  await waitFor(() => expect(calls.some(([, init]) => init.body?.includes('"type":"cancel"'))).toBe(true));
  const payloads = calls.map(([, init]) => init.body).filter(Boolean).map(value => JSON.parse(value));
  expect(payloads.every(value => !('sessionId' in value) && !('command' in value) && !('cwd' in value))).toBe(true);
  await emit({ type: 'complete', stopReason: 'cancelled' });
  expect(screen.getByRole('status').textContent).toBe('Stopped: cancelled');
});
