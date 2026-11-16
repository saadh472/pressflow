# PressFlow frontend

React, TypeScript, and Vite provide a responsive interface for the Java API. Lucide icons and the Inter variable font are bundled locally, so interface rendering does not depend on a font or icon CDN. Font and icon license notices are included in public/licenses and copied into the production build.

## Commands

Use Node.js 24 or newer from this directory.

~~~sh
npm ci
npm run typecheck
npm test
npm run build
~~~

The standard launcher builds this directory and lets Spring Boot serve dist/ on the same origin as the API. For development, npm run dev starts Vite on port 5173 with /api proxied to http://127.0.0.1:8089.

## Screens and state

- **Overview:** server counts, revenue and balances, production stages, recent orders.
- **Orders:** search and stage filters, server-calculated quotes, specifications, versioned transitions.
- **Catalog:** active/archive service cards, standard prices, create-order preselection, validated service editing.
- **Customers:** searchable directory and a customer creation form.
- **Payments:** fictional receipts, order balances, positive amount and overpayment checks.

The access gate checks the server session before fetching business records. Cookie credentials accompany API calls; writes carry the current CSRF token. Session expiry removes protected records from the rendered interface. A failed refresh retains the last confirmed snapshot and displays an error.

Forms disable duplicate submissions while a write is pending. Order and payment forms preserve a request UUID for unchanged retries while the form remains open. The request helper never automatically replays a mutation. Malformed success responses are reported as uncertain results rather than treated as saved data.

## Accessibility and motion

Forms use visible labels and inline status messages. Drawers expose dialog semantics, trap keyboard focus, restore the previous focus on close, and resist closure during a pending write. Visible focus styles, responsive tables, readable contrast, and reduced-motion preferences support keyboard and small-screen use.

## Tests

Vitest and Testing Library exercise authentication gating, session expiry, recoverable connection failures, CSRF forwarding, non-replayed writes, malformed responses, form validation, duplicate-submit prevention, bounded payments, and catalog active/archive behavior. These tests complement the backend's real HTTP and SQLite integration tests; they do not replace browser layout checks.
