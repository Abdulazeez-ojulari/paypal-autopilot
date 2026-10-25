"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useCallback, useEffect, useState } from "react";
import { apiRequest, Business } from "@/lib/api";

const navigation = [
    { label: "Overview", href: "/dashboard", icon: "◫" },
    { label: "Approvals", href: "/approvals", icon: "✓" },
];

const STORAGE_KEYS = {
    user: "pa_user",
    businesses: "pa_businesses",
    businessId: "pa_business_id",
};

type StoredBusiness = Business & {
    id: string;
    name: string;
    currency?: string;
    role?: string;
};

type AuthUser = {
    id: string;
    email: string;
};

function readBusinesses(): StoredBusiness[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEYS.businesses);

        if (!stored) return [];

        const parsed: unknown = JSON.parse(stored);

        if (!Array.isArray(parsed)) return [];

        return parsed.filter(
            (item): item is StoredBusiness =>
                item !== null &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                item.id.length > 0 &&
                typeof item.name === "string" &&
                item.name.length > 0,
        );
    } catch {
        return [];
    }
}

function dispatchBusinessChange(businessId: string) {
    window.dispatchEvent(
        new CustomEvent("pa:business-changed", {
            detail: { businessId },
        }),
    );
}

export default function AppShell({
    children,
}: {
    children: ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();

    const [businesses, setBusinesses] = useState<StoredBusiness[]>([]);
    const [businessId, setBusinessId] = useState("");
    const [businessName, setBusinessName] = useState("Your workspace");
    const [email, setEmail] = useState("");
    const [sessionLoading, setSessionLoading] = useState(true);
    const [switchingBusiness, setSwitchingBusiness] = useState(false);
    const [workspaceError, setWorkspaceError] = useState("");

    const selectWorkspace = useCallback((selected: StoredBusiness) => {
        localStorage.setItem(STORAGE_KEYS.businessId, selected.id);

        setBusinessId(selected.id);
        setBusinessName(selected.name);
        setWorkspaceError("");

        dispatchBusinessChange(selected.id);
    }, []);

    useEffect(() => {
        let active = true;

        async function initializeSession() {
            try {
                const user = await apiRequest<AuthUser>("/auth/me");

                if (!active) return;

                setEmail(user.email);

                const availableBusinesses = readBusinesses();

                setBusinesses(availableBusinesses);

                const storedBusinessId = localStorage.getItem(
                    STORAGE_KEYS.businessId,
                );

                const selectedBusiness =
                    availableBusinesses.find(
                        (business) => business.id === storedBusinessId,
                    ) ?? availableBusinesses[0];

                if (selectedBusiness) {
                    localStorage.setItem(STORAGE_KEYS.businessId, selectedBusiness.id);

                    setBusinessId(selectedBusiness.id);
                    setBusinessName(selectedBusiness.name);
                    setWorkspaceError("");
                } else {
                    setBusinessId("");
                    setBusinessName("No business workspace");
                    setWorkspaceError("No business workspace is available for this account. Please sign in again or check your business membership.");
                }
            } catch {
                if (!active) return;

                router.replace("/login");
            } finally {
                if (active) {
                    setSessionLoading(false);
                }
            }
        }

        void initializeSession();

        return () => {
            active = false;
        };
    }, [router]);

    function changeBusiness(nextBusinessId: string) {
        if (
            !nextBusinessId || nextBusinessId === businessId || switchingBusiness
        ) {
            return;
        }

        const selected = businesses.find(
            (business) => business.id === nextBusinessId,
        );

        if (!selected) {
            setWorkspaceError("That business workspace could not be found.");
            return;
        }

        setSwitchingBusiness(true);

        try {
            selectWorkspace(selected);
        } catch {
            setWorkspaceError("Could not switch workspaces. Please try again.");
        } finally {
            setSwitchingBusiness(false);
        }
    }

    useEffect(() => {
        function handleStorageChange(event: StorageEvent) {
            if (
                event.key !== STORAGE_KEYS.businessId && event.key !== STORAGE_KEYS.businesses
            ) {
                return;
            }

            const availableBusinesses = readBusinesses();
            setBusinesses(availableBusinesses);

            const storedBusinessId = localStorage.getItem(STORAGE_KEYS.businessId);

            const selected = availableBusinesses.find((business) => business.id === storedBusinessId);

            if (selected) {
                setBusinessId(selected.id);
                setBusinessName(selected.name);
                setWorkspaceError("");
                dispatchBusinessChange(selected.id);
            } else if (availableBusinesses.length === 0) {
                setBusinessId("");
                setBusinessName("No business workspace");
                setWorkspaceError("No business workspace is available for this account.");
            }
        }

        window.addEventListener("storage", handleStorageChange);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
        };
    }, []);

    async function signOut() {
        try {
            await apiRequest("/auth/logout", {
                method: "POST",
            });
        } catch { 
        } finally {
            localStorage.removeItem(STORAGE_KEYS.user);
            localStorage.removeItem(STORAGE_KEYS.businesses);
            localStorage.removeItem(STORAGE_KEYS.businessId);

            router.replace("/login");
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
            <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
                <div className="flex items-center gap-3 px-5 py-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
                        P
                    </div>

                    <div>
                        <p className="font-bold tracking-tight">
                            PayPal Autopilot
                        </p>
                        <p className="text-xs text-slate-500">
                            Revenue intelligence
                        </p>
                    </div>
                </div>

                <div className="mx-4 rounded-xl bg-slate-50 p-3">
                    <label
                        htmlFor="workspace-selector"
                        className="block text-xs font-medium text-slate-500"
                    >
                        Business workspace
                    </label>

                    {sessionLoading ? (
                        <p className="mt-2 text-sm text-slate-500">
                            Loading workspaces...
                        </p>
                    ) : businesses.length > 1 ? (
                        <select
                            id="workspace-selector"
                            value={businessId}
                            onChange={(event) =>
                                changeBusiness(event.target.value)
                            }
                            disabled={switchingBusiness}
                            aria-label="Switch business workspace"
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-wait disabled:opacity-60"
                        >
                            {businesses.map((business) => (
                                <option
                                    key={business.id}
                                    value={business.id}
                                >
                                    {business.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <p className="mt-2 truncate text-sm font-semibold">
                            {businessName}
                        </p>
                    )}

                    {switchingBusiness && (
                        <p
                            role="status"
                            className="mt-2 text-xs text-indigo-600"
                        >
                            Switching workspace...
                        </p>
                    )}

                    {!sessionLoading && businesses.length > 1 && (
                        <p className="mt-2 text-xs text-slate-500">
                            {businesses.length} businesses available
                        </p>
                    )}
                </div>

                <nav
                    aria-label="Main navigation"
                    className="flex gap-2 overflow-x-auto px-4 py-4 md:flex-col"
                >
                    {navigation.map((item) => {
                        const active = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex min-w-fit items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                                    active
                                        ? "bg-indigo-50 text-indigo-700"
                                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                                <span className="text-base">
                                    {item.icon}
                                </span>
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto hidden border-t border-slate-100 p-4 md:block">
                    <p className="truncate text-sm font-medium">
                        {email || "Signed-in account"}
                    </p>

                    <button
                        type="button"
                        onClick={signOut}
                        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                        Sign out
                    </button>
                </div>

                <div className="border-t border-slate-100 p-4 md:hidden">
                    <p className="mb-2 truncate text-sm font-medium">
                        {email || "Signed-in account"}
                    </p>

                    <button
                        type="button"
                        onClick={signOut}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="min-w-0 flex-1">
                <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
                    <div className="min-w-0">
                        <p className="text-sm text-slate-500">Active business</p>
                        <p className="truncate font-semibold">
                            {businessName}
                        </p>
                    </div>

                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Protected workspace
                    </span>
                </header>

                {workspaceError && (
                    <div
                        role="alert"
                        className="mx-5 mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:mx-8"
                    >
                        {workspaceError}
                    </div>
                )}

                <div className="mx-auto w-full max-w-7xl p-5 sm:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}