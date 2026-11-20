# Solovey Frontend

The canonical editable source of one Classic + Nexus Vue/Vuetify application. Product solovey-ui embeds an independently qualified distribution; it owns component source admission, packaging and signed Product releases. Backend owns the HTTP/auth/DB contract. This repository provides no runtime server or updater authority.

Node 25.9.0 and package-lock.json are unchanged from accepted M4A. Supply a Product-admitted solovey.frontend-build-inputs/v1 projection in .component-inputs and its separately trusted SOLOVEY_UI_INPUTS_SHA256, then run:

~~~sh
node scripts/prepare-inputs.mjs
export SOLOVEY_UI_INPUTS_SHA256=$(node -p 'require("./qualification/inputs.json").manifestSHA256')
npm ci
npm run typecheck
npm run lint
npm test
npm run build
~~~

See BUILD_INPUTS.md and provenance/source-origin.json for the build contract and historical source mapping. Optional Component UI is supplied as verified build input. Panel Update is part of built-in maintenance in `src/components/settings/panelUpdate`, shared by Classic and Nexus; it is not an optional UI contribution. The retired `panel-update-ui` ID is accepted only for compatibility with historical inputs.

The extracted Git history retains original frontend authors. LICENSE and NOTICE.md retain GPL and upstream attribution. No Product release follows automatically from a Frontend source or artifact version.

Independent qualification: commit the source, then run `node scripts/qualify.mjs <fresh-output-directory>`. It copies only tracked source and admitted inputs to a private directory, excludes Go/Git from the build PATH, runs negative checks, typecheck/lint/units, and emits seven deterministic profile distributions with every-file hashes. CI compares Linux/Windows archives and qualifies the Full artifact with an explicit accepted Backend fixture. Versioned Frontend assets are Product build inputs; Product alone admits their exact pin.
