# PressFlow

A full-stack workspace for an offset-printing studio. Create customers, calculate print quotes, move orders through production, and track fictional payment receipts in one responsive interface.

**Java 17 · Spring Boot · Spring Security · React · TypeScript · Vite · SQLite**

[Walkthrough](docs/WALKTHROUGH.md) · [Architecture](docs/ARCHITECTURE.md) · [API guide](backend/README.md)

## What works

- **Production overview:** active jobs, ready orders, recorded receipts, outstanding balances, a stage breakdown, and a quick-start checklist linked to the existing customer, catalog, and order workflows.
- **Customer directory:** search fictional customers and add contact details with duplicate-email protection.
- **Print catalog:** add or edit print services, adjust standard unit prices, and archive unavailable services without deleting order history.
- **Server-calculated quotes:** choose a print service, quantity, paper stock, and optional lamination before saving an order.
- **Order management:** search and filter jobs, inspect specifications, and advance through validated production stages.
- **Payment ledger:** record fictional cash, bank-transfer, or other receipts against an order without exceeding its balance.
- **Persistent data:** customers, orders, request IDs, and payment records survive restarts in a local SQLite file.
- **Protected changes:** cookie sessions, CSRF tokens, input validation, optimistic order versions, and idempotent order/payment requests.
- **Accessible interface:** bundled Inter typography, keyboard controls, focus-managed drawers, visible loading/error states, responsive catalog cards, and reduced-motion support.

The payment screens are **demo bookkeeping only**. PressFlow does not process payments, connect to a bank, or move money.

## Run locally

Install **JDK 17 or 21**, **Maven 3.9+**, and **Node.js 24+**. Run commands from the project root unless stated otherwise.

### Windows launcher

Double-click **[launcher/Start PressFlow.cmd](launcher/Start%20PressFlow.cmd)**. The first run builds React and Java, starts the backend, and opens the application. Later runs reuse unchanged build output. The backend serves the built frontend and API together, so a separate frontend server is unnecessary.

The default address is [http://127.0.0.1:8089](http://127.0.0.1:8089). If the port is occupied, the launcher selects an available port and prints the actual URL. It can reuse a running PressFlow instance. Keep its terminal open while using the app; Ctrl+C stops the launched server.

Run `launcher/start-local.ps1 -Rebuild` after stopping the server to force a fresh build. Normal starts reuse the dependency installation, the production frontend, and the extracted Java runtime when their inputs are unchanged.

| Local demo username | Local demo password |
| --- | --- |
| operator | DemoPass123! |

Use **Use demo account** on the sign-in page to refill the sample credentials. Accounts are configured for this installation; there is no public registration or password recovery flow.

### Manual startup

Build the frontend:

~~~sh
cd frontend
npm ci
npm run build
cd ../backend
mvn verify
java -jar target/pressflow-1.0.0.jar
~~~

Open port 8089. Start Java from the backend directory so its default database and static-asset paths resolve correctly. Stop it with Ctrl+C.

### React development

Start Java as above. In a second terminal:

~~~sh
cd frontend
npm run dev
~~~

Vite serves the development UI on port 5173 and proxies API requests to port 8089. If you change the backend port, update the local proxy target in frontend/vite.config.ts. Production uses the same-origin built interface.

## Try a complete workflow

1. Sign in and review the empty production queue and fictional starter customers.
2. Open **Customers**, add an invented contact, then search for it.
3. Open **Catalog**, inspect the service prices, and choose **Create order** on an active service. Select the customer, enter a title and quantity, and inspect the server's estimate.
4. Save the order, open its details, and advance from **New** to **Design**, **Printing**, and **Ready**. A laminated order passes through **Lamination** first.
5. Record a small fictional receipt, inspect the remaining balance, and mark the order **Delivered** when appropriate.
6. Restart the application and sign in again to verify that saved records remain.

The [screenshot walkthrough](docs/WALKTHROUGH.md) explains each step and its expected result.

## Pricing and production rules

Prices use integer **paisa** in the API: 1500 means PKR 15.00. The database stores the order total when it is created. Clients cannot submit an arbitrary total.

Standard stock uses the service's base unit price. Premium stock adds 20%, rounded up to a paisa. Lamination adds PKR 20.00 per unit. Multiply the final unit price by the requested quantity. Quantities are whole numbers from 1 to 10,000, with an overall demo amount limit enforced by the server.

~~~text
New → Design → Printing → [Lamination] → Ready → Delivered
~~~

Lamination is included only when selected on the order. Cancellation is available in New or Design and is rejected once a payment has been recorded. Refunds and reversal accounting are outside this demonstration.

Order transitions include a version number. Stale updates return a conflict rather than overwriting a newer change. Creating an order or receipt uses a UUID request ID; repeating the same request returns its original result, while reusing the ID for different data returns a conflict. The browser never automatically replays a write after a timeout.

Catalog edits also carry a version number. Archiving a service prevents new quotes and orders for it; existing orders retain their stored service name and total.

## Configuration and storage

| Variable | Default | Purpose |
| --- | --- | --- |
| PRESSFLOW_PORT | 8089 | Backend HTTP port |
| PRESSFLOW_HOST | 127.0.0.1 | Local interface binding |
| PRESSFLOW_DATABASE | ./data/pressflow.sqlite | SQLite file, relative to backend process directory |
| PRESSFLOW_FRONTEND | ../frontend/dist | Built interface directory |
| PRESSFLOW_USERNAME | operator | Configured workspace account |
| PRESSFLOW_PASSWORD | DemoPass123! | Demo password; replace for shared installations |
| PRESSFLOW_SECURE_COOKIE | false | Enable only when served over HTTPS |

The launcher sets absolute frontend and database paths for the standard local layout. To choose a custom database path, start Java manually with the corresponding environment variable. The example environment file documents keys; it is not automatically loaded.

Runtime data is kept under ignored backend/data/. Back up SQLite through its backup API, or stop the application before copying its database and any WAL companion. Do not delete the data directory to troubleshoot a startup error. No runtime database, password file, or local archive belongs in a public commit.

## Project structure

~~~text
Project/
├── backend/       Spring Boot API, services, security, SQLite access, integration tests
├── frontend/      React + TypeScript UI, Vite configuration, frontend tests
├── launcher/      Windows CMD entry point and PowerShell startup helper
├── docs/          Architecture, walkthrough, local design materials
├── .env.example   Optional environment-variable reference
└── README.md
~~~

Original HTML mockups, their ZIP, and the diagram backup were moved to the sibling **SEP Legacy Archive** folder locally. The original reports and diagrams remain under docs/design for reference. They are separate from the current implementation and should be reviewed before any public distribution.

## Verification

~~~sh
mvn -f backend/pom.xml verify
npm ci --prefix frontend
npm run typecheck --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
~~~

Backend integration tests exercise authenticated HTTP requests, CSRF denial, exact pricing, invalid-input rollback, request-ID reuse, production transitions, stale versions, bounded payments, concurrent payment attempts, and actual SQLite persistence across an application restart. Frontend tests cover access gating, session expiry, connection recovery, CSRF forwarding, guarded writes, invalid quantities, and overpayments. Tests use isolated temporary data.

## Security and demo scope

This is an educational portfolio application for localhost with fictional records. A public repository makes the source available; application records still require a signed-in session. The default account is deliberately published for the local demo.

Before hosting a shared service, configure a unique password, HTTPS and secure cookies, rate limiting, account administration, backups, monitoring, and an explicit data-retention policy. The current application has one configured operator account and no role hierarchy, account-management UI, audited payment gateway, refund flow, or production deployment claim.

The source uses local assets, bundled icons, and a self-hosted Inter variable font. No external font CDN is required. Font and icon notices are included under [frontend/public/licenses](frontend/public/licenses). React escapes displayed text, and database values are bound parameters. Passing automated checks complements review and does not establish that a deployment is secure.
