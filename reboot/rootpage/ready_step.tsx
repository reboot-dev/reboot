import { CodeBlock, CopyButton, InlineCode } from "./code_block";
import { StepCard, Substep } from "./step_card";

// Body shown (in place of the chat-client wizard steps) when the
// application exposes no MCP tools or resources. Reproduces the
// guidance the rootpage served before the wizard existed: a link to
// inspect state, and snippets for calling the app from a React
// frontend or an `ExternalContext`.
export const ReadyStep = () => {
  // The app's own origin — what a frontend or `ExternalContext`
  // would point at.
  const url = window.location.origin;

  const frontendSnippet =
    `<RebootClientProvider url="${url}">\n` +
    `  <App />\n` +
    `</RebootClientProvider>`;
  const externalContextTs = `const context = new ExternalContext({ url: "${url}", name: "..." });`;
  const externalContextPy = `context = ExternalContext(url="${url}", name="...")`;

  return (
    <StepCard
      stepNumber="01"
      stepLabel="Use it"
      title={
        <>
          Call your <em>API</em>.
        </>
      }
      intro={
        <>
          If you're the administrator, you can{" "}
          <a href="/__/inspect">inspect this application's state</a>.
        </>
      }
    >
      <Substep title="From a React app">
        <p className="substep__body-text">
          Wrap your app with <code>RebootClientProvider</code> so your
          components can use the generated hooks:
        </p>
        <CodeBlock code={frontendSnippet} />
        <div className="actions">
          <CopyButton text={frontendSnippet} />
        </div>
      </Substep>

      <Substep title="From outside the app">
        <p className="substep__body-text">
          Use an <code>ExternalContext</code> with the generated clients. From
          Node.js:
        </p>
        <InlineCode text={externalContextTs} />
        <p className="substep__body-text">From Python:</p>
        <InlineCode text={externalContextPy} />
      </Substep>

      <Substep title="Learn more">
        <p className="substep__body-text">
          See{" "}
          <a href="https://docs.reboot.dev" target="_blank" rel="noreferrer">
            the Reboot documentation
          </a>
          .
        </p>
      </Substep>
    </StepCard>
  );
};
