// Full-page splash shown until the first `Application.get` response
// arrives. We don't yet know the app's title or — crucially —
// whether it's an MCP app, so we can't pick the wizard vs. the
// "API is ready" layout. Rather than flash the wrong one, we show
// the Reboot logo with a spinner beside it until we know.
export const Loading = () => (
  <div className="loading" role="status" aria-label="Loading">
    <img
      className="loading__logo"
      src="/__/rootpage/reboot-logo.svg"
      alt="Reboot"
    />
    <span className="loading__spinner" aria-hidden="true" />
  </div>
);
