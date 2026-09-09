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
    approvalStatusFilter: "pending",
    approvalSearchQuery: "",
    approvalDebounceTimer: null,

    init() {
        this.loadDirectoryLocations();
        this.loadUserDirectory();
        this.loadFarmerApprovals();
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
                        <td>
                            ${u.status === 'pending'
                                ? '<span class="badge badge-warning">⏳ Pending</span>'
                                : (u.status === 'rejected'
                                    ? '<span class="badge badge-danger">❌ Rejected</span>'
                                    : '<span class="badge badge-success">✓ Verified</span>')}
                        </td>
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
    },

    // --- Farmer Registration Applications & Approvals ---
    setApprovalStatusFilter(status) {
        this.approvalStatusFilter = status;
        document.querySelectorAll("#adminApprovalStatusTabs .dir-role-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-status") === status);
        });
        this.loadFarmerApprovals();
    },

    debounceApprovalSearch() {
        clearTimeout(this.approvalDebounceTimer);
        this.approvalDebounceTimer = setTimeout(() => {
            const input = document.getElementById("adminApprovalSearchInput");
            this.approvalSearchQuery = input ? input.value.trim() : "";
            this.loadFarmerApprovals();
        }, 300);
    },

    async loadFarmerApprovals() {
        const tbody = document.getElementById("adminApprovalsTableBody");
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4">🔍 Loading farmer registration applications...</td></tr>`;

        try {
            const params = {
                status: this.approvalStatusFilter,
                search: this.approvalSearchQuery
            };
            const res = await api.getFarmerApplications(params);
            const applications = res.applications || [];
            const summary = res.summary || {};

            // Update KPI cards
            const kpiPending = document.getElementById("kpiPendingApprovals");
            const kpiApproved = document.getElementById("kpiApprovedFarmers");
            const kpiRejected = document.getElementById("kpiRejectedFarmers");
            const kpiTotal = document.getElementById("kpiTotalFarmersApps");
            if (kpiPending) kpiPending.textContent = summary.pending_count || 0;
            if (kpiApproved) kpiApproved.textContent = summary.approved_count || 0;
            if (kpiRejected) kpiRejected.textContent = summary.rejected_count || 0;
            if (kpiTotal) kpiTotal.textContent = summary.total_farmers || 0;

            // Update Filter Badges
            const badgePending = document.getElementById("badgePendingCount");
            const badgeApproved = document.getElementById("badgeApprovedCount");
            const badgeRejected = document.getElementById("badgeRejectedCount");
            const badgeAll = document.getElementById("badgeAllAppsCount");
            if (badgePending) badgePending.textContent = summary.pending_count || 0;
            if (badgeApproved) badgeApproved.textContent = summary.approved_count || 0;
            if (badgeRejected) badgeRejected.textContent = summary.rejected_count || 0;
            if (badgeAll) badgeAll.textContent = summary.total_farmers || 0;

            // Subnav Header Badge
            const subnavBadge = document.getElementById("adminPendingBadge");
            if (subnavBadge) {
                const count = summary.pending_count || 0;
                if (count > 0) {
                    subnavBadge.textContent = count;
                    subnavBadge.style.display = "inline-block";
                } else {
                    subnavBadge.style.display = "none";
                }
            }

            // Urgent Admin Alert Banner
            const alertBanner = document.getElementById("adminPendingAlertBanner");
            const alertText = document.getElementById("adminPendingAlertText");
            if (alertBanner) {
                const count = summary.pending_count || 0;
                if (count > 0) {
                    alertBanner.style.display = "flex";
                    if (alertText) {
                        alertText.textContent = `There ${count === 1 ? 'is 1 farmer registration application' : `are ${count} farmer registration applications`} awaiting official Ministry review and approval before they can access the portal.`;
                    }
                } else {
                    alertBanner.style.display = "none";
                }
            }

            if (applications.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center py-4 text-muted">
                            No farmer applications found matching status: "${this.approvalStatusFilter}".
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = applications.map(app => {
                let statusBadge = "";
                let actionButtons = "";
                const safeName = (app.name || "").replace(/'/g, "\\'");

                if (app.status === "pending") {
                    statusBadge = `<span class="badge badge-warning" style="font-size: 0.82rem; padding: 4px 8px;">⏳ Pending Approval</span>`;
                    actionButtons = `
                        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                            <button type="button" class="btn btn-sm btn-success" onclick="AdminController.approveFarmer(${app.id}, '${safeName}')" title="Grant immediate portal login privileges">
                                ✅ Approve
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="AdminController.openRejectModal(${app.id}, '${safeName}')" title="Reject registration with reason">
                                ❌ Reject
                            </button>
                        </div>
                    `;
                } else if (app.status === "approved") {
                    statusBadge = `
                        <span class="badge badge-success" style="font-size: 0.82rem; padding: 4px 8px;">✅ Approved</span>
                        ${app.approved_at ? `<div class="small text-muted mt-1">On: ${app.approved_at}</div>` : ''}
                    `;
                    actionButtons = `
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick="AdminController.openRejectModal(${app.id}, '${safeName}')">
                            Revoke / Reject
                        </button>
                    `;
                } else if (app.status === "rejected") {
                    statusBadge = `
                        <span class="badge badge-danger" style="font-size: 0.82rem; padding: 4px 8px;">❌ Rejected</span>
                        ${app.rejection_reason ? `<div class="small text-danger mt-1" style="max-width: 200px;">Reason: ${app.rejection_reason}</div>` : ''}
                    `;
                    actionButtons = `
                        <button type="button" class="btn btn-sm btn-outline-success" onclick="AdminController.approveFarmer(${app.id}, '${safeName}')">
                            Re-Approve
                        </button>
                    `;
                }

                const gpsDisplay = (app.latitude && app.longitude)
                    ? `<a href="https://www.google.com/maps?q=${app.latitude},${app.longitude}" target="_blank" class="small text-primary" style="text-decoration: underline;" title="View exact farm location on map">
                        📍 ${Number(app.latitude).toFixed(4)}, ${Number(app.longitude).toFixed(4)} ↗
                       </a>`
                    : `<span class="text-muted small">Not provided</span>`;

                return `
                    <tr class="${app.status === 'pending' ? 'table-row-urgent' : ''}">
                        <td>
                            <strong>${app.name}</strong><br>
                            <span class="small text-muted">📱 ${app.mobile} (ID: #${app.id})</span>
                        </td>
                        <td>
                            <strong>${app.village || '—'}, ${app.district || '—'}</strong><br>
                            <span class="small text-muted">${app.state || '—'} - ${app.pincode || ''}</span><br>
                            <span class="small text-muted" style="font-style: italic;">${app.address || ''}</span>
                        </td>
                        <td>${gpsDisplay}</td>
                        <td class="small text-muted">${app.created_at ? app.created_at.split('.')[0] : '—'}</td>
                        <td>${statusBadge}</td>
                        <td>${actionButtons}</td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger py-4 text-center">Failed to load farmer applications: ${err.message}</td></tr>`;
        }
    },

    async approveFarmer(userId, farmerName) {
        if (!confirm(`Are you sure you want to approve farmer "${farmerName}"? This will allow them to immediately log into KisanSetu.`)) {
            return;
        }

        try {
            const res = await api.reviewFarmerApplication(userId, { action: "approve" });
            showToast(res.message || `Farmer ${farmerName} approved successfully!`, "success");
            this.loadFarmerApprovals();
            this.loadUserDirectory();
        } catch (err) {
            showToast(err.message || "Approval failed", "error");
        }
    },

    openRejectModal(userId, farmerName) {
        const idInput = document.getElementById("rejectFarmerUserId");
        const nameDisplay = document.getElementById("rejectFarmerNameDisplay");
        const reasonInput = document.getElementById("rejectFarmerReason");
        const modal = document.getElementById("rejectFarmerModal");

        if (idInput) idInput.value = userId;
        if (nameDisplay) nameDisplay.textContent = `${farmerName} (ID #${userId})`;
        if (reasonInput) reasonInput.value = "";
        if (modal) modal.classList.add("active");
    },

    async confirmRejectFarmer() {
        const idInput = document.getElementById("rejectFarmerUserId");
        const reasonInput = document.getElementById("rejectFarmerReason");
        const userId = idInput ? idInput.value : null;
        const reason = reasonInput ? reasonInput.value.trim() : "";

        if (!userId) return;

        try {
            const res = await api.reviewFarmerApplication(userId, { action: "reject", reason });
            showToast(res.message || "Farmer application rejected", "info");
            closeRejectFarmerModal();
            this.loadFarmerApprovals();
            this.loadUserDirectory();
        } catch (err) {
            showToast(err.message || "Rejection failed", "error");
        }
    }
};

window.closeRejectFarmerModal = function() {
    const modal = document.getElementById("rejectFarmerModal");
    if (modal) modal.classList.remove("active");
};

// Re-render dynamic admin sections on language change
window.addEventListener("languageChanged", () => {
    AdminController.loadDirectoryLocations();
    AdminController.loadUserDirectory();
    AdminController.loadFarmerApprovals();
    AdminController.loadGrievances();
    AdminController.loadNationalOrders();
    AdminController.loadAIForecasts();
});

window.AdminController = AdminController;
