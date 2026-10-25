"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Business } from "@/lib/api";

const navigation = [
    { label: "Overview", href: "/dashboard", icon: "◫" },
    { label: "Approvals", href: "/approvals", icon: "✓" },
];

const STORAGE_KEYS = {
    token: "pa_access_token",
    user: "pa_user",
    businesses: "pa_businesses",
    businessId: "pa_business_id",
};

export default function AppShell({
    children,
}: {
    children: ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();

    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [businessId, setBusinessId] = useState("");
    const [businessName, setBusinessName] = useState("Your workspace");
    const [email, setEmail] = useState("");

    useEffect(() => {
        const token = localStorage.getItem(STORAGE_KEYS.token);

        if (!token) {
        router.replace("/login");
        return;
        }

        try {
            const parsedBusinesses: unknown = JSON.parse(localStorage.getItem(STORAGE_KEYS.businesses) || "[]");

            const validBusinesses = Array.isArray(parsedBusinesses)
                ? (parsedBusinesses as Business[]).filter(
                    (item) => item && typeof item.id === "string" && typeof item.name === "string",
                ) : [];

            if (validBusinesses.length === 0) {
                setBusinesses([]);
                setBusinessId("");
                setBusinessName("No workspace available");
                return;
            }

            const storedBusinessId = localStorage.getItem(STORAGE_KEYS.businessId);
            const selectedBusiness = validBusinesses.find((item) => item.id === storedBusinessId) ?? validBusinesses[0];

            setBusinesses(validBusinesses);
            setBusinessId(selectedBusiness.id);
            setBusinessName(selectedBusiness.name);

            if (selectedBusiness.id !== storedBusinessId) {
                localStorage.setItem(STORAGE_KEYS.businessId, selectedBusiness.id);
                window.dispatchEvent(
                    new CustomEvent("pa:business-changed", { detail: { businessId: selectedBusiness.id } }),
                );
            }

            const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || "{}");

            setEmail(typeof user.email === "string" ? user.email : "");
        } catch {
            localStorage.removeItem(STORAGE_KEYS.businesses);
            localStorage.removeItem(STORAGE_KEYS.businessId);
            setBusinesses([]);
            setBusinessId("");
            setBusinessName("Workspace unavailable");
        }
    }, [router]);

    function changeBusiness(nextBusinessId: string) {
        const selected = businesses.find((business) => business.id === nextBusinessId);

        if (!selected || selected.id === businessId) return;

        localStorage.setItem(STORAGE_KEYS.businessId, selected.id);

        setBusinessId(selected.id);
        setBusinessName(selected.name);

        window.dispatchEvent(new CustomEvent("pa:business-changed", { detail: { businessId: selected.id } }));
    }

    function signOut() {
        Object.values(STORAGE_KEYS).forEach((key) => {
            localStorage.removeItem(key);
        });

        router.replace("/login");
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
            <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
                <div className="flex items-center gap-3 px-5 py-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white"> P </div>

                    <div>
                        <p className="font-bold tracking-tight">PayPal Autopilot</p>
                        <p className="text-xs text-slate-500">Revenue intelligence</p>
                    </div>
                </div>

                <div className="mx-4 rounded-xl bg-slate-50 p-3">
                    <label htmlFor="workspace-selector" className="block text-xs text-slate-500">
                        Business workspace
                    </label>

                    {businesses.length > 1 ? (
                        <select
                        id="workspace-selector"
                        value={businessId}
                        onChange={(event) => changeBusiness(event.target.value)}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                        >
                        {businesses.map((business) => (
                            <option key={business.id} value={business.id}>
                                {business.name}
                            </option>
                        ))}
                        </select>
                    ) : (
                        <p className="mt-1 truncate text-sm font-semibold">
                            {businessName}
                        </p>
                    )}
                </div>

                <nav className="flex gap-2 overflow-x-auto px-4 py-4 md:flex-col">
                    {navigation.map((item) => {
                        const active = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex min-w-fit items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                                active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                            >
                                <span className="text-base">{item.icon}</span>
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
                        onClick={signOut}
                        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                    >
                        Sign out
                    </button>
                </div>

                <div className="border-t border-slate-100 p-4 md:hidden">
                    <p className="mb-2 truncate text-sm font-medium">
                        {email || "Signed-in account"}
                    </p>
                    <button
                        onClick={signOut}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="min-w-0 flex-1">
                <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
                    <div className="min-w-0">
                        <p className="text-sm text-slate-500">Business workspace</p>
                        <p className="truncate font-semibold">{businessName}</p>
                    </div>

                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Protected workspace
                    </span>
                </header>

                <div className="mx-auto w-full max-w-7xl p-5 sm:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}