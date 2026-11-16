# PressFlow architecture

PressFlow serves a React interface and a Java API from one local origin. The Vite development server is optional; the standard launcher builds static files and lets Spring Boot serve them.

~~~mermaid
flowchart LR
    Browser["React + TypeScript"] --> Security["Spring Security: session + CSRF"]
    Security --> API["REST controllers and validation"]
    API --> Service["Studio service: pricing, stages, ledger"]
    Service --> DB[("SQLite: customers, orders, receipts, request IDs")]
~~~

## Request boundaries

The browser first loads an anonymous session and CSRF token. Successful login rotates the session identifier and token. Protected routes require authentication; POST requests also require the token. Signing out invalidates the signed-in session.

Controllers validate request records before calling the service. Unknown fields and fractional integer inputs are rejected. Service operations apply business rules and use parameterized SQL through JdbcTemplate. Error responses contain a short message without exposing a database exception.

The frontend keeps server records as an explicit snapshot. Refresh failures retain the previous snapshot and show an error rather than turning missing data into zero totals. Session expiry unmounts protected views. Mutations are never automatically replayed.

## Data and transaction boundaries

SQLite stores customers, the service catalog, orders, payments, and request fingerprints. The versioned schema is initialized or migrated when needed. Fictional customers and services are inserted without overwriting existing records.

Order creation calculates the total on the server and stores it with the specification and service name. Later catalog edits therefore preserve the original order's service label and total. Archiving a service keeps its history and blocks new quotes and orders. Catalog edits use optimistic versions, as order transitions do.

Payment creation verifies the outstanding balance inside the same database transaction that inserts the receipt and request fingerprint. A one-connection pool serializes database work within the running application; this is appropriate for a small local demo, not a high-throughput deployment design.

UUID request IDs prevent duplicated order and receipt creation. Their stored fingerprints distinguish an equivalent retry from a changed request. Status updates include the order's current version and increment it atomically, so a stale window receives a conflict.

## Production state machine

~~~mermaid
stateDiagram-v2
    [*] --> NEW
    NEW --> DESIGN
    DESIGN --> PRINTING
    PRINTING --> LAMINATION: finish selected
    PRINTING --> READY: no lamination
    LAMINATION --> READY
    READY --> DELIVERED
    NEW --> CANCELLED: no recorded payments
    DESIGN --> CANCELLED: no recorded payments
~~~

The application tracks production manually. It does not control printing equipment, run background production jobs, reconcile bank statements, or process real money.

## Source responsibilities

| Path | Responsibility |
| --- | --- |
| backend/src/main/java/com/pressflow/AuthController.java | Session, login, and logout HTTP contracts |
| backend/src/main/java/com/pressflow/SecurityConfig.java | Authentication, CSRF, headers, cookie-backed context |
| backend/src/main/java/com/pressflow/StudioController.java | Customer, quote, order, dashboard, and receipt endpoints |
| backend/src/main/java/com/pressflow/StudioService.java | Persistence, pricing, state transitions, request fingerprints |
| backend/src/main/java/com/pressflow/ApiErrors.java | Safe API error responses |
| frontend/src/api.ts | Credentialed requests, CSRF, response checking, session-expiry notifications |
| frontend/src/App.tsx | Access gate, navigation, snapshots, overview and lists |
| frontend/src/forms.tsx | Customer, order, payment, and production-detail workflows |
| frontend/src/Catalog.tsx | Catalog cards, active/archive controls, versioned service editor |
| frontend/src/ui.tsx | Drawers, keyboard focus, tables, and status components |

Runtime data and compiled output stay outside the tracked source. Original coursework materials are retained locally as reference and do not define the current API.
