import { PayPalCheckout } from '@/components/paypal/PayPalCheckout';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-400">
            PayPal Autopilot
          </p>

          <h1 className="max-w-3xl text-5xl font-bold tracking-tight text-white">
            AI-powered financial operations
            for modern businesses.
          </h1>

          <p className="mt-5 max-w-2xl text-lg text-slate-400">
            Our AI agent identifies opportunities,
            creates action plans, and safely executes
            financial operations through PayPal.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-[1fr_400px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">

            <h2 className="mt-2 text-2xl font-semibold text-white">
              Sandbox Payment
            </h2>

            <p className="mt-3 text-slate-400">
              This transaction proves that PayPal
              payments can be initiated, approved,
              captured, and persisted by our backend.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-800 p-5">
                <p className="text-sm text-slate-400"> Amount </p>

                <p className="mt-1 text-2xl font-bold text-white"> $10.00 </p>
              </div>

              <div className="rounded-xl bg-slate-800 p-5">
                <p className="text-sm text-slate-400"> Environment </p>

                <p className="mt-1 text-2xl font-bold text-white"> Sandbox </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-xl font-semibold text-slate-900">
              Complete payment
            </h2>

            <p className="mb-6 text-sm text-slate-500">
              Use your PayPal sandbox personal
              account.
            </p>

            <PayPalCheckout
              amount={10}
              currencyCode="USD"
              description="PayPal Autopilot Test Purchase"
            />
          </div>
        </div>
      </div>
    </main>
  );
}