/**
 * KisanSetu - Farmer / FPO Controller
 * Handles:
 * 1. AI Demand Forecasting & Fair Price Advisor integration on Farmer Page
 * 2. National Marketplace View
 * 3. My Products with dynamic Slab / Tier Pricing Builder
 * 4. Orders with 7-Day Yellow Countdown Timer to Green / Red Return
 * 5. Support Grievances to Ministry with Proof & Expected Resolution
 * 6. Profile Management
 * 7. Real-time language re-rendering across all dynamic components
 */

const FarmerController = {
    currentSlabs: [
        { min_quantity: 0, max_quantity: 10, price_per_kg: 45 },
        { min_quantity: 10, max_quantity: 50, price_per_kg: 38 },
        { min_quantity: 50, max_quantity: null, price_per_kg: 32 }
    ],

    latestAIForecast: null,

    init() {
        this.renderSlabInputs();
        this.loadFarmerAIForecast();
        this.loadMyProducts();
        this.loadOrders();
        this.loadTickets();
        this.loadProfile();

        // Crop selector change listener for AI demand forecast
        const cropSelect = document.getElementById("farmerAICropSelect");
        if (cropSelect && !cropSelect.dataset.bound) {
            cropSelect.dataset.bound = "true";
            cropSelect.addEventListener("change", (e) => {
                this.loadFarmerAIForecast(e.target.value);
            });
        }

        // Live Cross-Panel Sync: auto-refresh when customer places an order
        if (!window._farmerOrderListenerAttached) {
            window._farmerOrderListenerAttached = true;
            window.addEventListener("kisansetu:order_placed", () => {
                if (window.api && window.api.currentUser && window.api.currentUser.role === "farmer") {
                    FarmerController.loadOrders();
                    FarmerController.loadMyProducts();
                }
            });
        }
    },

    // --- AI Demand Forecasting for Farmers ---
    async loadFarmerAIForecast(commodity = null) {
        const cropSelect = document.getElementById("farmerAICropSelect");
        const targetCrop = commodity || (cropSelect ? cropSelect.value : "Ponni Raw Rice (Organic)");
        const statsGrid = document.getElementById("farmerAIStatsGrid");
        const insightEl = document.getElementById("farmerAIInsightText");

        if (statsGrid) {
            statsGrid.innerHTML = `<div class="text-muted small py-2">Consulting KisanSetu AI Demand Engine...</div>`;
        }

        try {
            const res = await api.getAIForecast(targetCrop);
            this.latestAIForecast = res;

            if (statsGrid) {
                statsGrid.innerHTML = `
                    <div class="farmer-ai-box">
                        <div class="lbl">${i18n.t("demand_score")}</div>
                        <div class="val">${res.demand_index} / 100</div>
                        <div class="sub">${res.demand_index >= 75 ? '🔥 ' + i18n.t("high_demand") : '⚖️ ' + i18n.t("moderate_demand")}</div>
                    </div>
                    <div class="farmer-ai-box">
                        <div class="lbl">${i18n.t("retail_guidance")}</div>
                        <div class="val">${res.price_guidance.recommended_retail_slab}</div>
                        <div class="sub">${i18n.t("slab_tier_retail")}</div>
                    </div>
                    <div class="farmer-ai-box">
                        <div class="lbl">${i18n.t("bulk_guidance")}</div>
                        <div class="val">${res.price_guidance.recommended_bulk_slab}</div>
                        <div class="sub">${i18n.t("slab_tier_bulk")}</div>
                    </div>
                    <div class="farmer-ai-box">
                        <div class="lbl">${i18n.t("msp_baseline")}</div>
                        <div class="val" style="color: #0284c7;">₹${res.price_guidance.government_msp} / kg</div>
                        <div class="sub">${i18n.t("lbl_trend")}: ${i18n.translateTrend ? i18n.translateTrend(res.price_guidance.trend) : res.price_guidance.trend}</div>
                    </div>
                `;
            }

            if (insightEl) {
                const outlookLabel = i18n.t("ai_outlook_label");
                const outlookText = i18n.translateInsight ? i18n.translateInsight(res.market_insights, targetCrop) : res.market_insights;
                const comparisonText = i18n.t("ai_fair_price_comparison");
                insightEl.innerHTML = `💡 <strong>${outlookLabel}:</strong> ${outlookText}. ${comparisonText}`;
            }
        } catch (err) {
            console.error("Farmer AI forecast error:", err);
            if (statsGrid) statsGrid.innerHTML = `<div class="text-muted small">${i18n.t("ai_error_hint")}</div>`;
        }
    },

    applyAIPricesToSlabs() {
        if (!this.latestAIForecast) {
            window.showToast("Please wait for AI forecast to load.", "warning");
            return;
        }

        const guidance = this.latestAIForecast.price_guidance;
        const retailStr = guidance.recommended_retail_slab.replace(/[^0-9.]/g, "");
        const bulkStr = guidance.recommended_bulk_slab.replace(/[^0-9.]/g, "");

        const retailPrice = parseFloat(retailStr) || 48.0;
        const bulkPrice = parseFloat(bulkStr) || 40.0;
        const midPrice = Math.round(((retailPrice + bulkPrice) / 2) * 10) / 10;

        this.currentSlabs = [
            { min_quantity: 0, max_quantity: 10, price_per_kg: retailPrice },
            { min_quantity: 10, max_quantity: 50, price_per_kg: midPrice },
            { min_quantity: 50, max_quantity: null, price_per_kg: bulkPrice }
        ];

        // Also prefill crop name if empty
        const cropInput = document.getElementById("prod_name");
        if (cropInput && !cropInput.value) {
            cropInput.value = this.latestAIForecast.commodity;
        }

        this.renderSlabInputs();
        window.showToast(`Applied AI recommended slabs for ${this.latestAIForecast.commodity}!`, "success");
    },

    // --- Slab Pricing Builder ---
    renderSlabInputs() {
        const container = document.getElementById("slabListContainer");
        if (!container) return;

        container.innerHTML = "";
        this.currentSlabs.forEach((slab, index) => {
            const row = document.createElement("div");
            row.className = "slab-input-row";
            row.innerHTML = `
                <div class="slab-col">
                    <label class="small text-muted">${i18n.t("lbl_min_qty")}</label>
                    <input type="number" step="0.5" class="form-control slab-min" value="${slab.min_quantity}" onchange="FarmerController.updateSlab(${index}, 'min_quantity', this.value)" required>
                </div>
                <div class="slab-col">
                    <label class="small text-muted">${i18n.t("lbl_max_qty")}</label>
                    <input type="number" step="0.5" class="form-control slab-max" placeholder="${i18n.t("ph_no_limit")}" value="${slab.max_quantity !== null ? slab.max_quantity : ''}" onchange="FarmerController.updateSlab(${index}, 'max_quantity', this.value)">
                </div>
                <div class="slab-col">
                    <label class="small text-muted">${i18n.t("lbl_price_kg")}</label>
                    <input type="number" step="0.5" class="form-control slab-price" value="${slab.price_per_kg}" onchange="FarmerController.updateSlab(${index}, 'price_per_kg', this.value)" required>
                </div>
                <div class="slab-col-action">
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="FarmerController.removeSlab(${index})" title="Remove Slab" ${this.currentSlabs.length <= 1 ? 'disabled' : ''}>✕</button>
                </div>
            `;
            container.appendChild(row);
        });
    },

    addSlabRow() {
        const last = this.currentSlabs[this.currentSlabs.length - 1];
        const newMin = last && last.max_quantity ? parseFloat(last.max_quantity) : (last ? parseFloat(last.min_quantity) + 50 : 0);
        this.currentSlabs.push({
            min_quantity: newMin,
            max_quantity: null,
            price_per_kg: last ? Math.max(10, last.price_per_kg - 5) : 30
        });
        this.renderSlabInputs();
    },

    removeSlab(index) {
        if (this.currentSlabs.length > 1) {
            this.currentSlabs.splice(index, 1);
            this.renderSlabInputs();
        }
    },

    updateSlab(index, key, val) {
        if (key === "max_quantity") {
            this.currentSlabs[index][key] = val.trim() === "" ? null : parseFloat(val);
        } else {
            this.currentSlabs[index][key] = parseFloat(val) || 0;
        }
    },

    // --- Add Produce ---
    async handleAddProduct(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user || user.role !== "farmer") {
            window.showToast("Please log in as a Farmer first.", "error");
            window.showLoginModal("farmer");
            return;
        }

        const name = document.getElementById("prod_name").value.trim();
        const category = document.getElementById("prod_category").value;
        const variety = document.getElementById("prod_variety").value.trim();
        const grade = document.getElementById("prod_grade").value;
        const quantity = parseFloat(document.getElementById("prod_qty").value);
        const description = document.getElementById("prod_desc").value.trim();
        const image_url = document.getElementById("prod_image").value.trim();

        const payload = {
            farmer_id: user.id,
            name,
            category,
            variety,
            grade,
            available_quantity: quantity,
            unit: "kg",
            description,
            image_url,
            slabs: this.currentSlabs
        };

        try {
            const res = await api.addProduct(payload);
            window.showToast(res.message, "success");
            document.getElementById("addProductForm").reset();
            this.currentSlabs = [
                { min_quantity: 0, max_quantity: 10, price_per_kg: 40 },
                { min_quantity: 10, max_quantity: 50, price_per_kg: 35 },
                { min_quantity: 50, max_quantity: null, price_per_kg: 30 }
            ];
            this.renderSlabInputs();
            this.loadMyProducts();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    // --- Load My Products ---
    async loadMyProducts() {
        const user = api.currentUser;
        if (!user) return;

        const container = document.getElementById("farmerProductsGrid");
        if (!container) return;

        container.innerHTML = `<div class="loader-spinner py-3">...</div>`;

        try {
            const res = await api.getProducts({ farmer_id: user.id });
            const prods = res.products || [];

            if (prods.length === 0) {
                container.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-icon">🌾</div>
                        <h3>${i18n.t("empty_no_produce")}</h3>
                        <p>${i18n.t("empty_no_produce_desc")}</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = prods.map(p => `
                <div class="produce-card">
                    <div class="produce-img-wrap">
                        <img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600'">
                        <span class="grade-tag grade-${p.grade.toLowerCase().replace(' ', '-')}">${p.grade}</span>
                        <span class="category-badge">${p.category}</span>
                    </div>
                    <div class="produce-content">
                        <h4 class="crop-title">${p.name}</h4>
                        <div class="variety-sub">${i18n.t("lbl_crop_variety").replace('*', '')}: <strong>${p.variety}</strong></div>
                        <p class="produce-desc">${p.description || 'Farm-fresh harvest, directly sourced.'}</p>
                        
                        <div class="stock-pill">
                            📦 ${i18n.t("lbl_qty_available").replace('*', '')}: <strong>${p.available_quantity} ${p.unit}</strong>
                        </div>

                        <!-- Slab Breakdown -->
                        <div class="slab-pills-box">
                            <span class="slab-badge-title">${i18n.t("slab_pricing_title")}:</span>
                            <div class="slab-pills-list">
                                ${p.slabs.map(s => `
                                    <span class="slab-chip">
                                        ${s.min_quantity}${s.max_quantity ? '-' + s.max_quantity : '+'} kg: <strong>₹${s.price_per_kg}</strong>/kg
                                    </span>
                                `).join('')}
                            </div>
                        </div>

                        <div class="card-footer-actions">
                            <span class="date-tag">${p.created_at ? p.created_at.split(' ')[0] : 'Recently'}</span>
                            <button class="btn btn-sm btn-outline-danger" onclick="FarmerController.deleteProduce(${p.id})">Remove</button>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<div class="error-box">Failed to load produce: ${err.message}</div>`;
        }
    },

    async deleteProduce(id) {
        if (!confirm("Are you sure you want to remove this product listing?")) return;
        try {
            await api.deleteProduct(id);
            window.showToast("Product listing removed.", "info");
            this.loadMyProducts();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    // --- Load Farmer Orders ---
    async loadOrders() {
        const user = api.currentUser;
        if (!user) return;

        const container = document.getElementById("farmerOrdersTableBody");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="7" class="text-center py-4">Loading...</td></tr>`;

        try {
            const res = await api.getOrders({ farmer_id: user.id });
            const orders = res.orders || [];

            if (orders.length === 0) {
                container.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">${i18n.t("empty_no_orders")}</td></tr>`;
                return;
            }

            container.innerHTML = orders.map(o => {
                let statusBadge = "";
                if (o.status === "delivered") {
                    statusBadge = `
                        <span class="badge-delivered-yellow">
                            <span class="timer-icon">⏳</span> 
                            ${i18n.t("status_delivered")} (${o.remaining_days}d ${o.remaining_hours}h left)
                        </span>
                    `;
                } else if (o.status === "completed") {
                    statusBadge = `
                        <span class="badge-delivered-green">
                            <span class="check-icon">✅</span> ${i18n.t("status_completed")}
                        </span>
                    `;
                } else if (o.status === "returned") {
                    statusBadge = `
                        <span class="badge-returned-red">
                            <span class="return-icon">⚠️</span> ${i18n.t("status_returned")} (${o.return_reason === 'wrong_item' ? i18n.t("opt_wrong_item") : i18n.t("opt_damaged_item")})
                        </span>
                    `;
                } else if (o.status === "shipped") {
                    statusBadge = `<span class="badge-shipped">🚚 ${i18n.t("status_shipped")}</span>`;
                } else if (o.status === "pickup_complete") {
                    statusBadge = `<span class="badge-pickup">📦 ${i18n.t("status_pickup")}</span>`;
                } else {
                    statusBadge = `<span class="badge-ordered">📋 ${i18n.t("status_ordered")}</span>`;
                }

                return `
                    <tr>
                        <td>
                            <strong>#${o.order_number}</strong><br>
                            <span class="small text-muted">${o.created_at ? o.created_at.split(' ')[0] : ''}</span>
                        </td>
                        <td>
                            <strong>${o.product_name}</strong><br>
                            <span class="small text-muted">₹${o.price_per_kg}/kg</span>
                        </td>
                        <td>
                            <strong>${o.buyer_name}</strong><br>
                            <span class="small text-muted">📱 ${o.buyer_mobile || 'Confidential'}</span>
                        </td>
                        <td>
                            <strong>${o.quantity} kg</strong><br>
                            <span class="text-success font-weight-bold">₹${o.total_amount}</span>
                        </td>
                        <td>
                            <span class="small location-cell" title="${o.delivery_location}">📍 ${o.delivery_location}</span>
                        </td>
                        <td>
                            ${statusBadge}
                        </td>
                        <td>
                            <div class="btn-group-actions">
                                ${o.status === 'ordered' ? `
                                    <button class="btn btn-xs btn-outline-primary" onclick="FarmerController.progressOrder(${o.id}, 'pickup_complete', 'Produce packaged & handed to carrier')">${i18n.t("btn_mark_pickup")}</button>
                                ` : ''}
                                ${o.status === 'pickup_complete' ? `
                                    <button class="btn btn-xs btn-outline-info" onclick="FarmerController.progressOrder(${o.id}, 'shipped', 'Consignment dispatched via highway hub')">${i18n.t("btn_mark_shipped")}</button>
                                ` : ''}
                                ${o.status === 'shipped' ? `
                                    <button class="btn btn-xs btn-warning text-dark font-weight-bold" onclick="FarmerController.progressOrder(${o.id}, 'delivered', 'Safely delivered to customer. 7-day inspection period starts now.')">${i18n.t("btn_mark_delivered")}</button>
                                ` : ''}
                                <button class="btn btn-xs btn-light" onclick="window.showTrackingModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">${i18n.t("btn_tracking")}</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<tr><td colspan="7" class="text-danger py-4 text-center">Error loading orders: ${err.message}</td></tr>`;
        }
    },

    async progressOrder(orderId, nextStatus, note) {
        try {
            const res = await api.updateOrderStatus(orderId, nextStatus, note);
            window.showToast(res.message, "success");
            this.loadOrders();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    // --- Support & Grievances ---
    async handleRaiseTicket(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user) return;

        const target = document.getElementById("farmer_target_entity").value;
        const subject = document.getElementById("farmer_ticket_subject").value.trim();
        const description = document.getElementById("farmer_ticket_desc").value.trim();
        const expected_resolution = document.getElementById("farmer_ticket_resolution").value.trim();
        const fileInput = document.getElementById("farmer_ticket_file");

        let attachment_url = "";
        if (fileInput && fileInput.files[0]) {
            try {
                window.showToast("Uploading grievance proof...", "info");
                const uploadRes = await api.uploadFile(fileInput.files[0]);
                attachment_url = uploadRes.url;
            } catch (err) {
                window.showToast("Failed to upload file attachment: " + err.message, "error");
                return;
            }
        }

        try {
            const res = await api.raiseTicket({
                user_id: user.id,
                role: "farmer",
                target_entity: target,
                subject,
                description,
                expected_resolution,
                attachment_url
            });
            window.showToast(res.message, "success");
            document.getElementById("farmerSupportForm").reset();
            this.loadTickets();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    async loadTickets() {
        const user = api.currentUser;
        if (!user) return;

        const container = document.getElementById("farmerTicketsList");
        if (!container) return;

        try {
            const res = await api.getTickets(user.id);
            const tickets = res.tickets || [];

            if (tickets.length === 0) {
                container.innerHTML = `<p class="text-muted small">${i18n.t("empty_no_tickets")}</p>`;
                return;
            }

            container.innerHTML = tickets.map(t => `
                <div class="ticket-card ${t.status === 'Resolved' ? 'ticket-resolved' : 'ticket-pending'}">
                    <div class="ticket-header">
                        <div>
                            <strong>#${t.ticket_number}</strong>: ${t.subject}
                            <div class="small text-muted">${t.target_entity.toUpperCase()} • ${t.created_at ? t.created_at.split(' ')[0] : 'Recently'}</div>
                        </div>
                        <span class="status-badge status-${t.status.toLowerCase().replace(/ /g, '-')}">${t.status}</span>
                    </div>
                    <p class="ticket-desc"><strong>Issue:</strong> ${t.description}</p>
                    <div class="ticket-resolution-expect">
                        <strong>Expected:</strong> ${t.expected_resolution}
                    </div>
                    ${t.attachment_url ? `
                        <div class="ticket-proof">
                            <a href="${t.attachment_url}" target="_blank" class="proof-link">📎 View Attached Proof</a>
                        </div>
                    ` : ''}
                    ${t.admin_resolution_notes ? `
                        <div class="ministry-resolution-box">
                            <div class="ministry-badge">🏛️ Ministry of Agriculture Resolution:</div>
                            <p>${t.admin_resolution_notes}</p>
                            <span class="resolved-date">Resolved on: ${t.resolved_at || 'Recorded'}</span>
                        </div>
                    ` : `
                        <div class="pending-notice">
                            ⏳ Under Ministry Agriculture Dispute desk review.
                        </div>
                    `}
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<p class="text-danger small">Failed to load support tickets: ${err.message}</p>`;
        }
    },

    // --- Profile ---
    async loadProfile() {
        const user = api.currentUser;
        if (!user) return;

        const nameEl = document.getElementById("farmer_prof_name");
        const mobileEl = document.getElementById("farmer_prof_mobile");
        const stateEl = document.getElementById("farmer_prof_state");
        const distEl = document.getElementById("farmer_prof_district");
        const villEl = document.getElementById("farmer_prof_village");
        const pinEl = document.getElementById("farmer_prof_pincode");

        if (nameEl) nameEl.value = user.name || "";
        if (mobileEl) mobileEl.value = user.mobile || "";
        if (stateEl) stateEl.value = user.state || "";
        if (distEl) distEl.value = user.district || "";
        if (villEl) villEl.value = user.village || "";
        if (pinEl) pinEl.value = user.pincode || "";
    },

    async handleUpdateProfile(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user) return;

        const name = document.getElementById("farmer_prof_name").value.trim();
        const state = document.getElementById("farmer_prof_state").value.trim();
        const district = document.getElementById("farmer_prof_district").value.trim();
        const village = document.getElementById("farmer_prof_village").value.trim();
        const pincode = document.getElementById("farmer_prof_pincode").value.trim();

        try {
            const res = await api.updateProfile({
                user_id: user.id,
                name, state, district, village, pincode
            });
            api.setUser(res.user);
            window.showToast("Farmer profile updated successfully!", "success");
            window.updateUserDisplay();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    }
};

// Re-render dynamic farmer sections whenever the user switches language
window.addEventListener("languageChanged", () => {
    FarmerController.renderSlabInputs();
    FarmerController.loadFarmerAIForecast();
    FarmerController.loadMyProducts();
    FarmerController.loadOrders();
    FarmerController.loadTickets();
});

window.FarmerController = FarmerController;
