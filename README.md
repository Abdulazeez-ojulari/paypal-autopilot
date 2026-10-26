
---

# PayPal Autopilot

> **Hackathon Prototype:** AI-assisted invoice recovery with human approval and PayPal integration.
> *AI recommends. The business owner decides. PayPal executes.*

PayPal Autopilot helps businesses identify overdue invoices, evaluate recovery opportunities using local AI, and safely manage follow-up actions through a human-in-the-loop workflow.

---

## 🛠️ Quick Architecture

* **Frontend (`/apps/web`):** Next.js (Dashboard, approvals, auth)
* **Backend (`/apps/api`):** NestJS (REST API, webhooks, auth)
* **Database:** PostgreSQL + Prisma ORM
* **AI Engine:** Ollama (defaulting to `qwen3:8b` / `gpt-oss:20b`)
* **Integrations:** PayPal Sandbox REST API & Webhooks

---

## ⚙️ Prerequisites

* Node.js & npm
* PostgreSQL database
* [Ollama](https://ollama.com/) running locally
* [ngrok](https://ngrok.com/) (for local PayPal webhook testing)
* PayPal Developer Account (Sandbox credentials)

---

## 🚀 Getting Started

### 1. Clone & Install

Clone the repository, then install dependencies for both apps separately (there is no root `package.json`):

```bash
# Clone repo
git clone <YOUR_REPOSITORY_URL>
cd <YOUR_REPOSITORY_DIRECTORY>

# Install API dependencies
cd apps/api && npm install

# Install Web dependencies (in a separate terminal)
cd ../web && npm install

```

### 2. Environment Variables

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

### 3. Database Setup & Seeding

Run your Prisma migrations, then seed test data (⚠️ *Note: The seed script clears existing tables, use only on a dev database*):

```bash
cd apps/api
npx prisma migrate dev
npm run prisma-seed

```

To link your registered account to the seeded demo business (`Acme Digital Services`), update `TARGET_BUSINESS_ID` and `OWNER_EMAIL` in your `.env`, then run your project's owner-setup script.

---

## 🏃 Running Locally

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

## 🪝 Local Webhook Setup (ngrok)

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

## 🧪 Testing

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

## ⚠️ Important Disclaimers

* AI-generated recovery metrics are **projections, not financial advice or guaranteed revenue**.
* A triggered payment request or order approval does not equate to settled funds until a `PAYMENT.CAPTURE.COMPLETED` webhook or verified provider state confirms it.

## License

MIT License. See LICENSE for details.

---
