"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { AiRun, ApiError, apiRequest, formatMoney, RevenueOpportunity, unwrapArray } from "@/lib/api";

function getText(
  item: Record<string, unknown>,
  keys: string[],
): string {
    for (const key of keys) {
        const value = item[key];

        if (value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }

    return "—";
}

function getAmount(
    item: Record<string, unknown>,
    keys: string[],
): number {
    for (const key of keys) {
        const value = Number(item[key]);

        if (item[key] !== undefined && item[key] !== null && Number.isFinite(value)) {
            return value;
        }
    }

    return 0;
}

function MetricCard({ label, value, detail }: {
    label: string;
    value: string;
    detail: string;
}) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900">
                {value}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </section>
    );
}

export default function DashboardPage() {
    const [businessId, setBusinessId] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [opportunities, setOpportunities] = useState<RevenueOpportunity[]>([]);
    const [runs, setRuns] = useState<AiRun[]>([]);
    const [provider, setProvider] = useState("Checking AI provider...");
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const loadDashboard = useCallback(async (id: string) => {
        const token = localStorage.getItem("pa_access_token");

        if (!token) {
            setLoading(false);
            return;
        }

        setError("");

        const results = await Promise.allSettled([
            apiRequest<unknown>(`/revenue/businesses/${id}/opportunities`, {}, token),
            apiRequest<unknown>(`/ai/businesses/${id}/runs`, {}, token),
            apiRequest<{ provider?: string; model?: string }>("/ai/provider", {}, token),
        ]);

        if (results[0].status === "fulfilled") {
            setOpportunities(unwrapArray<RevenueOpportunity>(results[0].value));
        }

        if (results[1].status === "fulfilled") {
            setRuns(unwrapArray<AiRun>(results[1].value));
        }

        if (results[2].status === "fulfilled") {
            const data = results[2].value;
            setProvider([data.provider, data.model].filter(Boolean).join(" · ") || "Provider configured");
        }

        const failures = results.filter((result) => result.status === "rejected");

        if (failures.length === 3) {
            const reason = failures[0];

            setError(
                reason.status === "rejected" && reason.reason instanceof ApiError
                ? reason.reason.message
                : "Could not load dashboard data. Please try again.",
            );
        } else if (failures.length > 0) {
            setNotice("Some dashboard information could not be loaded. Check the API and refresh.");
        } else {
            setNotice("");
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        const id = localStorage.getItem("pa_business_id");

        if (!id) {
            setError("No business workspace was found. Please sign in again.");
            setLoading(false);
            return;
        }

        setBusinessId(id);

        try {
            const businesses = JSON.parse(localStorage.getItem("pa_businesses") || "[]");
            const business = businesses.find((item: { id: string }) => item.id === id);

            if (business?.currency) setCurrency(business.currency);
        } catch {
            // Retain USD as the display fallback.
        }

        void loadDashboard(id);
    }, [loadDashboard]);

    async function runAnalysis() {
        if (!businessId) return;

        const token = localStorage.getItem("pa_access_token");
        if (!token) return;

        setAnalyzing(true);
        setError("");
        setNotice("");

        try {
            await apiRequest(
                `/ai/businesses/${businessId}/revenue-analysis`,
                { method: "POST" },
                token,
            );

            setNotice("Revenue analysis completed. Dashboard data refreshed.");
            await loadDashboard(businessId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Revenue analysis failed.");
        } finally {
            setAnalyzing(false);
        }
    }

    const totalOutstanding = opportunities.reduce(
        (sum, item) =>
        sum + getAmount(item as Record<string, unknown>, [ "outstandingAmount", "amountOutstanding", "totalOutstanding" ]),
        0,
    );

    const estimatedRecovery = opportunities.reduce(
        (sum, item) =>
        sum + getAmount(item as Record<string, unknown>, [ "estimatedRecovery", "recoveryAmount" ]),
        0,
    );

    const openOpportunities = opportunities.filter((item) => {
        const status = String(item.status ?? "").toUpperCase();
        return !["CLOSED", "RECOVERED", "CANCELLED"].includes(status);
    }).length;

    return (
        <AppShell>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
                <p className="text-sm font-medium text-indigo-600">
                    Revenue intelligence
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight">
                    Overview
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Understand outstanding revenue, review AI analysis and keep
                    payment decisions under your control.
                </p>
            </div>

            <button
                onClick={runAnalysis}
                disabled={analyzing || loading || !businessId}
                className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {analyzing ? "Analyzing..." : "Run revenue analysis"}
            </button>
        </div>

        {error && (
            <div
                role="alert"
                className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
                {error}
            </div>
        )}

        {notice && (
            <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                {notice}
            </div>
        )}

        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
                label="Outstanding revenue"
                value={ loading ? "Loading..." : formatMoney(totalOutstanding, currency) }
                detail="Calculated from returned opportunity records"
            />
            <MetricCard
                label="Estimated recovery"
                value={ loading ? "Loading..." : formatMoney(estimatedRecovery, currency) }
                detail="Based on available opportunity estimates"
            />
            <MetricCard
                label="Open opportunities"
                value={loading ? "…" : String(openOpportunities)}
                detail="Current opportunities returned by the API"
            />
            <MetricCard
                label="AI analysis runs"
                value={loading ? "…" : String(runs.length)}
                detail="Recent runs returned by the API"
            />
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="font-bold">Revenue opportunities</h2>
                    <p className="mt-1 text-sm text-slate-500">
                    Review the opportunities identified by your backend.
                    </p>
                </div>
                <span className="text-xs text-slate-400">
                    {opportunities.length} records
                </span>
            </div>

            {loading ? (
                <p className="p-6 text-sm text-slate-500"> Loading opportunities... </p>
            ) : opportunities.length === 0 ? (
                <div className="p-8 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                        ↗
                    </div>
                    <h3 className="mt-4 font-semibold">No opportunities to display</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                        Run revenue analysis to refresh the data. If no records appear,
                        confirm that your business has invoice data available in the
                        backend.
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-5 py-3 font-semibold">Invoice</th>
                                <th className="px-5 py-3 font-semibold">Recommended action</th>
                                <th className="px-5 py-3 font-semibold">Priority</th>
                                <th className="px-5 py-3 font-semibold">Confidence</th>
                                <th className="px-5 py-3 text-right font-semibold">Outstanding</th>
                                <th className="px-5 py-3 text-right font-semibold">Est. recovery</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {opportunities.map((item, index) => {
                                const record = item as Record<string, unknown>;

                                const confidence = Number(record.confidence);
                                const confidenceLabel = Number.isFinite(confidence)
                                ? `${confidence <= 1 ? (confidence * 100).toFixed(0) : confidence.toFixed(0)}%`
                                : "—";

                                const priority = getText(record, ["priority"]);
                                const action = getText(record, ["recommendedAction", "type"]);
                                const reason = getText(record, ["reason"]);

                                return (
                                    <tr
                                        key={item.id || `${item.invoiceId}-${index}`}
                                        className="align-top hover:bg-slate-50"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="max-w-44 break-all font-medium">
                                                {getText(record, ["invoiceId"])}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">
                                                {getText(record, ["status"])}
                                            </p>
                                        </td>

                                        <td className="max-w-72 px-5 py-4">
                                            <p className="font-medium text-slate-800">{action}</p>
                                            <p className="mt-1 whitespace-normal text-xs leading-5 text-slate-500">
                                                {reason}
                                            </p>
                                        </td>

                                        <td className="px-5 py-4">
                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                                {priority}
                                            </span>
                                        </td>

                                        <td className="px-5 py-4 tabular-nums">{confidenceLabel}</td>

                                        <td className="px-5 py-4 text-right font-semibold tabular-nums">
                                            {formatMoney(getAmount(record, ["outstandingAmount"]), currency)}
                                        </td>

                                        <td className="px-5 py-4 text-right font-semibold tabular-nums">
                                            {formatMoney(getAmount(record, ["estimatedRecovery"]), currency)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="font-bold">Recent AI activity</h2>
                    <p className="mt-1 text-sm text-slate-500">Recent analysis results from your workspace.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {provider}
                </span>
            </div>

            {loading ? (
                <p className="p-6 text-sm text-slate-500">Loading AI activity...</p>
            ) : runs.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">
                    No AI runs were returned. Run revenue analysis to start a new analysis.
                </p>
            ) : (
                <div className="divide-y divide-slate-100">
                    {runs.slice(0, 5).map((run, index) => (
                    <div
                        key={run.id || index}
                        className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div className="min-w-0">
                        <p className="font-medium">
                            {run.summary || "Revenue analysis"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            {run.createdAt
                            ? new Date(run.createdAt).toLocaleString()
                            : "Date not provided"}
                            {run.model ? ` · ${run.model}` : ""}
                        </p>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                            <span>
                                <span className="text-slate-500">Outstanding </span>
                                <strong>
                                    {formatMoney(run.totalOutstanding, currency)}
                                </strong>
                            </span>
                            <span>
                                <span className="text-slate-500">Recovery </span>
                                <strong>
                                    {formatMoney(run.estimatedRecovery, currency)}
                                </strong>
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {run.status || "Recorded"}
                            </span>
                        </div>
                    </div>
                    ))}
                </div>
            )}
        </section>
        </AppShell>
    );
}