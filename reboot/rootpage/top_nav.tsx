interface TopNavProps {
  appName: string;
  // `false` until the `Get` reader has produced a response. While
  // it's `false` the wizard shows an animated ellipsis where the
  // app name would go — just like the hero does for the same
  // pre-connect state.
  appNameReady: boolean;
}

export const TopNav = ({ appName, appNameReady }: TopNavProps) => (
  <nav className="top-nav">
    <div className="top-nav__brand">
      <img src="/__/rootpage/reboot-logo.svg" alt="reboot" />
      <span className="top-nav__divider">/</span>
      <span className="top-nav__app-name">
        {appNameReady ? (
          appName
        ) : (
          <span className="waiting-dots" aria-hidden="true" />
        )}
      </span>
    </div>
    <div className="top-nav__actions">
      <a
        className="button button--ghost"
        href="https://docs.reboot.dev"
        target="_blank"
        rel="noreferrer"
      >
        Docs ↗
      </a>
      <a
        className="button button--primary"
        href="https://cloud.reboot.dev"
        target="_blank"
        rel="noreferrer"
      >
        Cloud login
      </a>
    </div>
  </nav>
);
