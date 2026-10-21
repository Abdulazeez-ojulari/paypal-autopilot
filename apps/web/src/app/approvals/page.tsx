"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { Approval, apiRequest, unwrapArray } from "@/lib/api";

function displayValue(item: Approval, keys: string[]): string {
    const record = item as Record<string, unknown>;

    for (const key of keys) {
        const value = record[key];

        if (value !== undefined && value !== null && value !== "") {
            return String(value);
        }
    }

    return "—";
}

export default function ApprovalsPage() {
    const [businessId, setBusinessId] = useState("");
    const [approvals, setApprovals] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [rejectingId, setRejectingId] = useState("");
    const [reason, setReason] = useState("");

    const loadApprovals = useCallback(async (id: string) => {
        const token = localStorage.getItem("pa_access_token");

        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const result = await apiRequest<unknown>(
                `/approvals/businesses/${id}/pending`,
                {}, token
            );

            setApprovals(unwrapArray<Approval>(result));
            setError("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load pending approvals.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const id = localStorage.getItem("pa_business_id");

        if (!id) {
            setError("No business workspace was found. Please sign in again.");
            setLoading(false);
            return;
        }

        setBusinessId(id);
        void loadApprovals(id);
    }, [loadApprovals]);

    async function performAction(
        approvalId: string,
        action: "approve" | "reject" | "execute" | "reconcile",
        rejectionReason?: string,
    ) {
        if (!businessId) return;

        const token = localStorage.getItem("pa_access_token");
        if (!token) return;

        setBusyId(approvalId);
        setError("");
        setNotice("");

        try {
            const body = action === "reject" ? JSON.stringify({ reason: rejectionReason }) : undefined;

            const result = await apiRequest<unknown>(
                `/approvals/businesses/${businessId}/${approvalId}/${action}`,
                {
                method: "POST",
                ...(body ? { body } : {}),
                },
                token,
            );

            if (action === "approve") {
                setNotice("Approval recorded.");
            } else if (action === "reject") {
                setNotice("Approval rejected.");
                setRejectingId("");
                setReason("");
            } else if (action === "execute") {
                setNotice("Execution request completed. Check the returned status and refresh the queue.");
            } else {
                setNotice("Reconciliation request completed.");
            }

            await loadApprovals(businessId);

            if (
                result && typeof result === "object" &&
                "message" in result &&
                typeof (result as { message?: unknown }).message === "string"
            ) {
                setNotice((result as { message: string }).message);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : `Could not ${action} this approval.`);
        } finally {
            setBusyId("");
        }
    }

    async function initializeApprovals() {
        if (!businessId) return;

        const token = localStorage.getItem("pa_access_token");
        if (!token) return;

        setBusyId("initialize");
        setError("");
        setNotice("");

        try {
            await apiRequest(
                `/approvals/businesses/${businessId}/initialize`,
                { method: "POST" },
                token,
            );

            setNotice("Approval initialization completed. The queue has been refreshed.");
            await loadApprovals(businessId);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not initialize pending approvals.");
        } finally {
            setBusyId("");
        }
    }

    return (
        <AppShell>
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                    <p className="text-sm font-medium text-indigo-600">
                        Human-in-the-loop controls
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight">
                        Approvals
                    </h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                        Review proposed payment requests before they are executed.
                        AI recommendations never replace your approval.
                    </p>
                </div>

                <button
                    onClick={initializeApprovals}
                    disabled={!businessId || busyId !== ""}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    {busyId === "initialize" ? "Initializing..." : "Refresh from analysis"}
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
                <div
                    role="status"
                    className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                >
                    {notice}
                </div>
            )}

            <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">Pending items</p>
                    <p className="mt-2 text-2xl font-bold">{loading ? "…" : approvals.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">Approval required</p>
                    <p className="mt-2 text-2xl font-bold">Before execution</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-sm text-slate-500">Execution policy</p>
                    <p className="mt-2 text-2xl font-bold">Backend enforced</p>
                </div>
            </div>

            <section className="mt-8 space-y-4">
                {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
                        Loading pending approvals...
                    </div>
                ) : approvals.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                            ✓
                        </div>
                        <h2 className="mt-4 font-semibold">No pending approvals</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                            There are no pending items in the response from your API. Run
                            revenue analysis first, then refresh from analysis if you expect
                            new items.
                        </p>
                    </div>
                ) : (
                    approvals.map((approval, index) => {
                        const status = displayValue(approval, ["status"]);
                        const executionStatus = displayValue(approval, [ "executionStatus" ]);
                        const action = displayValue(approval, [ "action", "type", "recommendationType" ]);
                        const isApproved = status.toUpperCase() === "APPROVED";
                        const isRejected = status.toUpperCase() === "REJECTED";
                        const isBusy = busyId === approval.id;

                        return (
                            <article
                                key={approval.id || index}
                                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                            >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="font-bold">
                                                {action === "—" ? "Payment request review" : action}
                                            </h2>
                                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                                {status}
                                            </span>
                                        </div>

                                        <p className="mt-2 break-all text-xs text-slate-400">
                                            Approval ID: {approval.id}
                                        </p>

                                        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                                            <div>
                                                <dt className="text-xs text-slate-500">Invoice</dt>
                                                <dd className="mt-1 break-all text-sm font-medium">
                                                    {displayValue(approval, ["invoiceId"])}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-500">Execution status</dt>
                                                <dd className="mt-1 text-sm font-medium">
                                                    {executionStatus}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-500">Amount</dt>
                                                <dd className="mt-1 text-sm font-medium">
                                                    {displayValue(approval, [ "amount", "outstandingAmount" ])}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-slate-500">Reason</dt>
                                                <dd className="mt-1 text-sm">
                                                    {displayValue(approval, ["reason", "description"])}
                                                </dd>
                                            </div>
                                        </dl>
                                    </div>

                                    <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                                        {!isApproved && !isRejected && (
                                            <>
                                                <button
                                                    onClick={() => void performAction(approval.id, "approve")}
                                                    disabled={isBusy || busyId !== ""}
                                                    className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                                >
                                                    {isBusy ? "Working..." : "Approve"}
                                                </button>
                                                <button
                                                    onClick={() => {setRejectingId(approval.id); setReason("")}}
                                                    disabled={busyId !== ""}
                                                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    Reject
                                                </button>
                                            </>
                                        )}

                                        {isApproved && (
                                            <button
                                                onClick={() =>
                                                    void performAction(approval.id, "execute")
                                                }
                                                disabled={isBusy || busyId !== ""}
                                                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                            >
                                                {isBusy ? "Working..." : "Execute approved request"}
                                            </button>
                                        )}

                                        {isApproved &&
                                            ["FAILED", "IN_PROGRESS"].includes(
                                                executionStatus.toUpperCase()
                                            ) && (
                                                <button
                                                    onClick={() =>
                                                        void performAction(approval.id, "reconcile")
                                                    }
                                                    disabled={isBusy || busyId !== ""}
                                                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                >
                                                    Reconcile
                                                </button>
                                            )
                                        }
                                    </div>
                                </div>

                                {rejectingId === approval.id && (
                                    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                                        <label
                                            htmlFor={`reason-${approval.id}`}
                                            className="mb-2 block text-sm font-semibold"
                                        >
                                            Reason for rejection
                                        </label>
                                        <textarea
                                            id={`reason-${approval.id}`}
                                            value={reason}
                                            onChange={(event) => setReason(event.target.value)}
                                            minLength={3}
                                            maxLength={500}
                                            rows={3}
                                            placeholder="Explain why this request should not proceed..."
                                            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                                        />
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                onClick={() =>
                                                    void performAction(approval.id, "reject", reason.trim())
                                                }
                                                disabled={
                                                    reason.trim().length < 3 ||
                                                    reason.trim().length > 500 ||
                                                    busyId !== ""
                                                }
                                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                                Confirm rejection
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setRejectingId("");
                                                    setReason("");
                                                }}
                                                disabled={busyId !== ""}
                                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })
                )}
            </section>
        </AppShell>
    );
}