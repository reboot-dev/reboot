import type { CSSProperties } from "react";

export interface RadioOption<T extends string> {
  id: T;
  label: string;
}

interface RadioGroupProps<T extends string> {
  // Accessible label for the radiogroup as a whole.
  ariaLabel: string;
  options: ReadonlyArray<RadioOption<T>>;
  selectedOptionId: T;
  onSelect: (id: T) => void;
}

// Generic card-style radio group used by the wizard's client and
// tunnel-provider pickers.
export const RadioGroup = <T extends string>({
  ariaLabel,
  options,
  selectedOptionId,
  onSelect,
}: RadioGroupProps<T>) => (
  <div
    className="radio-group"
    role="radiogroup"
    aria-label={ariaLabel}
    // Match the column count to the option count so two-option
    // groups don't leave an empty slot. The mobile media query
    // collapses this back to one column.
    style={{ "--radio-columns": String(options.length) } as CSSProperties}
  >
    {options.map((option) => {
      const isSelected = option.id === selectedOptionId;
      return (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={isSelected}
          onClick={() => onSelect(option.id)}
          className={`radio-card${isSelected ? " radio-card--selected" : ""}`}
        >
          <span className="radio-card__name">{option.label}</span>
          <span className="radio-card__pip" />
        </button>
      );
    })}
  </div>
);
