/**
 * KisanSetu - Buyer / Bulk Buyer Controller
 * Handles:
 * 1. Location-Prioritized Marketplace (Buyer's State -> Adjacent States -> National)
 * 2. Dynamic Slab Price Calculator based on user-entered quantity
 * 3. Direct Farm Purchase / Order Checkout
 * 4. My Orders with Tracking and 7-Day Return Request (wrong item / damaged item only)
 * 5. Support & Grievances to Ministry
 * 6. Profile Management
 * 7. Real-time language re-rendering across all dynamic components
 */

const BuyerController = {
    selectedProductForOrder: null,
    selectedOrderForReturn: null,

    init() {
        this.loadMarketplace();
        this.loadMyOrders();
        this.loadTickets();
        this.loadProfile();
    },

    // --- Marketplace ---
    async loadMarketplace() {
        const user = api.currentUser;
        const buyerState = user ? user.state : "";
        const searchInput = document.getElementById("buyerSearchInput");
        const qtyInput = document.getElementById("buyerQtyInput");
        const categoryFilter = document.getElementById("buyerCategoryFilter");

        const search = searchInput ? searchInput.value.trim() : "";
        const quantity = qtyInput ? parseFloat(qtyInput.value) || 1 : 1;
        const category = categoryFilter ? categoryFilter.value : "";

        const container = document.getElementById("buyerMarketplaceGrid");
        if (!container) return;

        container.innerHTML = `<div class="loader-spinner py-3">Loading fresh farm produce...</div>`;

        try {
            const res = await api.getProducts({
                buyer_state: buyerState,
                search,
                quantity,
                category
            });

            const prods = res.products || [];
            if (prods.length === 0) {
                container.innerHTML = `
                    <div class="empty-state-card col-12">
                        <div class="empty-icon">🌾</div>
                        <h3>${i18n.t("empty_no_marketplace")}</h3>
                    </div>
                `;
                return;
            }

            container.innerHTML = prods.map(p => {
                let proximityClass = "prox-national";
                if (p.proximity_tier === 0) proximityClass = "prox-local";
                else if (p.proximity_tier === 1) proximityClass = "prox-neighbor";

                return `
                    <div class="buyer-product-card ${proximityClass}">
                        <div class="buyer-img-box">
                            <img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600'">
                            <span class="proximity-badge ${proximityClass}">📍 ${p.proximity_label}</span>
                            <span class="grade-badge">${p.grade}</span>
                        </div>
                        <div class="buyer-card-body">
                            <div class="crop-header">
                                <h4 class="crop-name">${p.name}</h4>
                                <span class="farmer-name">👨‍🌾 ${p.farmer_name} (${p.farmer_district}, ${p.farmer_state})</span>
                            </div>
                            
                            <div class="variety-row">
                                <span>${i18n.t("lbl_crop_variety").replace('*', '')}: <strong>${p.variety}</strong></span> • <span>${i18n.t("lbl_qty_available").replace('*', '')}: <strong>${p.available_quantity} ${p.unit}</strong></span>
                            </div>

                            <!-- Dynamic Price calculation based on entered quantity -->
                            <div class="dynamic-price-box">
                                <div class="price-header-row">
                                    <div>
                                        <span class="slab-price-val">₹${p.current_unit_price}</span> <span class="unit-text">/ kg</span>
                                        <div class="active-slab-note">${i18n.t("lbl_applicable_slab")} (${quantity} kg)</div>
                                    </div>
                                    <div class="total-calc-box text-right">
                                        <div class="small text-muted">${i18n.t("th_total")}</div>
                                        <strong class="total-amount">₹${p.total_estimated_price}</strong>
                                    </div>
                                </div>

                                <!-- Slab breakdown pills -->
                                <div class="slab-chips-summary">
                                    ${p.slabs.map(s => {
                                        const isMatching = quantity >= s.min_quantity && (s.max_quantity === null || quantity <= s.max_quantity);
                                        return `
                                            <span class="mini-slab-chip ${isMatching ? 'chip-active' : ''}">
                                                ${s.min_quantity}${s.max_quantity ? '-' + s.max_quantity : '+'} kg: ₹${s.price_per_kg}
                                            </span>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <button class="btn btn-block btn-buy-direct" onclick="BuyerController.openBuyModal(${JSON.stringify(p).replace(/"/g, '&quot;')}, ${quantity})">
                                ${i18n.t("btn_buy_direct")}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<div class="error-box col-12">Failed to load marketplace: ${err.message}</div>`;
        }
    },

    // --- Place Order Modal ---
    openBuyModal(product, quantity) {
        const user = api.currentUser;
        if (!user || user.role !== "buyer") {
            window.showToast("Please log in as a Buyer to place direct farm orders.", "warning");
            window.showLoginModal("buyer");
            return;
        }

        this.selectedProductForOrder = product;
        document.getElementById("modal_order_crop").textContent = product.name;
        document.getElementById("modal_order_farmer").textContent = `${product.farmer_name} (${product.farmer_district}, ${product.farmer_state})`;
        document.getElementById("modal_order_qty").value = quantity || 10;
        this.updateModalOrderCalculations();

        // Prefill delivery address
        const defaultAddr = `${user.village ? user.village + ', ' : ''}${user.district || ''}, ${user.state || ''} - ${user.pincode || ''}`;
        document.getElementById("modal_order_location").value = defaultAddr;

        const modal = document.getElementById("placeOrderModal");
        if (modal) modal.classList.add("active");
    },

    updateModalOrderCalculations() {
        if (!this.selectedProductForOrder) return;
        const qty = parseFloat(document.getElementById("modal_order_qty").value) || 1;
        const slabs = this.selectedProductForOrder.slabs || [];

        let unitPrice = slabs[0] ? slabs[0].price_per_kg : 40;
        for (const s of slabs) {
            if (qty >= s.min_quantity && (s.max_quantity === null || qty <= s.max_quantity)) {
                unitPrice = s.price_per_kg;
                break;
            } else if (qty >= s.min_quantity) {
                unitPrice = s.price_per_kg;
            }
        }

        const total = (unitPrice * qty).toFixed(2);
        document.getElementById("modal_order_unit_price").textContent = `₹${unitPrice} / kg`;
        document.getElementById("modal_order_total").textContent = `₹${total}`;
    },

    closeOrderModal() {
        const modal = document.getElementById("placeOrderModal");
        if (modal) modal.classList.remove("active");
        this.selectedProductForOrder = null;
    },

    async submitDirectOrder(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user) return;

        const qty = parseFloat(document.getElementById("modal_order_qty").value);
        const location = document.getElementById("modal_order_location").value.trim();

        if (!qty || qty <= 0 || !location) {
            window.showToast("Please enter a valid quantity and complete delivery location.", "error");
            return;
        }

        try {
            const res = await api.createOrder({
                product_id: this.selectedProductForOrder.id,
                buyer_id: user.id,
                quantity: qty,
                delivery_location: location
            });

            window.showToast(res.message, "success");
            this.closeOrderModal();
            this.loadMyOrders();
            // Switch to My Orders tab
            window.showBuyerTab("orders");

            // Live Cross-Panel Propagation: update Farmer Dashboard & Logistics Dispatch Queue
            window.dispatchEvent(new CustomEvent("kisansetu:order_placed", { detail: res.order }));
            if (window.FarmerController && typeof window.FarmerController.loadOrders === "function") {
                window.FarmerController.loadOrders();
            }
            if (window.LogisticsHook && typeof window.LogisticsHook.loadHubOperations === "function") {
                window.LogisticsHook.loadHubOperations();
            }
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    // --- My Orders & 7-Day Returns ---
    async loadMyOrders() {
        const user = api.currentUser;
        if (!user) return;

        const container = document.getElementById("buyerOrdersTableBody");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="9" class="text-center py-4">Loading...</td></tr>`;

        try {
            const res = await api.getOrders({ buyer_id: user.id });
            const orders = res.orders || [];

            if (orders.length === 0) {
                container.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">${i18n.t("empty_no_buyer_orders")}</td></tr>`;
                return;
            }

            container.innerHTML = orders.map(o => {
                let statusBadge = "";
                let returnActionBtn = "";

                if (o.status === "delivered") {
                    statusBadge = `
                        <span class="badge-delivered-yellow">
                            <span class="timer-icon">⏳</span> 
                            ${i18n.t("status_delivered")} (${o.remaining_days}d ${o.remaining_hours}h left)
                        </span>
                    `;
                    if (o.can_return) {
                        returnActionBtn = `
                            <button class="btn btn-xs btn-outline-danger" onclick="BuyerController.openReturnModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                                ${i18n.t("btn_raise_return")}
                            </button>
                        `;
                    }
                } else if (o.status === "completed") {
                    statusBadge = `
                        <span class="badge-delivered-green">
                            <span class="check-icon">✅</span> ${i18n.t("status_completed")}
                        </span>
                    `;
                    returnActionBtn = `<span class="small text-muted">${i18n.t("status_completed")}</span>`;
                } else if (o.status === "returned") {
                    statusBadge = `
                        <span class="badge-returned-red">
                            <span class="return-icon">🛑</span> ${i18n.t("status_returned")} (${o.return_reason === 'wrong_item' ? i18n.t("opt_wrong_item") : i18n.t("opt_damaged_item")})
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
                            <strong>#${o.order_number}</strong>
                        </td>
                        <td>${o.created_at ? o.created_at.split(' ')[0] : 'Today'}</td>
                        <td>
                            <strong>${o.product_name}</strong>
                        </td>
                        <td>
                            👨‍🌾 ${o.farmer_name}
                            <div class="small text-muted">${o.farmer_state || ''}</div>
                        </td>
                        <td><strong>${o.quantity} kg</strong></td>
                        <td>₹${o.price_per_kg}</td>
                        <td><strong class="text-success">₹${o.total_amount}</strong></td>
                        <td>
                            ${statusBadge}
                        </td>
                        <td>
                            <div class="btn-group-actions">
                                <button class="btn btn-xs btn-outline-primary" onclick="window.showTrackingModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                                    🚛 ${i18n.t("btn_track_order")}
                                </button>
                                ${returnActionBtn}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<tr><td colspan="9" class="text-danger py-4 text-center">Error loading orders: ${err.message}</td></tr>`;
        }
    },

    // --- Return Modal Logic ---
    openReturnModal(order) {
        this.selectedOrderForReturn = order;
        document.getElementById("modal_return_order_num").textContent = order.order_number;
        document.getElementById("modal_return_crop").textContent = order.product_name;
        document.getElementById("modal_return_farmer").textContent = order.farmer_name;

        const modal = document.getElementById("returnOrderModal");
        if (modal) modal.classList.add("active");
    },

    closeReturnModal() {
        const modal = document.getElementById("returnOrderModal");
        if (modal) modal.classList.remove("active");
        this.selectedOrderForReturn = null;
    },

    async submitReturnRequest(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user || !this.selectedOrderForReturn) return;

        const reason = document.getElementById("return_reason_select").value;
        const fileInput = document.getElementById("return_proof_file");

        if (reason !== "wrong_item" && reason !== "damaged_item") {
            window.showToast("Return is strictly valid for: 'Wrong Item Delivered' or 'Damaged Item Delivered'.", "error");
            return;
        }

        let proofUrl = "";
        if (fileInput && fileInput.files[0]) {
            try {
                window.showToast("Uploading inspection damage proof...", "info");
                const uploadRes = await api.uploadFile(fileInput.files[0]);
                proofUrl = uploadRes.url;
            } catch (err) {
                window.showToast("Failed to upload proof photo: " + err.message, "error");
                return;
            }
        }

        try {
            const res = await api.requestReturn(
                this.selectedOrderForReturn.id,
                user.id,
                reason,
                proofUrl
            );

            window.showToast(res.message, "success");
            this.closeReturnModal();
            this.loadMyOrders();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    // --- Buyer Support ---
    async handleRaiseTicket(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user) return;

        const target = document.getElementById("buyer_target_entity").value;
        const subject = document.getElementById("buyer_ticket_subject").value.trim();
        const description = document.getElementById("buyer_ticket_desc").value.trim();
        const expected_resolution = document.getElementById("buyer_ticket_resolution").value.trim();
        const fileInput = document.getElementById("buyer_ticket_file");

        let attachment_url = "";
        if (fileInput && fileInput.files[0]) {
            try {
                window.showToast("Uploading grievance proof...", "info");
                const uploadRes = await api.uploadFile(fileInput.files[0]);
                attachment_url = uploadRes.url;
            } catch (err) {
                window.showToast("File upload error: " + err.message, "error");
                return;
            }
        }

        try {
            const res = await api.raiseTicket({
                user_id: user.id,
                role: "buyer",
                target_entity: target,
                subject,
                description,
                expected_resolution,
                attachment_url
            });
            window.showToast(res.message, "success");
            document.getElementById("buyerSupportForm").reset();
            this.loadTickets();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    async loadTickets() {
        const user = api.currentUser;
        if (!user) return;

        const container = document.getElementById("buyerTicketsList");
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
                            <div class="small text-muted">${t.target_entity.toUpperCase()} • ${t.created_at ? t.created_at.split(' ')[0] : ''}</div>
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
                            <div class="ministry-badge">🏛️ Ministry Resolution:</div>
                            <p><strong>Action Taken:</strong> ${t.admin_resolution_notes}</p>
                            <span class="resolved-date">Resolved on: ${t.resolved_at || 'Recorded'}</span>
                        </div>
                    ` : `
                        <div class="pending-notice">
                            ⏳ Under Ministry review for prompt consumer protection.
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

        const nameEl = document.getElementById("buyer_prof_name");
        const mobileEl = document.getElementById("buyer_prof_mobile");
        const stateEl = document.getElementById("buyer_prof_state");
        const distEl = document.getElementById("buyer_prof_district");
        const pinEl = document.getElementById("buyer_prof_pincode");

        if (nameEl) nameEl.value = user.name || "";
        if (mobileEl) mobileEl.value = user.mobile || "";
        if (stateEl) stateEl.value = user.state || "";
        if (distEl) distEl.value = user.district || "";
        if (pinEl) pinEl.value = user.pincode || "";
    },

    async handleUpdateProfile(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user) return;

        const name = document.getElementById("buyer_prof_name").value.trim();
        const state = document.getElementById("buyer_prof_state").value.trim();
        const district = document.getElementById("buyer_prof_district").value.trim();
        const pincode = document.getElementById("buyer_prof_pincode").value.trim();

        try {
            const res = await api.updateProfile({
                user_id: user.id,
                name, state, district, pincode
            });
            api.setUser(res.user);
            window.showToast("Buyer profile updated successfully!", "success");
            window.updateUserDisplay();
            this.loadMarketplace();
        } catch (err) {
            window.showToast(err.message, "error");
        }
    }
};

// Re-render dynamic buyer sections whenever user changes language
window.addEventListener("languageChanged", () => {
    BuyerController.loadMarketplace();
    BuyerController.loadMyOrders();
    BuyerController.loadTickets();
});

window.BuyerController = BuyerController;
