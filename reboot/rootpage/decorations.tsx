// Brand decoration — the same Saturn-ring SVG used on reboot.dev's
// marketing site (see `marketing/reboot.dev-3.0/src/assets/
// decorative-shapes.svg`). Anchored to the right edge of the page;
// hidden on narrow viewports where it'd crowd the content. Purely
// decorative, hidden from assistive tech.
export const Decorations = () => (
  <div className="decorations" aria-hidden="true">
    <img
      src="/__/rootpage/decorative-shapes.svg"
      alt=""
      className="decorations__shapes"
    />
  </div>
);
