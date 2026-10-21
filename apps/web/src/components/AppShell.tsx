"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";

const navigation = [
    { label: "Overview", href: "/dashboard", icon: "◫" },
    { label: "Approvals", href: "/approvals", icon: "✓" },
];

export default function AppShell({
    children,
}: { children: ReactNode; }) {
    const pathname = usePathname();
    const router = useRouter();
    const [businessName, setBusinessName] = useState("Your workspace");
    const [email, setEmail] = useState("");

    useEffect(() => {
        const token = localStorage.getItem("pa_access_token");

        if (!token) {
            router.replace("/login");
            return;
        }

        try {
            const businesses = JSON.parse(localStorage.getItem("pa_businesses") || "[]");
            const businessId = localStorage.getItem("pa_business_id");
            const business = businesses.find((item: { id: string }) => item.id === businessId);

            if (business?.name) setBusinessName(business.name);

            const user = JSON.parse(localStorage.getItem("pa_user") || "{}");
            if (user.email) setEmail(user.email);
        } catch {
            localStorage.removeItem("pa_businesses");
        }
    }, [router]);

    function signOut() {
        localStorage.removeItem("pa_access_token");
        localStorage.removeItem("pa_user");
        localStorage.removeItem("pa_businesses");
        localStorage.removeItem("pa_business_id");
        router.replace("/login");
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
            <aside className="flex w-full flex-col border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
                <div className="flex items-center gap-3 px-5 py-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
                        P
                    </div>
                    <div>
                        <p className="font-bold tracking-tight">PayPal Autopilot</p>
                        <p className="text-xs text-slate-500">Revenue intelligence</p>
                    </div>
                </div>

                <div className="mx-4 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Workspace</p>
                    <p className="mt-1 truncate text-sm font-semibold">{businessName}</p>
                </div>

                <nav className="flex gap-2 overflow-x-auto px-4 py-4 md:flex-col">
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
                            <span className="text-base">{item.icon}</span>
                            {item.label}
                        </Link>
                        );
                    })}
                </nav>

                <div className="mt-auto hidden border-t border-slate-100 p-4 md:block">
                    <p className="truncate text-sm font-medium">{email || "Signed-in account"}</p>
                    <button
                        onClick={signOut}
                        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
                    >
                        Sign out
                    </button>
                </div>

                <div className="border-t border-slate-100 p-4 md:hidden">
                    <button
                        onClick={signOut}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
                    >
                        Sign out
                    </button>
                </div>
            </aside>

            <main className="min-w-0 flex-1">
                <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
                    <div>
                        <p className="text-sm text-slate-500">Business workspace</p>
                        <p className="font-semibold">{businessName}</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Protected workspace
                    </span>
                </header>

                <div className="mx-auto w-full max-w-7xl p-5 sm:p-8">{children}</div>
            </main>
        </div>
    );
}