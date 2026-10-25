const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  headers.set('X-Requested-With', 'XMLHttpRequest');
  
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Unable to reach the API. Check that the backend is running.', 0);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;

    try {
      const data = await response.json();
      const apiMessage = data.message;

      if (Array.isArray(apiMessage)) {
        message = apiMessage.join(', ');
      } else if (typeof apiMessage === 'string') {
        message = apiMessage;
      }
    } catch {
      // Keep the fallback error message.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export interface Business {
  id: string;
  name: string;
  currency?: string;
  role?: string;
}

export interface AuthResponse {
  tokenType?: 'Bearer';
  expiresIn?: string;
  user: {
    id: string;
    email: string;
    createdAt?: string;
  };
  business?: Business;
  businesses?: Business[];
}

export interface RevenueOpportunity {
  id: string;
  invoiceId?: string;
  type?: string;
  status?: string;
  riskLevel?: string;
  amount?: number | string;
  outstandingAmount?: number | string;
  estimatedRecovery?: number | string;
  confidence?: number | string;
  daysOverdue?: number;
  recommendedAction?: string;
  [key: string]: unknown;
}

export interface AiRun {
  id: string;
  provider?: string;
  model?: string;
  status?: string;
  summary?: string;
  totalOutstanding?: number | string;
  estimatedRecovery?: number | string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface Approval {
  id: string;
  status?: string;
  type?: string;
  action?: string;
  executionStatus?: string;
  reason?: string;
  [key: string]: unknown;
}

export function unwrapArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload;

  if (payload && typeof payload === "object") {
    const object = payload as Record<string, unknown>;

    for (const key of [
      "data",
      "items",
      "results",
      "opportunities",
      "runs",
      "approvals",
    ]) {
      if (Array.isArray(object[key])) {
        return object[key] as T[];
      }
    }
  }

  return [];
}

export function formatMoney(
  value: number | string | undefined,
  currency = "USD",
): string {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) return "—";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}
