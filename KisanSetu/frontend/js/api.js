/**
 * KisanSetu - Frontend API Client
 */

const API_BASE = "";

const api = {
    currentUser: JSON.parse(localStorage.getItem("kisansetu_user") || "null"),

    setUser(user) {
        this.currentUser = user;
        if (user) {
            localStorage.setItem("kisansetu_user", JSON.stringify(user));
        } else {
            localStorage.removeItem("kisansetu_user");
        }
    },

    async request(endpoint, options = {}) {
        options.headers = options.headers || {};
        if (!(options.body instanceof FormData)) {
            options.headers["Content-Type"] = "application/json";
        }

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, options);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || `HTTP ${res.status}`);
            }
            return data;
        } catch (err) {
            console.error(`[API Error] ${endpoint}:`, err);
            throw err;
        }
    },

    // Auth
    async sendOtp(mobile) {
        return this.request("/api/auth/send-otp", {
            method: "POST",
            body: JSON.stringify({ mobile })
        });
    },

    async verifyOtp(mobile, otp) {
        return this.request("/api/auth/verify-otp", {
            method: "POST",
            body: JSON.stringify({ mobile, otp })
        });
    },

    async register(payload) {
        const res = await this.request("/api/auth/register", {
            method: "POST",
            body: JSON.stringify(payload)
        });
        if (res.success && res.user) {
            this.setUser(res.user);
        }
        return res;
    },

    async login(mobile, password, role) {
        const res = await this.request("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ mobile, password, role })
        });
        if (res.success && res.user) {
            this.setUser(res.user);
        }
        return res;
    },

    async getProfile(userId) {
        return this.request(`/api/auth/profile?user_id=${userId}`);
    },

    async updateProfile(payload) {
        return this.request("/api/auth/profile", {
            method: "PUT",
            body: JSON.stringify(payload)
        });
    },

    // Products
    async getProducts(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/products/list?${query}`);
    },

    async addProduct(payload) {
        return this.request("/api/products/add", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async deleteProduct(productId) {
        return this.request(`/api/products/delete/${productId}`, {
            method: "DELETE"
        });
    },

    // Orders
    async createOrder(payload) {
        return this.request("/api/orders/create", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async getOrders(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/orders/list?${query}`);
    },

    async updateOrderStatus(orderId, status, note = "") {
        return this.request("/api/orders/update-status", {
            method: "POST",
            body: JSON.stringify({ order_id: orderId, status, note })
        });
    },

    async requestReturn(orderId, buyerId, reason, proofUrl = "") {
        return this.request("/api/orders/request-return", {
            method: "POST",
            body: JSON.stringify({
                order_id: orderId,
                buyer_id: buyerId,
                reason,
                proof_url: proofUrl
            })
        });
    },

    // Support
    async uploadFile(file) {
        const formData = new FormData();
        formData.append("file", file);
        return this.request("/api/support/file-upload", {
            method: "POST",
            body: formData
        });
    },

    async raiseTicket(payload) {
        return this.request("/api/support/raise", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async getTickets(userId = null, isAdmin = false) {
        const params = new URLSearchParams();
        if (userId) params.append("user_id", userId);
        if (isAdmin) params.append("is_admin", "true");
        return this.request(`/api/support/list?${params.toString()}`);
    },

    async resolveTicket(ticketId, adminNotes, status = "Resolved") {
        return this.request("/api/support/resolve", {
            method: "POST",
            body: JSON.stringify({
                ticket_id: ticketId,
                admin_resolution_notes: adminNotes,
                status
            })
        });
    },

    // AI Forecast
    async getAIForecast(commodity = "Ponni Raw Rice (Organic)", month = 9) {
        return this.request(`/api/ai/forecast?commodity=${encodeURIComponent(commodity)}&month=${month}`);
    },

    // Logistics Dispatch & Route Optimization
    async getLogisticsEstimate(payload) {
        return this.request("/api/logistics/estimate-dispatch", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async getOptimizedRoute(corridor = "chennai_corridor") {
        return this.request("/api/logistics/optimize-route", {
            method: "POST",
            body: JSON.stringify({ corridor })
        });
    },

    // Hubs Management & Hub-Centric Operations
    async getDeliveryHubs() {
        return this.request("/api/logistics/hubs/list");
    },

    async addDeliveryHub(hubData) {
        return this.request("/api/logistics/hubs/add", {
            method: "POST",
            body: JSON.stringify(hubData)
        });
    },

    async getHubOperations(hubId = null, agentId = null) {
        const params = new URLSearchParams();
        if (hubId) params.append("hub_id", hubId);
        if (agentId) params.append("agent_id", agentId);
        const query = params.toString() ? `?${params.toString()}` : "";
        return this.request(`/api/logistics/hub-operations${query}`);
    },

    async acceptLogisticsOrder(payload) {
        return this.request("/api/logistics/accept-order", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    async releaseLogisticsOrder(orderId, agentId) {
        return this.request("/api/logistics/release-order", {
            method: "POST",
            body: JSON.stringify({ order_id: orderId, agent_id: agentId })
        });
    },

    async verifyAndConfirmLogistics(payload) {
        return this.request("/api/logistics/verify-and-confirm", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    },

    // --- Admin User Directory & Activity Analytics ---
    async getAdminLocations() {
        return this.request("/api/admin/locations");
    },

    async getAdminUsers(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/admin/users/list?${query}`);
    }
};

window.api = api;
