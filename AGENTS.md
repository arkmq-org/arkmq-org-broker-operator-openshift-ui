# AI Agent Instructions for OpenShift Console Plugin Template

This document provides context and guidelines for AI coding assistants working on this codebase.

## Project Overview

This is a **template repository** for creating OpenShift Console dynamic plugins. It's meant to be used via GitHub's "Use this template" feature, NOT forked. The template provides a minimal starting point for extending the OpenShift Console UI with custom pages and functionality.

> **⚠️ WARNING:**
> This repository is used by multiple large-scale enterprise web applications. Please proceed with caution when making any changes to this codebase. Changes here can affect downstream projects that depend on this template.
>
> **Only make changes that should be standard practice for ALL plugins created from this template.** If a change is specific to one plugin use case, it belongs in the instantiated plugin repository, not in this template.

**Key Technologies:**
- TypeScript + React 17
- PatternFly 6 (UI component library)
- Webpack 5 with Module Federation
- react-i18next for internationalization
- Cypress for e2e testing
- Helm for deployment

**Compatibility:** Requires OpenShift 4.12+ (uses ConsolePlugin CRD v1 API)

## Agent Behavior & Code Review Protocol

### **CRITICAL: Anti-Complacency Rule**

**You are ABSOLUTELY FORBIDDEN from writing that your code is 'clean', 'robust', or 'modular'.**

At the end of any code generation, you **MUST** generate a section named **🔥 ARCHITECTURAL VULNERABILITIES**.

In this section, you must act as a ruthless Tech Lead and list **at least 2 specific reasons** why the code you just generated could fail, be difficult to test, or create technical debt (e.g., tight coupling, prop-drilling, logic leaking into the view).

You must ask the human: **"Are you ready to assume this technical debt in production?"**

**Why:** Premature self-congratulation creates blind spots. Code review requires adversarial thinking. Every architectural decision carries trade-offs and risks that must be surfaced explicitly.

**How to apply:**
- After generating any component, hook, or reducer, create the **🔥 ARCHITECTURAL VULNERABILITIES** section
- List concrete failure modes (not generic concerns like "could be better tested")
- Examples:
  - "This reducer assumes brokers array is always sorted, breaks if API changes"
  - "Tight coupling to PatternFly Table replacing the table component requires touching business logic"

### **CRITICAL: Business Context Rule**

**You do not know how this component will integrate into the global application ecosystem.**

Before considering your task complete, you **MUST** ask **ONE open question** to the human about the impact of this code.

Example: *"If the UI team decides tomorrow to display this state on another page, is this reducer placed in the right location in the React tree?"*

**You must refuse to continue until the human has typed a justified response of more than 5 words.**

**Why:** You lack full business context. Architectural decisions (state location, component boundaries, abstraction levels) require human judgment about future requirements and team conventions.

**How to apply:**
- After code generation, pose one specific question about:
  - **State placement:** "Should this state live higher in the component tree?"
  - **Reusability:** "Will this logic need to be shared across multiple features?"
  - **Integration:** "How does this fit with the existing broker management flow?"
- Wait for a substantive response (minimum 5 words) before marking the task complete

## Architecture & Patterns

### Dynamic Plugin System

This plugin uses webpack module federation to load at runtime into the OpenShift Console. Key files:

- `console-extensions.json`: Declares what the plugin adds to console (routes, nav items, etc.)
- `package.json` `consolePlugin` section: Plugin metadata and exposed modules mapping
- `webpack.config.ts`: Configures module federation and build

**Critical:** Any component referenced in `console-extensions.json` must have a corresponding entry in `package.json` under `consolePlugin.exposedModules`.

### Component Structure

- Use functional components with hooks (NO class components)
- All components should be TypeScript (`.tsx`)
- Follow PatternFly component patterns
- Use PatternFly CSS variables instead of hex colors (dark mode compatibility)

### State Management

#### **CRITICAL: Anemic Reducer Rule**

**When implementing `useReducer`, the reducer MUST contain business logic.**

**NEVER** write a reducer that only exposes basic setters. View components (React) **MUST NOT** manipulate or construct complex lists; they should dispatch descriptive actions (e.g., `{ type: 'ADD_BROKER_PROPERTY', payload: data }`) and the reducer handles the transformation.

**Why:** Reducers are the single source of truth for state transitions. Putting business logic in components creates scattered, untestable state management.

**How to apply:**
- ❌ BAD: `dispatch({ type: 'SET_BROKERS', payload: [...brokers, newBroker] })` (component builds the list)
- ✅ GOOD: `dispatch({ type: 'ADD_BROKER', payload: newBroker })` (reducer handles the list logic)

#### **CRITICAL: useEffect Restriction**

**NEVER use `useEffect` for synchronizing React state or computing derived values.**

`useEffect` is **ONLY** permitted for side effects that interact with systems outside of React: API calls, WebSocket connections, DOM manipulation, timers, subscriptions, or browser APIs.

**Why:** `useEffect` for state synchronization creates race conditions, unnecessary re-renders, and hard-to-debug timing issues. Derived state should be computed during render; state synchronization belongs in event handlers or reducers.

**How to apply:**
- ❌ BAD: `useEffect(() => { setFilteredList(list.filter(...)) }, [list])` (derive during render instead)
- ❌ BAD: `useEffect(() => { if (isOpen) { setActiveTab(0) } }, [isOpen])` (synchronize in event handler)
- ✅ GOOD: `useEffect(() => { fetch('/api/brokers').then(...) }, [])` (external API call)
- ✅ GOOD: `useEffect(() => { const ws = new WebSocket(...); return () => ws.close() }, [])` (external subscription)
- ✅ GOOD: `const filteredList = useMemo(() => list.filter(...), [list])` (derived state)

### Styling Constraints

**IMPORTANT:** The `.stylelintrc.yaml` enforces strict rules to prevent breaking console:

- **NO hex colors** - use PatternFly CSS variables (e.g., `var(--pf-v6-global-palette--blue-500)`)
- **NO naked element selectors** (like `table`, `div`) - prevents overwriting console styles
- **NO `.pf-` or `.co-` prefixed classes** - these are reserved for PatternFly and console
- **Prefix all custom classes** with plugin name (e.g., `plugin__arkmq-org-broker-operator-openshift-ui`)

Don't disable these rules without understanding they protect against layout breakage!

## Internationalization (i18n)

**Namespace Convention:** `plugin__<plugin-name>` (e.g., `plugin__arkmq-org-broker-operator-openshift-ui`)

### In React Components:
```tsx
const { t } = useTranslation('plugin__arkmq-org-broker-operator-openshift-ui');
return <h1>{t('Hello, World!')}</h1>;
```

### In console-extensions.json:
```json
"name": "%plugin__arkmq-org-broker-operator-openshift-ui~My Label%"
```

**After adding/changing messages:** Run `yarn i18n` to update locale files in `/locales`

## File Organization

```
src/
  components/          # React components
    ExamplePage.tsx   # Example page component
    *.css            # Component styles (scoped with plugin prefix)
console-extensions.json # Plugin extension declarations
package.json           # Plugin metadata in consolePlugin section
tsconfig.json          # TypeScript config (strict: true)
webpack.config.ts      # Module federation + build config
locales/               # i18n translation files
charts/                # Helm chart for deployment
integration-tests/     # Cypress e2e tests
```

### **CRITICAL: No Utils Folders**

**NEVER create `utils/`, `helpers/`, or `common/` folders.**

These become dumping grounds for poorly organized code. Every function should live in a semantically meaningful location based on its domain purpose.

**Why:** "Utils" folders destroy discoverability, encourage tight coupling, and hide architectural decisions. A function's location should communicate its purpose and scope.

**How to apply:**
- ❌ BAD: `src/utils/formatBrokerName.ts` (generic location)
- ✅ GOOD: `src/components/BrokerList/formatBrokerName.ts` (co-located with usage)
- ❌ BAD: `src/helpers/validation.ts` (vague categorization)
- ✅ GOOD: `src/components/BrokerForm/validation.ts` (domain-specific location)
- If a function is truly shared across domains: create a specific folder like `src/formatting/`, `src/validation/`, or `src/api-client/` that describes the **what**, not the **how generic it is**

## Development Workflow

### Local Development
1. `yarn install` - install dependencies
2. `yarn start` - starts webpack dev server on port 9001 with CORS
3. `yarn start-console` - runs OpenShift console in container (requires cluster login)
4. Navigate to http://localhost:9000/example

### Code Quality
- `yarn lint` - runs eslint, prettier, and stylelint (with --fix)
- Linting is mandatory before commits
- Follow existing code patterns in the repo

### Testing
- `yarn test-cypress` - opens Cypress UI
- `yarn test-cypress-headless` - runs Cypress in CI mode
- Add e2e tests for new pages/features

## TypeScript Configuration

Current config has `strict: true` and enforces:
- `noUnusedLocals: true`
- All files should use `.tsx` extension
- Target: ES2020

**Modernization opportunity:** When touching files, consider refining strictness options if needed.

## Common Development Tasks

### Adding a New Page
1. Create component in `src/components/MyPage.tsx`
2. Add to `package.json` `exposedModules`: `"MyPage": "./components/MyPage"`
3. Add route in `console-extensions.json`:
   ```json
   {
     "type": "console.page/route",
     "properties": {
       "path": "/my-page",
       "component": { "$codeRef": "MyPage" }
     }
   }
   ```
4. Optional: Add nav item in `console-extensions.json`
5. Run `yarn i18n` if you added translatable strings

### Adding a Navigation Item
```json
{
  "type": "console.navigation/href",
  "properties": {
    "id": "my-nav-item",
    "name": "%plugin__plugin__arkmq-org-broker-operator-openshift-ui~My Page%",
    "href": "/my-page",
    "perspective": "admin",
    "section": "home"
  }
}
```

### Updating Plugin Name
When instantiating from template, update:
1. `package.json` - `name` and `consolePlugin.name`
2. `package.json` - `consolePlugin.displayName` and `description`
3. All i18n namespace references (`plugin__<name>`)
4. CSS class prefixes
5. Helm chart values

## Build & Deployment

### Building Image
```bash
docker build -t quay.io/my-repository/my-plugin:latest .
# For Apple Silicon: add --platform=linux/amd64
```

### Deploying via Helm
```bash
helm upgrade -i my-plugin charts/openshift-console-plugin \
  -n my-namespace \
  --create-namespace \
  --set plugin.image=my-plugin-image-location
```

**Note:** OpenShift 4.10 requires `--set plugin.securityContext.enabled=false`

## Important Constraints & Gotchas

1. **Template, not fork:** Users should use "Use this template", not fork
2. **i18n namespace must match ConsolePlugin resource name** with `plugin__` prefix
3. **CSS class prefixes prevent style conflicts** - always prefix with plugin name
4. **Module federation requires exact module mapping** - `exposedModules` must match `$codeRef` values
5. **PatternFly CSS variables only** - hex colors break dark mode
6. **No webpack HMR for extensions** - changes to `console-extensions.json` require restart
7. **TypeScript strict mode enabled** - keep types clean to avoid regressions
8. **React 17, not 18** - matches console's React version

## Extension Points

See [Console Plugin SDK README](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk) for available extension types:

- `console.page/route` - add new pages
- `console.navigation/href` - add nav items
- `console.navigation/section` - add nav sections
- `console.tab` - add tabs to resource pages
- `console.action/provider` - add actions to resources
- `console.flag` - feature flags
- Many more...

## Code Style Preferences

- Functional components with hooks (NO classes)
- TypeScript for all new files
- Use PatternFly components whenever possible
- Keep components focused and composable
- Prefer named exports for components
- Use `React.FC` or explicit return types
- CSS-in-files (not CSS-in-JS)

### **CRITICAL: JSDoc Documentation**

**Every component, hook, and function MUST have up-to-date JSDoc documentation.**

Documentation must explain the **WHY** and **WHAT**, never the **HOW**. The code itself shows how it works; documentation must justify its existence and describe its purpose.

**Why:** Documentation is the contract between the code's intent and its implementation. Without it, future developers (including you) must reverse-engineer purpose from implementation, leading to misuse and fragile refactoring.

**How to apply:**
```tsx
❌ BAD:
// Filters the list
function filterBrokers(brokers: Broker[]) {
  return brokers.filter(b => b.enabled);
}

✅ GOOD:
/**
 * Returns only enabled brokers for display in the active brokers table.
 * Disabled brokers are hidden from users but remain in the backing CRD.
 * 
 * @param brokers - Full broker list from the BrokerCluster CRD status
 * @returns Subset of brokers where enabled=true
 */
function filterBrokers(brokers: Broker[]): Broker[] {
  return brokers.filter(b => b.enabled);
}

❌ BAD:
// Hook for managing broker state
function useBrokerState() { ... }

✅ GOOD:
/**
 * Manages local broker form state before submission to the API.
 * Handles validation, dirty tracking, and reset logic.
 * Does NOT persist to cluster until form submission.
 */
function useBrokerState() { ... }
```

**Required elements:**
- One-sentence summary of purpose (the "what")
- Context about why this exists (business logic, architectural decision, constraint)
- `@param` for each parameter (what it represents, not its type—TypeScript handles that)
- `@returns` for return values (what it represents semantically)
- Document constraints, invariants, or gotchas ("X must be called before Y", "Assumes brokers array is sorted")

## Testing Strategy

### **CRITICAL TESTING RULES - MANDATORY FOR ALL AGENTS**

#### 1. Test Boundary Rule (Jest vs Playwright Heuristic)

**NEVER use Playwright for testing React component state logic or isolated component behavior.**

If you need to mock a function, state, or local API, you **MUST** write a unit test with Jest. Playwright is **STRICTLY reserved for E2E tests on a real cluster, with NO mocks**.

**Why:** Playwright tests are expensive, slow, and require full cluster infrastructure. State logic belongs in fast, isolated unit tests.

**How to apply:** 
- Testing a reducer? → Jest
- Testing a custom hook's state transitions? → Jest
- Testing a component's rendering with mocked APIs? → Jest
- Testing full user flow on deployed cluster? → Playwright

#### 2. E2E Bypass Guardrail

**If you generate a Playwright test with an early exit condition based on CI environment, you MUST add a block comment in ALL CAPS requiring manual confirmation.**

**Why:** Environment-conditional test skips can hide real failures. Developers must explicitly verify the test runs successfully in local environments.

**How to apply:**
```typescript
// ⚠️ WARNING: THIS TEST INCLUDES A CI ENVIRONMENT CHECK.
// DEVELOPER MUST MANUALLY CONFIRM THIS TEST HAS BEEN RUN LOCALLY
// BEFORE MERGING. DO NOT RELY ON CI-ONLY EXECUTION.
if (process.env.CI === 'true') {
  test.skip();
}
```

### General Testing Guidelines

- **E2E tests (Playwright/Cypress):** For user flows and page rendering on real clusters
- **Unit tests (Jest/Vitest):** For component logic, hooks, reducers, and utility functions
- **Test data attributes:** Use `data-test` attributes for selectors
- Run tests locally before opening PRs
- Never mock in E2E tests - use real cluster resources

## References

- [Console Plugin SDK](https://github.com/openshift/console/tree/master/frontend/packages/console-dynamic-plugin-sdk)
- [PatternFly React](https://www.patternfly.org/get-started/develop)
- [Dynamic Plugin Enhancement Proposal](https://github.com/openshift/enhancements/blob/master/enhancements/console/dynamic-plugins.md)

## Quick Decision Guide

**When should I...**

- **Use this template?** When creating a NEW OpenShift Console plugin from scratch
- **Add a page?** Update console-extensions.json + exposedModules + create component
- **Style something?** Use PatternFly components and CSS variables, prefix custom classes
- **Add translations?** Use `t()` function, run `yarn i18n` after
- **Test changes?** Run locally with `yarn start` + `yarn start-console`, add Cypress tests
- **Deploy?** Build image, push to registry, install via Helm chart
