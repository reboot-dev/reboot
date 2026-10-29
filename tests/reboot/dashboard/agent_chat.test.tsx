import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentChat } from '../../../reboot/dashboard/web/src/agent_chat';
const client = vi.hoisted(() => ({ url: 'http://127.0.0.1:9871', bearerToken: 'test-token' }));
vi.mock('@reboot-dev/reboot-react', () => ({ useRebootClient: () => client }));
vi.mock('../../../reboot/dashboard/web/src/constants', () => ({ IN_MCP_HOST: false }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); client.bearerToken = 'test-token'; });

test('token refresh preserves the active stream and provider, actions use the fresh token', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let connectionSignal!: AbortSignal;
  const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
    if (String(url).endsWith('/config')) return Response.json({ enabled: true, providers: ['codex', 'claude'] });
    if (String(url).endsWith('/connect')) {
      connectionSignal = init.signal!;
      return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }));
    }
    return Response.json({ ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  const emit = async (value: object) => act(async () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); });
  const view = render(<AgentChat />);
  await screen.findByText('New session');
  fireEvent.change(screen.getByLabelText('Agent provider'), { target: { value: 'claude' } });
  fireEvent.click(screen.getByText('New session'));
  await waitFor(() => expect(controller).toBeDefined());
  await emit({ type: 'ready', channel: 'opaque', cwd: '/application' });
  client.bearerToken = 'refreshed-token';
  view.rerender(<AgentChat />);
  await act(async () => {});
  expect(connectionSignal.aborted).toBe(false);
  expect((screen.getByLabelText('Agent provider') as HTMLSelectElement).value).toBe('claude');
  await emit({ type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Still connected' } } });
  expect(screen.getByText('Still connected')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Message agent'), { target: { value: 'Continue' } });
  fireEvent.click(screen.getByText('Send'));
  const action = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/action'));
  expect(action?.[1].headers).toMatchObject({ Authorization: 'Bearer refreshed-token' });
  expect(JSON.parse(action![1].body as string)).toMatchObject({ channel: 'opaque', text: 'Continue' });
  view.unmount();
  expect(connectionSignal.aborted).toBe(true);
  await act(async () => { controller.close(); });
});

test('page remount rediscovers provider resume, cleanup conflict is retryable without replay', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let connectionSignal!: AbortSignal;
  let remembered = false;
  let active = false;
  let conflict = false;
  const payloads: object[] = [];
  const fetchMock = vi.fn(async (url: URL, init: RequestInit) => {
    if (String(url).endsWith('/config')) return Response.json({ enabled: true, providers: ['codex', 'claude'], resumable: { codex: remembered, claude: false }, active });
    const value = JSON.parse(init.body as string);
    payloads.push(value);
    if (String(url).endsWith('/connect')) {
      if (conflict) return new Response('', { status: 409 });
      connectionSignal = init.signal!;
      remembered = true;
      active = true;
      return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }));
    }
    return Response.json({ ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
  const emit = async (value: object) => act(async () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); });
  const first = render(<AgentChat />);
  fireEvent.click(await screen.findByText('New session'));
  await waitFor(() => expect(controller).toBeDefined());
  await emit({ type: 'ready', channel: 'old-channel', canResume: true });
  first.unmount();
  expect(connectionSignal.aborted).toBe(true);
  await act(async () => { controller.close(); });

  // A true remount has no retained React state and no channel/session ID.
  const second = render(<AgentChat />);
  const resume = await screen.findByText('Resume last session') as HTMLButtonElement;
  await waitFor(() => expect(resume.disabled).toBe(false));
  expect(screen.getByText(/Another connection is active/)).toBeDefined();
  fireEvent.change(screen.getByLabelText('Agent provider'), { target: { value: 'claude' } });
  expect(resume.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Agent provider'), { target: { value: 'codex' } });
  expect(resume.disabled).toBe(false);
  conflict = true;
  fireEvent.click(resume);
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('retry');
  await waitFor(() => expect(resume.disabled).toBe(false));
  conflict = false;
  active = false;
  fireEvent.click(resume);
  await waitFor(() => expect(payloads).toHaveLength(3));
  await emit({ type: 'models', model: { id: 'loaded-model', currentValue: 'retained-model', options: [{ value: 'retained-model', name: 'Retained model' }] } });
  await emit({ type: 'ready', channel: 'fresh-channel', canResume: true });
  expect((screen.getByLabelText('Agent model') as HTMLSelectElement).value).toBe('retained-model');
  expect(payloads).toEqual([{ provider: 'codex', resume: false }, { provider: 'codex', resume: true }, { provider: 'codex', resume: true }]);
  second.unmount();
  await act(async () => { controller.close(); });
});

test('disconnected status polling observes cleanup and never connects or replays by itself', async () => {
  let active = true;
  const fetchMock = vi.fn(async (_url: URL) => Response.json({ enabled: true, providers: ['codex'], resumable: { codex: true }, active }));
  vi.stubGlobal('fetch', fetchMock);
  const view = render(<AgentChat />);
  await screen.findByText(/Another connection is active/);
  active = false;
  await waitFor(() => expect(screen.queryByText(/Another connection is active/)).toBeNull(), { timeout: 2500 });
  expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/config'))).toBe(true);
  expect((screen.getByText('Resume last session') as HTMLButtonElement).disabled).toBe(false);
  view.unmount();
});

test('disabled by default', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ enabled: false })));
  render(<AgentChat />);
  await act(async () => {});
  expect(screen.queryByLabelText('Local coding agent')).toBeNull();
});

test('agent models drive selection, busy gating, errors and resume rediscovery', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let resolveAction!: (response: Response) => void;
  const calls: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).endsWith('/config')) return Response.json({ enabled: true, providers: ['codex'] });
    if (String(url).endsWith('/connect')) return new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }));
    if (JSON.parse(init.body).type === 'model') return new Promise<Response>(resolve => { resolveAction = resolve; });
    return Response.json({ ok: true });
  }));
  const emit = async (value: object) => act(async () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n')); });
  const options = [{ value: 'actual-a', name: 'Advertised A' }, { value: 'actual-b', name: 'Advertised B' }];
  const view = render(<AgentChat />);
  fireEvent.click(await screen.findByText('New session'));
  await waitFor(() => expect(controller).toBeDefined());
  await emit({ type: 'models', model: { id: 'agent-selector', currentValue: 'actual-b', options } });
  await emit({ type: 'ready', channel: 'opaque', canResume: true });
  const select = screen.getByLabelText('Agent model') as HTMLSelectElement;
  expect(select.value).toBe('actual-b');
  expect(select.disabled).toBe(false);
  expect(Array.from(select.options).map(option => option.value)).toEqual(['actual-a', 'actual-b']);
  fireEvent.change(select, { target: { value: 'actual-a' } });
  await waitFor(() => expect(resolveAction).toBeDefined());
  expect(select.disabled).toBe(true);
  expect(select.value).toBe('actual-b');
  expect((screen.getByLabelText('Message agent') as HTMLTextAreaElement).disabled).toBe(true);
  expect(JSON.parse(calls[calls.length - 1][1].body)).toEqual({ type: 'model', value: 'actual-a', channel: 'opaque' });
  await emit({ type: 'models', model: { id: 'agent-selector', currentValue: 'actual-a', options } });
  await act(async () => { resolveAction(Response.json({ ok: true })); });
  expect(select.value).toBe('actual-a');
  fireEvent.change(screen.getByLabelText('Message agent'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByText('Send'));
  expect(select.disabled).toBe(true);
  await emit({ type: 'complete', stopReason: 'end_turn' });
  expect(select.disabled).toBe(false);
  await emit({ type: 'permission', request: 'pending', toolCall: { toolCallId: 'read' }, options: [] });
  expect(select.disabled).toBe(true);
  await emit({ type: 'permissions_cleared' });
  fireEvent.change(select, { target: { value: 'actual-b' } });
  await act(async () => { resolveAction(new Response('', { status: 502 })); });
  expect(screen.getByRole('alert').textContent).toContain('502');
  expect(select.value).toBe('actual-a');
  await emit({ type: 'models', model: null });
  expect(select.disabled).toBe(true);
  expect(select.textContent).toContain('unavailable');
  await act(async () => { controller.close(); });
  fireEvent.click(screen.getByText('Resume last session'));
  await emit({ type: 'models', model: { id: 'new-selector', currentValue: 'loaded-only', options: [{ value: 'loaded-only', name: 'Loaded model' }] } });
  await emit({ type: 'ready', channel: 'new-channel', canResume: true });
  expect(select.value).toBe('loaded-only');
  expect(select.options.length).toBe(1);
  view.unmount();
  await act(async () => { controller.close(); });
});

test('honestly shows unavailable models without guessing defaults', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal('fetch', vi.fn(async url => String(url).endsWith('/config')
    ? Response.json({ enabled: true, providers: ['claude'] })
    : new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; } }))));
  const view = render(<AgentChat />);
  fireEvent.click(await screen.findByText('New session'));
  await waitFor(() => expect(controller).toBeDefined());
  await act(async () => { controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'ready', channel: 'opaque' }) + '\n')); });
  const select = screen.getByLabelText('Agent model') as HTMLSelectElement;
  expect(select.disabled).toBe(true);
  expect(select.textContent).toContain('agent did not advertise options');
  view.unmount();
  await act(async () => { controller.close(); });
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
