import { type ReactNode, useId, useState } from "react";
import { ChevronIcon } from "./icons";

interface StepCardProps {
  stepNumber: string;
  stepLabel: string;
  title: ReactNode;
  intro?: ReactNode;
  children: ReactNode;
}

// Numbered step container — two-column layout (sticky index on the
// left, content on the right) on wide screens, stacked on narrow.
export const StepCard = ({
  stepNumber,
  stepLabel,
  title,
  intro,
  children,
}: StepCardProps) => (
  <section className="step">
    <div className="step__index">
      <div className="step__number">{stepNumber}</div>
      <div className="step__label">{stepLabel}</div>
    </div>
    <div className="step__body">
      <h2 className="step__title">{title}</h2>
      {intro && <div className="step__intro">{intro}</div>}
      {children}
    </div>
  </section>
);

interface SubstepProps {
  done?: boolean;
  title: ReactNode;
  hint?: ReactNode;
  // When true, the substep starts with its body collapsed and a
  // chevron next to the title that toggles expansion. Useful for
  // "done" substeps where the body is reference material the user
  // doesn't need to see by default but may want to revisit.
  collapsible?: boolean;
  children?: ReactNode;
}

// Card-style substep row used inside step cards. The icon switches
// to a check on the green brand pill when `done` is true. When
// `collapsible` is set the substep body is hidden behind a
// click-to-expand chevron.
export const Substep = ({
  done,
  title,
  hint,
  collapsible,
  children,
}: SubstepProps) => {
  const [expanded, setExpanded] = useState(false);
  const showBody = !!children && (!collapsible || expanded);

  const headerInteractive = collapsible && !!children;
  const bodyId = useId();

  // Header content is identical in both modes; only the wrapping
  // element differs. We use `<span>` throughout (rather than `<div>`
  // and `<p>`) so the interactive case can wrap everything in a
  // real `<button>` — block-level elements aren't valid children of
  // `<button>`. The visual stacking of title / text is handled by
  // `.substep__header-body` being a flex column in CSS.
  const headerContent = (
    <>
      <span className={`substep__icon${done ? " substep__icon--done" : ""}`}>
        {done ? "✓" : "·"}
      </span>
      <span className="substep__header-body">
        <span className="substep__title">{title}</span>
        {hint && <span className="substep__hint">{hint}</span>}
      </span>
      {headerInteractive && (
        <span
          className={`substep__chevron${
            expanded ? " substep__chevron--expanded" : ""
          }`}
          aria-hidden="true"
        >
          <ChevronIcon />
        </span>
      )}
    </>
  );

  return (
    <div className="substep">
      {headerInteractive ? (
        <button
          type="button"
          className="substep__header substep__header--interactive"
          onClick={() => setExpanded((expanded) => !expanded)}
          aria-expanded={expanded}
          aria-controls={bodyId}
        >
          {headerContent}
        </button>
      ) : (
        <div className="substep__header">{headerContent}</div>
      )}
      {showBody && (
        <div className="substep__body" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  );
};
