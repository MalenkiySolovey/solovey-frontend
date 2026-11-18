# Solovey Frontend

The canonical editable source of one Classic + Nexus Vue/Vuetify application. Product solovey-ui embeds an independently qualified distribution; it owns component source admission, packaging and signed Product releases. Backend v0.1.1 owns the HTTP/auth/DB contract. This repository provides no runtime server or updater authority.

Node 25.9.0 and package-lock.json are unchanged from accepted M4A. Supply a Product-admitted solovey.frontend-build-inputs/v1 projection in .component-inputs and its separately trusted SOLOVEY_UI_INPUTS_SHA256, then run:

~~~sh
node scripts/prepare-inputs.mjs
export SOLOVEY_UI_INPUTS_SHA256=e5d37046dbae72dd57a4a547fcfe199a13fcaf2f50027ee2fd8a2d96cabc2c6a
npm ci
npm run typecheck
npm run lint
npm test
npm run build
~~~

See BUILD_INPUTS.md and provenance/source-origin.json for the accepted origin and exact file mapping. Component sources remain their existing owners and are generated verified build inputs. Panel Update UI presentation is maintained here at components/panel-update-ui/frontend, preserving ComponentID panel-update-ui and settings:maintenance. Product retains its compatibility manifest and the canonical lifecycle/signed-update owners.

The extracted Git history retains original frontend authors. LICENSE and NOTICE.md retain GPL and upstream attribution. No Product release follows automatically from a Frontend source or artifact version.

Independent qualification: commit the source, then run `node scripts/qualify.mjs <fresh-output-directory>`. It copies only tracked source and admitted inputs to a private directory, excludes Go/Git from the build PATH, runs negative checks, typecheck/lint/units, and emits seven deterministic profile distributions with every-file hashes. CI compares Linux/Windows archives and qualifies the Full artifact with an explicit accepted Backend fixture. Versioned Frontend assets are Product build inputs; Product alone admits their exact pin.
