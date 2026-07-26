export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export class ApiService {
    static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const token = localStorage.getItem("jwt_token");
        
        const headers = new Headers(options.headers || {});
        headers.set("Content-Type", "application/json");
        if (token) {
            headers.set("Authorization", `Bearer ${token}`);
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (!response.ok) {
            let errorMsg = "API Request Failed";
            try {
                const errorData = await response.json();
                errorMsg = errorData.message || errorMsg;
            } catch (e) {
                // Ignore parse errors if response isn't JSON
            }
            throw new Error(errorMsg);
        }

        if (response.status === 204) {
            return {} as T;
        }

        return response.json();
    }

    static get<T>(endpoint: string, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "GET" });
    }

    static post<T>(endpoint: string, body: any, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "POST", body: JSON.stringify(body) });
    }

    static put<T>(endpoint: string, body: any, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "PUT", body: JSON.stringify(body) });
    }

    static delete<T>(endpoint: string, options?: RequestInit) {
        return this.request<T>(endpoint, { ...options, method: "DELETE" });
    }
}
