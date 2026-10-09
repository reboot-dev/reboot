"""Public request-aware HTTP routing over a real generated gRPC/native consumer."""
import http.client
import json
import socket
import time
from typing import Any


class HttpRequestFixture:
    def __init__(self, app, environment, grpc_port, repository, evidence, record, native_read):
        self.app = app
        self.port = grpc_port + 1
        self.evidence = evidence
        self.record = record
        self.native_read = native_read
        environment['RUST_DX_HTTP_ADDR'] = f'127.0.0.1:{self.port}'
        self.role = app.parent / 'http-role-grant'
        self.role.write_text('allow')
        self.trace = app.parent / 'http-auth-trace.jsonl'
        environment['RUST_DX_HTTP_AUTH_TRACE_FILE'] = str(self.trace)
        self.slow_socket = None
        environment['RUST_DX_HTTP_ROLE_FILE'] = str(self.role)
        evidence['http_role_file'] = str(self.role)
        source = app / 'backend/src/main.rs'
        text = source.read_text()
        anchor = '''    ApplicationHost::new(application)
        .add_public_service(
            proto::hello_world_methods_server::HelloWorldMethodsServer::new(adapter),
        )
        .serve_with_shutdown(address, shutdown())
        .await?;
    Ok(())
}'''
        replacement = '''    let http_application = application.clone();
    let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);
    tokio::spawn(async move { shutdown().await; let _ = shutdown_tx.send(true); });
    let mut grpc_shutdown = shutdown_rx.clone();
    let grpc = async move {
        ApplicationHost::new(application)
            .add_public_service(proto::hello_world_methods_server::HelloWorldMethodsServer::new(adapter))
            .serve_with_shutdown(address, async move { let _ = grpc_shutdown.wait_for(|value| *value).await; }).await?;
        Ok::<(), Box<dyn std::error::Error>>(())
    };
    let http = http_service(http_application, address, shutdown_rx);
    tokio::try_join!(grpc, http)?;
    Ok(())
}'''
        assert anchor in text
        fixture = repository / 'tests/reboot/cli/fixtures/rust_http_request_host.rs'
        text = text.replace('        HelloWorld,\n    );', '        HelloWorld,\n    ).with_authorization(reboot::auth::AuthorizationPolicy::new(Some(std::sync::Arc::new(FixtureVerifier)), Some(std::sync::Arc::new(FixtureAuthorizer))));', 1)
        source.write_text(text.replace(anchor, replacement, 1) + '\n' + fixture.read_text())
        manifest = app / 'backend/Cargo.toml'
        text = manifest.read_text()
        assert '[build-dependencies]' in text
        manifest.write_text(text.replace('[build-dependencies]', 'axum = "0.7"\nserde_json = "1"\n\n[build-dependencies]', 1))

    def request(self, method, path, body=None, headers=None) -> tuple[int, Any]:
        data = json.dumps(body).encode() if isinstance(body, dict) else body
        if headers is None:
            headers = {'authorization': 'Bearer fixture-credential'}
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=6)
        try:
            conn.request(method, path, body=data, headers=headers or {})
            response = conn.getresponse()
            status = response.status
            raw = response.read()
            payload = json.loads(raw) if raw else None
        finally:
            conn.close()
        self.evidence.setdefault('http_requests', []).append({'method': method, 'path': path, 'status': status, 'response': payload})
        return status, payload

    def ready(self):
        end = time.monotonic() + 15
        while True:
            try:
                status, body = self.request('OPTIONS', '/actors/http-item?view=identity')
                assert status == 200 and body == {'method': 'OPTIONS', 'query': 'view=identity', 'application': 'rust_greetings', 'caller': None}, body
                return
            except OSError:
                assert time.monotonic() < end, 'HTTP readiness timeout'
                time.sleep(0.05)

    def first(self, session):
        self.ready()
        status, body = self.request('POST', '/actors/http-item/greet', {'key':'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}, {})
        assert status == 403 and body['grpc_code'] == 'PermissionDenied', (status, body)
        self.evidence['http_absent_actor_authorization_status'] = status
        create = {'key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}
        greet = {'key': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}
        status, body = self.request('POST', '/actors/http-item/create', create)
        assert status == 200 and body['count'] == 0 and body['caller'] is None
        for headers in [{'authorization': 'Bearer fixture-credential'}, {'authorization': 'Bearer fixture-credential', 'x-reboot-application-id': 'spoof', 'x-reboot-transaction-ids': 'spoof', 'x-reboot-caller-id':'spoof', 'x-reboot-internal-call':'true'}]:
            status, body = self.request('POST', '/actors/http-item/greet?view=body', greet, headers)
            assert status == 200 and body['count'] == 1 and body['application'] == 'rust_greetings' and body['caller'] is None and body['query'] == 'view=body', body
        before = self.native_read(session)
        assert before == b'\x08\x01'
        for bad in [b'{invalid', b'{"key":"not-a-uuid"}']:
            assert self.request('POST', '/actors/http-item/greet', bad)[0] == 400
        assert self.request('POST', '/actors/http-item/greet', b'x' * 2048)[0] == 413
        assert self.request('DELETE', '/actors/http-item')[0] == 405
        status, body = self.request('POST', '/actors/http-item/greet', greet, {'authorization': 'Bearer unverified', 'x-reboot-application-id': 'spoof'})
        assert status in (401, 403) and body['grpc_code'] in ('Unauthenticated', 'PermissionDenied'), (status, body)
        assert self.native_read(session) == before
        for headers in [{}, {'authorization':'Bearer fixture-credential extra'}]:
            status, body = self.request('POST', '/actors/http-item/greet', greet, headers)
            assert status == 403 and body['grpc_code'] == 'PermissionDenied', (status, body)
        self.role.write_text('deny')
        try:
            status, body = self.request('POST', '/actors/http-item/greet', greet)
            assert status == 403 and body['grpc_code'] == 'PermissionDenied', (status, body)
            assert self.native_read(session) == before
            status, body = self.request('POST', '/actors/http-item/create', create)
            assert status == 403 and body['grpc_code'] == 'PermissionDenied', (status, body)
            traces = [json.loads(line) for line in self.trace.read_text().splitlines()]
            assert all(any(t['method'].endswith(method) and t['count'] == 1 and t['authenticated'] and not t['grant'] for t in traces) for method in ['Create','Greet']), traces
            self.evidence['http_revoked_current_state_authorization'] = traces[-2:]
            assert self.native_read(session) == before
        finally:
            self.role.write_text('allow')
        self.evidence['http_original_state'] = before.hex()
        self.record('PASS request-aware HTTP constructor/write/replay/query, bounded body, method gate and unverified cached-key denial preserve canonical native bytes')

    def restored(self, session):
        self.ready()
        status, body = self.request('GET', '/actors/http-item?view=count')
        assert status == 200 and body['count'] == 1 and body['query'] == 'view=count', body
        status, body = self.request('POST', '/actors/http-item/greet', {'key': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})
        assert status == 200 and body['count'] == 1, body
        status, body = self.request('POST', '/actors/http-item/create', {'key': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'})
        assert status == 200 and body['count'] == 0, body
        assert self.native_read(session).hex() == self.evidence['http_original_state']
        self.record('PASS request-aware HTTP reads and idempotent writer replay survive real RocksDB restart')

    def begin_slow_body(self):
        self.slow_socket = socket.create_connection(('127.0.0.1', self.port), timeout=4)
        self.slow_socket.sendall(b'POST /actors/http-item/greet HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer fixture-credential\r\nContent-Length: 1000\r\nConnection: close\r\n\r\n{')
        time.sleep(0.1)

    def closed(self):
        if self.slow_socket is not None:
            try:
                reply = b''
                while b'\r\n' not in reply:
                    part = self.slow_socket.recv(4096)
                    assert part, 'slow request lost without a bounded HTTP response'
                    reply += part
                assert reply.startswith(b'HTTP/1.1 408'), reply
                self.evidence['http_partial_body_shutdown_status'] = 408
                self.record('PASS partial HTTP body is bounded and drains on generated host shutdown before RPC mutation')
            finally:
                self.slow_socket.close()
                self.slow_socket = None
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=1)
        try:
            try:
                conn.request('GET', '/actors/http-item')
                conn.getresponse()
            except OSError:
                self.record('PASS request-aware HTTP listener is closed with its generated host')
                return
            raise AssertionError('HTTP listener survived generated host shutdown')
        finally:
            conn.close()
