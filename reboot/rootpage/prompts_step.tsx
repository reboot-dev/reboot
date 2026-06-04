import { ExamplePrompt } from "../../rbt/v1alpha1/application/application_pb";
import { ClientName } from "./client_picker";
import { CopyButton } from "./code_block";
import { StepCard } from "./step_card";

interface PromptsStepProps {
  clientName: ClientName;
  // Examples the developer passed via `Application(example_prompts=...)`.
  // Empty if the app hasn't registered any.
  examplePrompts: readonly ExamplePrompt[];
}

// Step 03 — render the developer-supplied example prompts. Each
// example is a named scenario containing one or more sequenced
// chat turns; we show one card per example with a copyable block
// per turn so visitors can paste them into their chat client in
// order.
export const PromptsStep = ({
  clientName,
  examplePrompts,
}: PromptsStepProps) => (
  <StepCard
    stepNumber="03"
    stepLabel="Try it"
    title={
      <>
        Try an <em>example prompt</em>.
      </>
    }
    intro={
      examplePrompts.length > 0 ? (
        <>
          Paste any of these into {clientName} to see {clientName} exercise your
          app's MCP tools. Multi-step examples are meant to be sent one turn at
          a time.
        </>
      ) : (
        <>
          Your app hasn't registered any example prompts yet. Pass{" "}
          <code>example_prompts=[...]</code> to <code>Application(...)</code>{" "}
          (typically loaded from a sibling <code>example_prompts.py</code>) to
          add some. Until then, just ask {clientName} what your app can do.
        </>
      )
    }
  >
    {examplePrompts.length > 0 ? (
      <div className="prompt-grid">
        {examplePrompts.map((example) => (
          <div key={example.title} className="prompt-card">
            <div className="prompt-card__header">
              <div className="prompt-card__title">{example.title}</div>
            </div>
            <ol className="prompt-card__turns">
              {example.prompts.map((prompt) => (
                <li key={prompt} className="prompt-card__turn">
                  <p className="prompt-card__prompt">{prompt}</p>
                  <CopyButton text={prompt} label="Copy" copiedLabel="Copied" />
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    ) : (
      <div className="prompt-grid">
        <div className="prompt-card__empty">
          No example prompts registered yet.
        </div>
      </div>
    )}
  </StepCard>
);
