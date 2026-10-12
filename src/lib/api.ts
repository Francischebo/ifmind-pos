export const API_BASE_URL = import.meta.env.VITE_API_URL ||
    (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
        ? "/api"
        : "http://localhost:3000/api");

export class ApiRequestError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = "ApiRequestError";
    }
}

export class ApiNetworkError extends Error {
    constructor(message: string, readonly cause?: unknown) {
        super(message);
        this.name = "ApiNetworkError";
    }
}

export class ApiService {
    static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const headers = new Headers(options.headers || {});
        const hasBody = !!options.body && !(options.method && ["GET", "HEAD"].includes(options.method.toUpperCase()));

        if (hasBody && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
        }

        let response: Response;

        try {
            response = await fetch(`${API_BASE_URL}${endpoint}`, {
                credentials: options.credentials ?? "include",
                ...options,
                headers,
            });
        } catch (error) {
            throw new ApiNetworkError(
                "Unable to reach the server. Please check your connection and try again.",
                error,
            );
        }

        if (!response.ok) {
            let errorMsg = "API Request Failed";
            const contentType = response.headers.get("content-type") || "";

            try {
                const errorData = contentType.includes("application/json")
                    ? await response.json()
                    : await response.text();

                if (typeof errorData === "object" && errorData && "message" in errorData) {
                    errorMsg = String((errorData as { message?: string }).message || errorMsg);
                } else if (typeof errorData === "object" && errorData && "error" in errorData) {
                    errorMsg = String((errorData as { error?: string }).error || errorMsg);
                } else if (typeof errorData === "string" && errorData.trim()) {
                    errorMsg = errorData.trim();
                }
            } catch {
                // Ignore parse errors if the response is not valid JSON/text
            }

            throw new ApiRequestError(errorMsg, response.status);
        }

        if (response.status === 204) {
            return {} as T;
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            throw new ApiRequestError("The server returned an unexpected response.", response.status);
        }

        try {
            return (await response.json()) as T;
        } catch (error) {
            throw new ApiRequestError(
                "The server returned an invalid JSON response.",
                response.status,
            );
        }
    }

    static get<T>(endpoint: string, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "GET" });
    }

    static post<T>(endpoint: string, body: unknown, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "POST", body: JSON.stringify(body) });
    }

    static put<T>(endpoint: string, body: unknown, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "PUT", body: JSON.stringify(body) });
    }

    static delete<T>(endpoint: string, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "DELETE" });
    }
}
