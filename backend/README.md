# PressFlow API

Java 17, Spring Boot, Spring Security, JdbcTemplate, and SQLite. The default server is http://127.0.0.1:8089. Run Java from this backend directory so data/pressflow.sqlite and ../frontend/dist resolve as expected.

~~~sh
mvn verify
java -jar target/pressflow-1.0.0.jar
~~~

Build the React frontend first using the root README if you want the backend to serve the complete application.

## Authentication

GET /api/session is public and returns authenticated, csrfToken, and user. The user is null when signed out. Send the session cookie on subsequent requests, and send its csrfToken in **X-CSRF-TOKEN** on every POST, including login and logout.

POST /api/login accepts username and password. The local fictional account is operator / DemoPass123!. Successful login changes the session identifier and returns a new token. POST /api/logout invalidates the signed-in session and returns an anonymous session with a fresh token.

Configure PRESSFLOW_USERNAME and PRESSFLOW_PASSWORD to replace the local account. The current implementation supports one configured operator, not public signup or role administration. Session cookies are HttpOnly and SameSite=Lax; secure-cookie mode is configurable for HTTPS.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | /api/health | Public liveness and application marker |
| GET | /api/session | Public authentication state and CSRF token |
| POST | /api/login | Sign in |
| POST | /api/logout | Sign out |
| GET | /api/dashboard | Counts, balances, recent jobs, and stage totals |
| GET | /api/customers | Customer directory |
| POST | /api/customers | Create customer |
| GET | /api/services | Available print services and base unit prices |
| POST | /api/services | Create a catalog service |
| PUT | /api/services/{id} | Edit or archive a service with its latest version |
| POST | /api/quote | Calculate a quote without creating an order |
| GET | /api/orders | Orders, newest first |
| GET | /api/orders/{id} | One order and its current balance |
| POST | /api/orders | Create an order using a UUID request ID |
| POST | /api/orders/{id}/transition | Advance or cancel with an optimistic version |
| GET | /api/payments | Fictional receipts, newest first |
| POST | /api/orders/{id}/payments | Record a bounded fictional receipt using a UUID |

All business-record routes require authentication. CSRF protection applies to POST /api/quote even though quoting does not save data.

The catalog list includes active and archived services. A service includes id, name, description, unitPriceCents, active, and version. Only active services may be quoted or used in new orders.

Catalog creation accepts name, description, unitPriceCents, and active. A PUT edit accepts those fields and the current version. Names are 1–80 characters, descriptions 1–300 characters, and unitPriceCents is 1–5,000,000. Setting active to false archives the service; no delete endpoint removes its order history. Stale catalog versions return 409.

## Request examples

Create a customer:

~~~json
{"name":"Jamie Park","email":"jamie@example.com","phone":"+00 000 0004","company":"Example Studio"}
~~~

Get a quote:

~~~json
{"serviceId":1,"quantity":100,"paper":"PLAIN","lamination":false}
~~~

The response contains unitPriceCents and totalCents. Amount fields are integer paisa. This example returns 1500 and 150000, equivalent to PKR 15.00 per card and PKR 1,500.00 total.

Create an order using the same specification, a valid customer, a current or future due date within two years, and a new UUID:

~~~json
{"customerId":1,"title":"Fictional launch cards","serviceId":1,"quantity":100,"paper":"PLAIN","lamination":false,"dueDate":"2026-12-01","requestId":"087c090d-cfcb-4091-82fd-452402350e65"}
~~~

Replace the example date and request ID for a new order. The server calculates totalCents; a client-supplied total is rejected as an unsupported field.

An order includes id, reference, customerId, customerName, title, serviceId, serviceName, quantity, paper, lamination, dueDate, status, totalCents, paidCents, balanceCents, createdAt, and version.

Advance a new order:

~~~json
{"status":"DESIGN","version":0}
~~~

Record a fictional PKR 500.00 receipt:

~~~json
{"amountCents":50000,"method":"CASH","reference":"SAMPLE-001","requestId":"7e3979f3-9701-48b4-af4c-8b747e7dbb14"}
~~~

Allowed payment methods are CASH, BANK, and OTHER. They are labels in a local ledger, not payment integrations.

## Rules and failures

- Customer name, email, and phone are required. Emails are unique without case sensitivity.
- Paper is PLAIN or PREMIUM; lamination is boolean. Quantity is 1–10,000.
- Premium paper adds 20% to the base price, rounded up to a paisa. Lamination then adds 2000 paisa per unit.
- Orders progress NEW → DESIGN → PRINTING → optional LAMINATION → READY → DELIVERED.
- CANCELLED is allowed from NEW or DESIGN only, and only without recorded payments.
- Receipts must be positive whole-number paisa and cannot exceed the order's remaining balance.
- Archived catalog services cannot be quoted or selected for new orders. Existing order service names and totals are retained when the catalog changes.
- Reusing a UUID with the same creation payload returns its original result. Different data with that UUID returns 409.
- Transitions require the latest version; stale versions return 409.

Errors return a JSON message. Invalid data returns 400, unauthenticated access 401, invalid CSRF 403, unknown records 404, conflicts 409, and database unavailability 503. SQL exceptions are not returned to the browser.

## Persistence and verification

The application stores data in SQLite, with foreign keys enabled, WAL mode, and a one-connection pool. Customer/order/payment creation and request fingerprints are transactional. No startup reset removes user records.

Run **mvn verify** for integration coverage of authentication, CSRF, pricing, invalid requests, idempotency, state transitions, stale versions, overpayments, concurrent receipts, and a real application restart using the same SQLite database. Tests use temporary databases.

This local demonstration has no refund subsystem, bank integration, multi-tenant isolation, or production deployment claim. See the root README for configuration, backup guidance, and security limits.
