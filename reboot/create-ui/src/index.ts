import { discover } from "./discover.js";
import { scaffold } from "./scaffold.js";

function main() {
  const cwd = process.cwd();
  const result = discover(cwd);

  if (!result) {
    console.log(
      "No _rbt_ui.json manifests found.\n\n" +
        "Run `rbt generate` first to generate " +
        "React bindings and UI manifests."
    );
    process.exit(1);
  }

  const { projectRoot, reactDir, allUis, unimplemented } = result;

  if (unimplemented.length === 0) {
    console.log("All UIs are already scaffolded. Good job! \u{1F44D}");
    process.exit(0);
  }

  console.log(
    `Your API contains ${allUis.length} 'UI' methods, ` +
      `${unimplemented.length} of these don't have a ` +
      `frontend implementation yet. This tool will ` +
      `scaffold those frontend implementations.\n`
  );

  const scaffolded = scaffold(projectRoot, reactDir, allUis, unimplemented);

  if (scaffolded.createdShared.length > 0) {
    console.log("Created shared files:");
    for (const f of scaffolded.createdShared) {
      console.log(`  ${f}`);
    }
    console.log();
  }

  if (scaffolded.createdUis.length > 0) {
    console.log("Scaffolded UIs:");
    for (const f of scaffolded.createdUis) {
      console.log(`  ${f}`);
    }
  }

  if (scaffolded.skipped.length > 0) {
    const root = scaffolded.webRootDir;
    console.log(
      `\nWarning: ${scaffolded.skipped.length} UI(s) ` +
        `skipped (path not under ${root}/):`
    );
    for (const ui of scaffolded.skipped) {
      console.log(`  ${ui.path} (${ui.name})`);
    }
    console.log(
      `  UIs must use path="${root}/ui/<name>" ` +
        `to share the vite dev server.`
    );
  }

  console.log(
    `\nNext steps:\n` +
      `  cd ${scaffolded.webRootDir} && npm install\n` +
      `  rbt generate  ` +
      `# React bindings need node_modules`
  );
}

main();
