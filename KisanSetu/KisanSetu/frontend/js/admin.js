/**
 * KisanSetu - Ministry of Agriculture (Admin) Controller
 * Handles:
 * 1. National Dispute Redressal & Resolution Desk
 * 2. Resolution Action recording (shown directly to Farmers & Buyers)
 * 3. AI Demand Forecasting & Fair Price Guidance
 * 4. Nationwide Supply Chain Analytics
 */

const AdminController = {
    selectedTicketForResolution: null,
    directoryRole: "farmer",
    directoryState: "",
    directoryDistrict: "",
    directorySearch: "",
    searchDebounceTimer: null,
    stateDistrictsMap: {},

    init() {
        this.loadDirectoryLocations();
        this.loadUserDirectory();
        this.loadGrievances();
        this.loadNationalOrders();
        this.loadAIForecasts();
    },

    // --- State & District Directory & Activity Monitor ---
    async loadDirectoryLocations() {
        const stateSelect = document.getElementById("adminDirStateSelect");
        if (!stateSelect) return;

        try {
            const res = await api.getAdminLocations();
            if (res.success) {
                this.stateDistrictsMap = res.state_districts || {};
                const states = res.states || [];

                let html = `<option value="">All States (Pan-India)</option>`;
                states.forEach(st => {
                    html += `<option value="${st}">${st}</option>`;
                });
                stateSelect.innerHTML = html;
            }
        } catch (err) {
            console.error("Failed to load admin locations:", err);
        }
    },

    setDirectoryRole(role) {
        this.directoryRole = role;
        document.querySelectorAll("#adminDirRoleTabs .dir-role-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-role") === role);
        });
        this.loadUserDirectory();
    },

    onStateChange(state) {
        this.directoryState = state;
        this.directoryDistrict = "";
        const distSelect = document.getElementById("adminDirDistrictSelect");
        if (distSelect) {
            let html = `<option value="">All Districts</option>`;
            if (state && this.stateDistrictsMap[state]) {
                this.stateDistrictsMap[state].forEach(d => {
                    html += `<option value="${d}">${d}</option>`;
                });
            }
            distSelect.innerHTML = html;
            distSelect.value = "";
        }
        this.loadUserDirectory();
    },

    onDistrictChange(district) {
        this.directoryDistrict = district;
        this.loadUserDirectory();
    },

    debounceSearch() {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
            const input = document.getElementById("adminDirSearchInput");
            this.directorySearch = input ? input.value.trim() : "";
            this.loadUserDirectory();
        }, 300);
    },

    resetDirectoryFilters() {
        this.directoryRole = "farmer";
        this.directoryState = "";
        this.directoryDistrict = "";
        this.directorySearch = "";

        const stateSelect = document.getElementById("adminDirStateSelect");
        if (stateSelect) stateSelect.value = "";

        const distSelect = document.getElementById("adminDirDistrictSelect");
        if (distSelect) {
            distSelect.innerHTML = `<option value="">All Districts</option>`;
            distSelect.value = "";
        }

        const searchInput = document.getElementById("adminDirSearchInput");
        if (searchInput) searchInput.value = "";

        document.querySelectorAll("#adminDirRoleTabs .dir-role-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-role") === "farmer");
        });

        this.loadUserDirectory();
    },

    async loadUserDirectory() {
        const tbody = document.getElementById("adminDirectoryTableBody");
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">🔍 Loading verified community directory & activity logs...</td></tr>`;

        try {
            const params = {
                role: this.directoryRole,
                state: this.directoryState,
                district: this.directoryDistrict,
                search: this.directorySearch
            };
            const res = await api.getAdminUsers(params);
            const users = res.users || [];
            const summary = res.summary || {};

            // Update KPI badges
            const kpiFarmers = document.getElementById("adminKpiTotalFarmers");
            const kpiBuyers = document.getElementById("adminKpiTotalBuyers");
            const kpiLogistics = document.getElementById("adminKpiTotalLogistics");
            const kpiFiltered = document.getElementById("adminKpiFilteredCount");
            if (kpiFarmers) kpiFarmers.textContent = summary.total_farmers || 0;
            if (kpiBuyers) kpiBuyers.textContent = summary.total_buyers || 0;
            if (kpiLogistics) kpiLogistics.textContent = summary.total_logistics || 0;
            if (kpiFiltered) kpiFiltered.textContent = summary.filtered_count || users.length;

            const cntFarmers = document.getElementById("badgeCountFarmers");
            const cntBuyers = document.getElementById("badgeCountBuyers");
            const cntLogistics = document.getElementById("badgeCountLogistics");
            const cntAll = document.getElementById("badgeCountAll");
            if (cntFarmers) cntFarmers.textContent = summary.total_farmers || 0;
            if (cntBuyers) cntBuyers.textContent = summary.total_buyers || 0;
            if (cntLogistics) cntLogistics.textContent = summary.total_logistics || 0;
            if (cntAll) cntAll.textContent = summary.total_users || 0;

            if (users.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center py-4 text-muted">
                            No registered members found matching state: "${this.directoryState || 'All'}", district: "${this.directoryDistrict || 'All'}", role: "${this.directoryRole}".
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = users.map(u => {
                let roleBadge = "";
                let activityPill = "";

                if (u.role === "farmer") {
                    roleBadge = `<span class="badge-role badge-role-farmer">🌾 Farmer</span>`;
                    activityPill = `
                        <div class="activity-badge-pill">
                            <span>📦 ${u.activity.products_listed || 0} Crops Listed</span>
                            <span>•</span>
                            <span>📋 ${u.activity.orders_received || 0} Orders</span>
                            <span>•</span>
                            <span>₹${(u.activity.total_earnings_inr || 0).toLocaleString()} Earned</span>
                        </div>
                    `;
                } else if (u.role === "buyer") {
                    roleBadge = `<span class="badge-role badge-role-buyer">🛒 Customer</span>`;
                    activityPill = `
                        <div class="activity-badge-pill buyer-pill">
                            <span>🛒 ${u.activity.orders_placed || 0} Orders Placed</span>
                            <span>•</span>
                            <span>✅ ${u.activity.orders_delivered || 0} Delivered</span>
                            <span>•</span>
                            <span>₹${(u.activity.total_spent_inr || 0).toLocaleString()} Spent</span>
                        </div>
                    `;
                } else if (u.role === "logistics") {
                    roleBadge = `<span class="badge-role badge-role-logistics">🚚 Logistics</span>`;
                    activityPill = `
                        <div class="activity-badge-pill logistics-pill">
                            <span>🏢 ${u.activity.network_hubs || 0} Hubs</span>
                            <span>•</span>
                            <span>🚚 ${u.activity.active_shipments || 0} Active Shipments</span>
                            <span>•</span>
                            <span>✅ ${u.activity.deliveries_completed || 0} Delivered</span>
                        </div>
                    `;
                } else {
                    roleBadge = `<span class="badge-role badge-role-admin">🏛️ Admin</span>`;
                    activityPill = `<span class="text-muted small">Central Ministry Governance</span>`;
                }

                return `
                    <tr>
                        <td>
                            <strong>${u.name}</strong><br>
                            <span class="small text-muted">📱 ${u.mobile} (ID: #${u.id})</span>
                        </td>
                        <td>${roleBadge}</td>
                        <td>
                            <strong>${u.state || 'National'}</strong><br>
                            <span class="small text-muted">${u.district || 'All Districts'}</span>
                        </td>
                        <td>${u.village || '—'}</td>
                        <td>${activityPill}</td>
                        <td class="small text-muted">${u.created_at ? u.created_at.split(' ')[0] : 'Active'}</td>
                        <td><span class="badge badge-success">✓ Verified</span></td>
                    </tr>
                `;
            }).join('');

        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-danger py-4 text-center">Failed to load directory: ${err.message}</td></tr>`;
        }
    },

    async loadGrievances() {
        const container = document.getElementById("adminGrievanceTableBody");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="7" class="text-center py-4">Loading nation-wide grievances...</td></tr>`;

        try {
            const res = await api.getTickets(null, true);
            const tickets = res.tickets || [];

            if (tickets.length === 0) {
                container.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">All grievances resolved across sectors. Zero pending disputes.</td></tr>`;
                return;
            }

            container.innerHTML = tickets.map(t => `
                <tr class="${t.status === 'Resolved' ? 'table-row-resolved' : 'table-row-urgent'}">
                    <td><strong>#${t.ticket_number}</strong></td>
                    <td>
                        <span class="badge-role badge-role-${t.raised_by_role}">${t.raised_by_role.toUpperCase()}</span><br>
                        <strong>${t.raised_by_name}</strong>
                    </td>
                    <td>
                        <span class="badge-target">Against: ${t.target_entity.toUpperCase()}</span>
                    </td>
                    <td>
                        <strong>${t.subject}</strong>
                        <p class="small text-muted mb-1">${t.description}</p>
                        <div class="small"><strong>Expected:</strong> ${t.expected_resolution}</div>
                        ${t.attachment_url ? `<a href="${t.attachment_url}" target="_blank" class="small text-primary">📎 Attached Proof</a>` : ''}
                    </td>
                    <td>
                        <span class="status-badge status-${t.status.toLowerCase().replace(/ /g, '-')}">${t.status}</span>
                        ${t.admin_resolution_notes ? `<div class="small text-success mt-1">✓ ${t.admin_resolution_notes}</div>` : ''}
                    </td>
                    <td>${t.created_at ? t.created_at.split(' ')[0] : 'Today'}</td>
                    <td>
                        ${t.status !== 'Resolved' ? `
                            <button class="btn btn-sm btn-primary" onclick="AdminController.openResolveModal(${JSON.stringify(t).replace(/"/g, '&quot;')})">
                                ⚖️ Issue Resolution
                            </button>
                        ` : `
                            <span class="text-success small font-weight-bold">Closed</span>
                        `}
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            container.innerHTML = `<tr><td colspan="7" class="text-danger py-4 text-center">Error: ${err.message}</td></tr>`;
        }
    },

    openResolveModal(ticket) {
        this.selectedTicketForResolution = ticket;
        document.getElementById("modal_resolve_ticket_num").textContent = ticket.ticket_number;
        document.getElementById("modal_resolve_raised_by").textContent = `${ticket.raised_by_name} (${ticket.raised_by_role})`;
        document.getElementById("modal_resolve_subject").textContent = ticket.subject;
        document.getElementById("modal_resolve_expected").textContent = ticket.expected_resolution;
        document.getElementById("admin_resolution_text").value = "";

        const modal = document.getElementById("adminResolveModal");
        if (modal) modal.classList.add("active");
    },

    closeResolveModal() {
        const modal = document.getElementById("adminResolveModal");
        if (modal) modal.classList.remove("active");
        this.selectedTicketForResolution = null;
    },

    async submitResolution(e) {
        e.preventDefault();
        if (!this.selectedTicketForResolution) return;

        const notes = document.getElementById("admin_resolution_text").value.trim();
        if (!notes) {
            window.showToast("Please enter the official Ministry resolution notes.", "error");
            return;
        }

        try {
            const res = await api.resolveTicket(
                this.selectedTicketForResolution.id,
                notes,
                "Resolved"
            );
            window.showToast(res.message, "success");
            this.closeResolveModal();
            this.loadGrievances();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    async loadNationalOrders() {
        const container = document.getElementById("adminNationalOrdersTableBody");
        if (!container) return;

        try {
            const res = await api.getOrders();
            const orders = res.orders || [];

            container.innerHTML = orders.slice(0, 10).map(o => `
                <tr>
                    <td><strong>#${o.order_number}</strong></td>
                    <td>${o.product_name}</td>
                    <td>${o.farmer_name} (${o.farmer_state})</td>
                    <td>${o.buyer_name}</td>
                    <td>${o.quantity} kg</td>
                    <td><strong class="text-success">₹${o.total_amount}</strong></td>
                    <td>
                        <span class="${o.badge_class}">${o.status_display}</span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error("Admin order load failed:", err);
        }
    },

    async loadAIForecasts() {
        const container = document.getElementById("aiForecastCardContent");
        if (!container) return;

        try {
            const res = await api.getAIForecast("Ponni Raw Rice (Organic)");
            const localizedCrop = i18n.translateCrop ? i18n.translateCrop(res.commodity) : res.commodity;
            const localizedTrend = i18n.translateTrend ? i18n.translateTrend(res.price_guidance.trend) : res.price_guidance.trend;
            const localizedInsight = i18n.translateInsight ? i18n.translateInsight(res.market_insights, res.commodity) : res.market_insights;
            container.innerHTML = `
                <div class="ai-forecast-grid">
                    <div class="forecast-box">
                        <div class="forecast-label">${i18n.t("th_commodity")}</div>
                        <div class="forecast-val">${localizedCrop}</div>
                        <span class="badge badge-success">${i18n.t("high_demand")}</span>
                    </div>
                    <div class="forecast-box">
                        <div class="forecast-label">${i18n.t("demand_score")} (1-100)</div>
                        <div class="forecast-val text-primary">${res.demand_index} / 100</div>
                        <span class="small text-muted">${res.forecast_period}</span>
                    </div>
                    <div class="forecast-box">
                        <div class="forecast-label">${i18n.t("retail_guidance")}</div>
                        <div class="forecast-val text-success">${res.price_guidance.recommended_retail_slab}</div>
                        <span class="small text-muted">${i18n.t("msp_baseline")}: ₹${res.price_guidance.government_msp}/kg</span>
                    </div>
                    <div class="forecast-box">
                        <div class="forecast-label">${i18n.t("bulk_guidance")}</div>
                        <div class="forecast-val text-warning">${res.price_guidance.recommended_bulk_slab}</div>
                        <span class="small text-muted">${i18n.t("lbl_trend")}: ${localizedTrend}</span>
                    </div>
                </div>
                <div class="ai-insight-strip mt-3">
                    💡 <strong>${i18n.t("ai_outlook_label")}:</strong> ${localizedInsight}. ${i18n.t("ai_fair_price_comparison")}
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<p class="text-muted">${i18n.t("ai_error_hint")}</p>`;
        }
    }
};

// Re-render dynamic admin sections on language change
window.addEventListener("languageChanged", () => {
    AdminController.loadDirectoryLocations();
    AdminController.loadUserDirectory();
    AdminController.loadGrievances();
    AdminController.loadNationalOrders();
    AdminController.loadAIForecasts();
});

window.AdminController = AdminController;
