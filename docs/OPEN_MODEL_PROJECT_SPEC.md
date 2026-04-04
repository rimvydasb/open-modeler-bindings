# Open Model Project Specification

Open Model project can be executed locally with Node, Deno or Bun as well as visualized in Open Modeler Editor.
Open Model project must contain:

- `package.json` file with of the box capability to execute project locally and all required declarations for Open
  Modeler Editor.
- `main.ts` file that contains all workbooks or decision service definitions.
- `types.ts` file that contains all type definitions for workbooks and decision services.
- `libraty.ts` file that contains all reusable functions (a.k.a. knowledge elements) for workbooks and decision
  services.

## package.json project declaration

**Mandatory fields for Open Modeler:**

- `name` - name of the project
- `version` - version of the project
- `description`, `author`, `license` - project metadata
- `keywords` - array of keywords that describe the project
- `exports` - artifacts to be displayed in Open Modeler Editor `Project Explorer`. The bundle might contain more files
  than those suppose to be editable.
- `files` - list of all artifacts to be includes in the runtime bundle for `OpenModelTSEngine`. Not mentioned files will
  not be included in the runtime bundle and thus not available for execution in Open Modeler Editor.

**Mandatory fields for local execution:**

- `scripts` - contains `start` script that executes the project locally with Node, Deno or Bun
- `dependencies` - (TBC, will need to have a dependency for bindings)