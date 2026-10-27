# PayPal Autopilot

**AI-assisted revenue recovery with PayPal, human approval, and controlled execution.**

PayPal Autopilot helps small businesses identify overdue invoices, understand potential recovery opportunities, and take approved action through PayPal. It combines AI-generated recommendations with business-level authorization, server-side eligibility checks, execution tracking, and webhook-based reconciliation.

The goal is to reduce manual invoice follow-up while keeping business owners in control of financial actions.

> **Status:** Hackathon MVP / prototype. PayPal Sandbox is intended for demonstrations and testing. Do not use this project for live financial operations without a separate production-readiness and security review.

## Table of contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Running the application](#running-the-application)
- [Testing](#testing)
- [Local webhook setup](#local-webhook-setup)
- [Testing with Postman](#testing-with-postman)
- [API endpoints](#api-endpoints)
- [Important disclaimers](#important-disclaimers)
- [Security and financial safeguards](#security-and-financial-safeguards)
- [AI provider configuration](#ai-provider-configuration)
- [Project structure](#project-structure)
- [Current scope and limitations](#current-scope-and-limitations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## The problem

Small businesses often spend considerable time identifying unpaid invoices, calculating outstanding balances, deciding which customers to follow up with, sending payment requests, and checking whether those requests have resulted in payment.

PayPal provides payment infrastructure, but businesses still need to coordinate many of these operational tasks.

PayPal Autopilot brings these steps into a controlled workflow: analyze overdue revenue, recommend an action, obtain authorization, execute the supported PayPal workflow, and track the result.

## How it works

1. **Analyze revenue:** The application evaluates overdue invoices and calculates outstanding balances.
2. **Identify opportunities:** The AI provider generates recovery recommendations, explanations, and estimated recovery amounts.
3. **Review and approve:** An authorized business owner or administrator reviews the proposed action.
4. **Check eligibility:** The backend revalidates the approval, invoice, business access, and execution conditions.
5. **Execute the approved action:** The backend initiates the supported PayPal payment-request workflow.
6. **Track and reconcile:** Execution records and PayPal webhooks help the application maintain an accurate view of the workflow's state.

AI recommendations are advisory. The backend remains responsible for authorization and execution decisions.

## Features

- User registration and login.
- Business membership and business-scoped access.
- AI-assisted revenue analysis with run history.
- Overdue invoice and recovery opportunity tracking.
- Outstanding-balance calculations that account for recorded partial payments.
- Approval and rejection workflows.
- Server-side execution eligibility checks.
- Protected PayPal order and payment-request workflows.
- Persisted execution state and reconciliation endpoints.
- PayPal webhook signature verification and duplicate-event handling.
- Configurable AI provider integration.

## Technology stack

| Component | Technology |
|---|---|
| Backend API | NodeJS 24+, NestJS 11, TypeScript |
| Database | PostgreSQL |
| ORM and migrations | Prisma 7 |
| Frontend | Next.js 16, React 19 |
| Styling | Tailwind CSS 4 |
| Payments | PayPal REST APIs and Sandbox |
| AI | Configurable provider: Ollama or OpenAI |
| API testing | Postman |

## Architecture

The application is organized into a frontend, backend API, database, and external provider integrations.

- **Frontend (`/apps/web`):** Authentication, dashboard, revenue opportunities, and approval workflows.
- **Backend (`/apps/api`):** Business authorization, revenue analysis, approval management, execution eligibility, PayPal integration, and webhook processing.
- **PostgreSQL:** Users, business memberships, invoices, analysis runs, opportunities, approvals, and execution-related records.
- **AI provider:** Generates revenue-recovery analysis and recommendations.
- **PayPal:** Supports payment-related workflows and provider-state reconciliation.

Financial actions are executed through the backend rather than trusting client-side eligibility checks or AI recommendations.

## Prerequisites

Install or configure the following before starting:

- Node.js and npm versions compatible with the project.
- PostgreSQL.
- Git.
- PayPal Developer Sandbox credentials.
- An AI provider: [Ollama](https://ollama.com/) (defaulting to `qwen3:8b` / `gpt-oss:20b`) with a locally available model, or an OpenAI API key if using the OpenAI provider.
- [ngrok](https://ngrok.com/) (for local PayPal webhook testing) or live url
- Postman for API testing.

The repository contains separate backend and frontend applications under `apps/`.

---

## Getting Started

### 1. Clone & Install

Clone the repository, then install dependencies for both apps separately (there is no root `package.json`):

```bash
# Clone repo
git clone https://github.com/Abdulazeez-ojulari/paypal-autopilot.git
cd paypal-autopilot

# Install API dependencies
cd apps/api && npm install

# Install Web dependencies (in a separate terminal)
cd ../web && npm install

```

### 2. Configure external services

Before starting the application, confirm that:

- PostgreSQL is running and the database is reachable.
- PayPal Sandbox credentials are configured.
- The chosen AI provider and model are available.
- Backend and frontend URLs match your local ports and CORS configuration.

---

## Environment Variables

Create a `.env` file inside `apps/api/` based on your local setup:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/paypal_autopilot"
FRONTEND_URL=http://localhost:3001

# PayPal Sandbox
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_API_BASE_URL=https://api-m.sandbox.paypal.com
PAYPAL_WEBHOOK_ID=your_webhook_id

# AI Provider (Ollama)
AI_PROVIDER=ollama
AI_MODEL=gpt-oss:20b
OLLAMA_BASE_URL=http://localhost:11434

# Security
JWT_SECRET=super-secret-jwt-key
JWT_EXPIRES_IN=15m

# Business Config
PAYPAL_INVOICER_NAME="Your Business Name"
PAYPAL_INVOICER_EMAIL="business@example.com"
TARGET_BUSINESS_ID=
OWNER_EMAIL=

```

Create a `.env.local` file inside `apps/web/` based on your local setup:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_PAYPAL_CLIENT_ID=your_sandbox_client_id
```

## Database Setup & Seeding

Run your Prisma migrations, then seed test data (⚠️ *Note: The seed script clears existing tables, use only on a dev database*):

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
npm run prisma-seed

```

To link your registered account to the seeded demo business (`Acme Digital Services`), update `TARGET_BUSINESS_ID` and `OWNER_EMAIL` in your `.env`, then run your project's owner-setup script.

## Running The Application

Run the API and frontend concurrently in separate terminals:

**Terminal 1 (API - Port 3000):**

```bash
cd apps/api
npm run start:dev

```

**Terminal 2 (Web - Port 3001):**

```bash
cd apps/web
npm run dev -- --port 3001

```

Open http://localhost:3001 in your browser.

---

## Testing

```bash
# API Unit Tests
cd apps/api
npm test

# API E2E Tests
npm run test:e2e

# Frontend Lint & Build
cd apps/web
npm run lint && npm run build

```
---

## Local webhook setup

Because PayPal needs to push events to your local machine, use ngrok to expose your API:

1. Start your ngrok tunnel pointing to port 3000:
```bash
ngrok http 3000

```

2. Copy your public HTTPS forwarding URL (e.g., `[https://xxxx.ngrok-free.app](https://xxxx.ngrok-free.app)`).
3. In your [PayPal Developer Dashboard](https://developer.paypal.com/), navigate to your Sandbox App and add a webhook URL:
```text
https://YOUR_NGROK_DOMAIN/paypal/webhooks

```

4. Subscribe to the required events:
* **Orders:** `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`
* **Invoicing:** `INVOICING.INVOICE.CREATED`, `INVOICING.INVOICE.SENT`, `INVOICING.INVOICE.PAID`


5. Copy the generated **Webhook ID** into your `apps/api/.env` file as `PAYPAL_WEBHOOK_ID`.

---

## Testing with Postman

The repository includes the sanitized Postman collection:

`docs/postman/PayPal Autopilot.postman_collection.json`

### Import the collection

1. Open Postman.
2. Select **Import**.
3. Choose `docs/postman/PayPal Autopilot.postman_collection.json`.
4. Configure the collection variables for your local environment.
5. Confirm the backend is running before sending requests.

The collection uses a configurable base URL and placeholders for identifiers that should come from actual API responses.

### Collection variables

| Variable | Example or purpose |
|---|---|
| `base_url` | `http://localhost:3000` |
| `frontend_url` | `http://localhost:3001` |
| `test_email` | Email for your local test account |
| `test_password` | Password for your local test account |
| `business_id` | Business ID returned or selected for your account |
| `approval_id` | ID of a real approval record |
| `run_id` | ID of a real AI analysis run |
| `order_id` | ID of a real PayPal Sandbox order |

Use your own local test credentials. Do not commit real passwords, tokens, session cookies, or private API responses.

### Recommended testing sequence

1. Register a test account.
2. Log in and verify that authentication succeeds.
3. Confirm that the account can access its intended business.
4. Trigger revenue analysis.
5. Retrieve the analysis run and review the generated opportunities.
6. Initialize and retrieve pending approvals.
7. Approve an eligible opportunity or reject it with a reason.
8. Check execution eligibility before attempting execution.
9. Execute an approved, eligible action using Sandbox data.
10. Reconcile the execution and verify the persisted provider state.
11. Test PayPal webhook signature validation and duplicate-event handling using a valid test setup.

Postman must retain and send the authentication cookie as required by the API. Protected requests should not rely on hardcoded bearer tokens.

### Testing webhooks

PayPal must be able to reach the configured webhook endpoint. For local testing, use a secure public tunnel or another supported development setup and configure the matching webhook URL in PayPal Developer Dashboard.

Webhook endpoint:

`POST /paypal/webhooks`

Test valid signatures, invalid signatures, duplicate events, and relevant invoice or payment status changes. Never treat a webhook as verified merely because its payload looks valid.

## API endpoints

The following routes are available in the Postman collection.

Use `{{base_url}}` as the base URL and replace path parameters with actual IDs.

### Revenue and AI analysis

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/revenue/businesses/{businessId}/analyze` | Run revenue analysis |
| `GET` | `/revenue/businesses/{businessId}/opportunities` | Retrieve recovery opportunities |
| `GET` | `/ai/provider/{businessId}` | Retrieve the configured provider information for a business |
| `POST` | `/ai/businesses/{businessId}/revenue-analysis` | Start an AI revenue-analysis run |
| `GET` | `/ai/businesses/{businessId}/runs` | List analysis runs |
| `GET` | `/ai/businesses/{businessId}/runs/{runId}` | Retrieve a specific analysis run |

### Approvals and execution

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/approvals/businesses/{businessId}/initialize` | Initialize approval records |
| `GET` | `/approvals/businesses/{businessId}/pending` | List pending approvals |
| `POST` | `/approvals/businesses/{businessId}/{approvalId}/approve` | Approve an action |
| `POST` | `/approvals/businesses/{businessId}/{approvalId}/reject` | Reject an action |
| `GET` | `/approvals/businesses/{businessId}/{approvalId}/execution-check` | Check execution eligibility |
| `POST` | `/approvals/businesses/{businessId}/{approvalId}/execute` | Execute an eligible, approved action |
| `POST` | `/approvals/businesses/{businessId}/{approvalId}/reconcile` | Reconcile execution state |

The rejection endpoint expects a reason in the request body:

```json
{
  "reason": "The proposed action needs further review."
}
```

### PayPal orders

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/paypal/orders` | Create a PayPal Sandbox order |
| `POST` | `/paypal/orders/{orderId}/capture` | Capture an eligible order |
| `GET` | `/paypal/orders/{orderId}` | Retrieve order details |
| `POST` | `/paypal/webhooks` | Receive PayPal webhook events |

Business-specific routes require the appropriate authentication and business membership. Approval and execution actions require the necessary authorization. Refer to the controllers and guards for the authoritative request and response contracts.

---

## Important disclaimers

* AI-generated recovery metrics are **projections, not financial advice or guaranteed revenue**.
* A triggered payment request or order approval does not equate to settled funds until a `PAYMENT.CAPTURE.COMPLETED` webhook or verified provider state confirms it.

## Security and financial safeguards

PayPal Autopilot is designed around explicit authorization and server-side validation.

- **Authentication:** The application uses JWT-based authentication with an HttpOnly session cookie.
- **Business access:** Business-specific operations must enforce the authenticated user's membership.
- **Approval:** Financial actions require the appropriate business role and approval state.
- **Eligibility:** The backend rechecks execution conditions instead of trusting the frontend or AI output.
- **Execution safety:** Execution state and reconciliation help prevent unsafe repeat actions.
- **Webhook verification:** PayPal webhook signatures must be verified, and duplicate events must not produce duplicate effects.
- **Secrets:** Database credentials, provider secrets, JWT signing secrets, and PayPal client secrets belong in environment configuration—not Git.
- **Payment accuracy:** A sent payment request does not mean that a customer has paid. Payment confirmation must be based on verified provider state.

Recovery values and confidence scores produced by AI are estimates, not promises of recovered revenue.

## AI provider configuration

The application supports a configurable AI provider.

### Ollama

Configure `AI_PROVIDER`, `AI_MODEL`, and `OLLAMA_BASE_URL` in the backend environment. Ensure Ollama is running and that the configured model is available locally.

### OpenAI

Select the OpenAI provider using the application's supported configuration and provide the required API key through a backend-only environment variable.

The exact model and provider must match the application's implementation and installed provider configuration.

AI output is used to support revenue-recovery decisions. Authorization, eligibility, and financial execution must remain enforced by backend logic.

## Project structure

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   ├── src/
│   │   ├── prisma7.config.ts
│   │   └── package.json
│   └── web/
│       └── package.json
├── docs/
│   └── postman/
│       └── PayPal Autopilot.postman_collection.json
├── .gitignore
├── LICENSE
└── README.md
```

The backend contains the API modules, database integration, authentication, AI analysis, approval and execution workflows, and PayPal integration. The frontend contains the web interface.

## Current scope and limitations

This MVP focuses on AI-assisted overdue-invoice recovery and controlled PayPal workflows.

The project should not be represented as implementing capabilities that are outside its verified scope, including:

- Autonomous customer debits without authorization.
- Refund automation.
- Continuous payment-anomaly monitoring.
- General-purpose autonomous commerce.
- Guaranteed recovery of overdue revenue.
- PayPal Agent Toolkit or MCP integration unless that integration is explicitly implemented and demonstrated.

The supported PayPal workflows should be demonstrated using Sandbox accounts and real API responses. A successful request submission or invoice send must not be presented as proof that payment has been received.

## Troubleshooting

### Database connection errors

- Confirm PostgreSQL is running.
- Check `DATABASE_URL`.
- Verify the database exists and the configured user has the required permissions.
- Apply migrations using the repository's Prisma configuration.

### Prisma client or migration errors

Run the migration and client-generation commands from `apps/api`, including `--config prisma7.config.ts`.

### Authentication failures

- Confirm registration or login succeeded.
- Check that Postman retains the authentication cookie.
- Confirm the business ID belongs to the authenticated user.
- Verify that the request includes the headers required by the application's authentication and CSRF protections.

### PayPal API errors

- Confirm Sandbox credentials match the configured environment.
- Verify the API base URL and currency.
- Check the PayPal response and persisted execution state before retrying a failed or uncertain action.
- Do not blindly retry an operation that might already have succeeded.

### AI provider errors

- Verify `AI_PROVIDER` and `AI_MODEL`.
- For Ollama, confirm the service is running and the model is installed.
- For OpenAI, verify the backend API key and provider configuration.
- Review backend logs without exposing secrets.

## License

This project is intended to be distributed under the MIT License. See [`LICENSE`](LICENSE) for the complete license text.

---
