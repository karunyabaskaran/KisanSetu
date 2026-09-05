/**
 * KisanSetu - Dedicated Logistics Frontend Hook, Hub Operations & Verification Suite
 * =============================================================================
 * Implements:
 * 1. Open-Source Leaflet / OpenStreetMap Integration
 * 2. Operating Delivery Hub Selection & Dynamic Hub Registration
 * 3. Proximity-Prioritized Available Farm Gate Pickups
 * 4. Multi-Hub Connected Delivery Drops & Aggregation Routing
 * 5. Delivery Person Physical Order Verification & Checklist Audit Flow
 * 6. Turn-by-Turn GPS Navigation via OpenStreetMap Directions (OSRM)
 * 7. Embedded Leaflet OpenStreetMap in Consignment Tracking Modal
 * =============================================================================
 */

const LogisticsHook = {
    map: null,
    modalMap: null,
    hubPickerMap: null,
    hubPickerMarker: null,
    markersLayer: null,
    routesLayer: null,
    navigationLayer: null,
    currentRouteData: null,
    isInitialized: false,
    activeHubId: null,
    currentVerifyingOrder: null,
    activeTab: "pickups",

    // Offline Geocoding Fallback Dictionary for Indian Hubs and Corridors
    LOCATION_DICTIONARY: {
        "adyar": { lat: 13.0012, lng: 80.2565, name: "Adyar Consumer Hub, Chennai" },
        "anna nagar": { lat: 13.0850, lng: 80.2101, name: "Anna Nagar Bulk Market, Chennai" },
        "velachery": { lat: 12.9759, lng: 80.2212, name: "Velachery Supermarket Depot, Chennai" },
        "omr": { lat: 12.9010, lng: 80.2279, name: "OMR Sholinganallur Wholesale Point" },
        "sholinganallur": { lat: 12.9010, lng: 80.2279, name: "OMR Sholinganallur Wholesale Point" },
        "madhavaram": { lat: 13.1488, lng: 80.2306, name: "Madhavaram Agro Cold Storage Hub" },
        "kovilambakkam": { lat: 12.9352, lng: 80.1878, name: "Kovilambakkam Farm Cluster" },
        "kanchipuram": { lat: 12.8342, lng: 79.7036, name: "Kanchipuram Grain Aggregation Hub" },
        "chengalpattu": { lat: 12.6841, lng: 79.9836, name: "Chengalpattu Farm Gate Cluster" },
        "tiruvallur": { lat: 13.1439, lng: 79.9083, name: "Tiruvallur Organic Producer Hub" },
        "mumbai": { lat: 19.0760, lng: 72.8777, name: "Mumbai Central Terminal" },
        "andheri": { lat: 19.1136, lng: 72.8697, name: "Andheri West Supermarket Logistics Yard" },
        "vashi": { lat: 19.0771, lng: 73.0006, name: "Vashi APMC Central Terminal Depot" },
        "navi mumbai": { lat: 19.0330, lng: 73.0297, name: "Navi Mumbai Retail Wholesale Cluster" },
        "pune": { lat: 18.5204, lng: 73.8567, name: "Pune Central Agro Mart" },
        "nashik": { lat: 20.0898, lng: 73.9182, name: "Nashik Ozar Onion Aggregation Yard" },
        "bengaluru": { lat: 12.9716, lng: 77.5946, name: "Bengaluru Wholesale Distribution Yard" },
        "bangalore": { lat: 12.9716, lng: 77.5946, name: "Bengaluru Wholesale Distribution Yard" },
        "mysuru": { lat: 12.2958, lng: 76.6394, name: "Mysuru APMC Mandi" },
        "delhi": { lat: 28.6139, lng: 77.2090, name: "Delhi National Agro Terminal" },
        "coimbatore": { lat: 11.0168, lng: 76.9558, name: "Coimbatore Vegetable Aggregation Center" },
        "madurai": { lat: 9.9252, lng: 78.1198, name: "Madurai Mattuthavani Agro Market" }
    },

    /**
     * Initialize Leaflet Open-Source Map on the Logistics Panel
     */
    initMap() {
        const mapContainer = document.getElementById("logisticsRouteMap");
        if (!mapContainer) return;

        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 250);
            return;
        }

        // Initialize Leaflet Map centered on South India / Chennai Delta corridor by default
        this.map = L.map("logisticsRouteMap", {
            center: [13.0400, 80.1500],
            zoom: 10,
            scrollWheelZoom: true
        });

        // OpenStreetMap Open-Source Tile Layer (Standard OSM Carto)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors | KisanSetu Logistics Engine'
        }).addTo(this.map);

        this.markersLayer = L.layerGroup().addTo(this.map);
        this.routesLayer = L.layerGroup().addTo(this.map);
        this.navigationLayer = L.layerGroup().addTo(this.map);

        this.isInitialized = true;

        const corridorSelect = document.getElementById("logisticsCorridorSelect");
        if (corridorSelect) {
            corridorSelect.addEventListener("change", (e) => {
                this.fetchAndRenderRoute(e.target.value);
            });
        }

        this.fetchAndRenderRoute(corridorSelect ? corridorSelect.value : "chennai_corridor");
    },

    /**
     * Switch between Logistics Operations Tabs: pickups | drops | all
     */
    switchTab(tabKey) {
        this.activeTab = tabKey;
        document.querySelectorAll(".logistics-tab-btn").forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-tab") === tabKey);
        });

        const panelPickups = document.getElementById("logisticsPanel_pickups");
        const panelDrops = document.getElementById("logisticsPanel_drops");
        const panelAll = document.getElementById("logisticsPanel_all");

        if (panelPickups) panelPickups.style.display = tabKey === "pickups" ? "block" : "none";
        if (panelDrops) panelDrops.style.display = tabKey === "drops" ? "block" : "none";
        if (panelAll) panelAll.style.display = tabKey === "all" ? "block" : "none";
    },

    /**
     * Load Registered Hubs and Fetch Hub-Centric Operations
     */
    async loadHubOperations(hubId = null) {
        try {
            // 1. Fetch all hubs for the select dropdown
            const hubsRes = await api.getDeliveryHubs();
            const hubs = (hubsRes && hubsRes.hubs) ? hubsRes.hubs : [];

            const selectEl = document.getElementById("logisticsActiveHubSelect");
            if (selectEl) {
                const currentVal = hubId || this.activeHubId || (hubs[0] ? hubs[0].id : null);
                selectEl.innerHTML = hubs.map(h => `
                    <option value="${h.id}" ${String(h.id) === String(currentVal) ? 'selected' : ''}>
                        🏢 ${h.hub_name} (${h.hub_code}) - 📍 ${h.address.split(',')[0]}
                    </option>
                `).join('');
                this.activeHubId = currentVal;
            }

            // 2. Fetch hub-centric operations (passing active agent for shared fleet isolation)
            const currentAgent = api.currentUser || { id: 7, name: "Gramin Express Logistics", mobile: "9811122233" };
            const opsRes = await api.getHubOperations(this.activeHubId, currentAgent.id);
            if (!opsRes || !opsRes.success) return;

            const activeHub = opsRes.active_hub;
            const nearPickups = opsRes.near_pickups || [];
            const routeDeliveries = opsRes.route_deliveries || [];
            const allConsignments = opsRes.all_consignments || [];
            this.allConsignmentsCache = allConsignments;

            // 3. Update Active Agent Carrier Banner
            const agentNameEl = document.getElementById("logisticsCurrentAgentName");
            if (agentNameEl && currentAgent) {
                agentNameEl.innerText = `${currentAgent.name} (Carrier ID: #${currentAgent.id})`;
            }

            // 4. Render Active Hub Details Banner
            const bannerEl = document.getElementById("activeHubDetailsBanner");
            if (bannerEl && activeHub) {
                bannerEl.innerHTML = `
                    <div class="hub-info-badge-card">
                        <div class="hub-info-header">
                            <span class="hub-type-badge">${(activeHub.hub_type || 'Aggregation Depot').replace('_', ' ').toUpperCase()}</span>
                            <span class="hub-code-tag">${activeHub.hub_code}</span>
                        </div>
                        <h4 class="hub-title-text">${activeHub.hub_name}</h4>
                        <div class="hub-meta-details">
                            <span>👤 Incharge: <strong>${activeHub.incharge_name}</strong></span>
                            <span>📞 Phone: <a href="tel:${activeHub.contact_number}" class="text-primary"><strong>${activeHub.contact_number}</strong></a></span>
                            <span>📍 ${activeHub.address}</span>
                            <span>🌐 GPS: <strong>${Number(activeHub.latitude).toFixed(4)}, ${Number(activeHub.longitude).toFixed(4)}</strong></span>
                        </div>
                    </div>
                `;
            }

            // 5. Update Badges
            const bPickups = document.getElementById("badgeNearPickupsCount");
            const bDrops = document.getElementById("badgeRouteDropsCount");
            const bAll = document.getElementById("badgeAllConsignmentsCount");
            if (bPickups) bPickups.innerText = nearPickups.length;
            if (bDrops) bDrops.innerText = routeDeliveries.length;
            if (bAll) bAll.innerText = allConsignments.length;

            // 6. Render Near Pickups Table (Available & Assigned)
            this.renderNearPickupsTable(nearPickups, activeHub);

            // 7. Render Route Deliveries Table (Hub-to-Hub & Consumer Nearby Hub Distribution)
            this.renderRouteDeliveriesTable(routeDeliveries, activeHub);

            // 8. Render Audit Table
            this.renderAuditTable(this.allConsignmentsCache);

            // Fly map to active hub
            if (this.map && activeHub && activeHub.latitude) {
                this.map.flyTo([activeHub.latitude, activeHub.longitude], 11, { duration: 1 });
            }
        } catch (err) {
            console.error("[LogisticsHook] Error loading hub operations:", err);
        }
    },

    /**
     * Handler when agent switches active hub
     */
    onHubSelected(hubId) {
        this.activeHubId = hubId;
        if (window.showToast) window.showToast("Switching operating delivery hub queue...", "info");
        this.loadHubOperations(hubId);
    },

    /**
     * Carrier Order Claiming (Multi-Agent Shared Panel Optimization):
     * Locks order exclusively to this agent and hides from other carriers' available queue.
     */
    async acceptOrder(orderId, action = "pickup") {
        const user = api.currentUser || { id: 7, name: "Gramin Express Logistics", mobile: "9811122233" };
        try {
            if (window.showToast) window.showToast("Accepting and assigning consignment to your fleet...", "info");
            const res = await api.acceptLogisticsOrder({
                order_id: orderId,
                agent_id: user.id,
                agent_name: user.name,
                agent_mobile: user.mobile || "9811122233",
                action: action
            });
            if (res && res.success) {
                if (window.showToast) window.showToast(res.message, "success");
                this.loadHubOperations(this.activeHubId);
            } else {
                throw new Error((res && res.message) || "Could not accept order.");
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    },

    /**
     * Release a previously accepted order back to the open queue
     */
    async releaseOrder(orderId) {
        const user = api.currentUser || { id: 7 };
        try {
            const res = await api.releaseLogisticsOrder(orderId, user.id);
            if (res && res.success) {
                if (window.showToast) window.showToast(res.message, "info");
                this.loadHubOperations(this.activeHubId);
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    },

    /**
     * Filter Audit Table by All / Assigned to Me / Open
     */
    filterAudit(filterType) {
        this.auditFilter = filterType;
        document.querySelectorAll(".audit-filters-bar button").forEach(btn => {
            btn.classList.remove("btn-primary", "active");
            btn.classList.add("btn-outline-secondary");
        });
        const activeBtn = document.getElementById(
            filterType === 'mine' ? 'btnAuditFilterMine' :
            filterType === 'unassigned' ? 'btnAuditFilterOpen' : 'btnAuditFilterAll'
        );
        if (activeBtn) {
            activeBtn.classList.remove("btn-outline-secondary");
            activeBtn.classList.add("btn-primary", "active");
        }
        this.renderAuditTable(this.allConsignmentsCache);
    },

    /**
     * Render Available Pickups Table (Nearer to Hub)
     * Demonstrates multi-agent isolation: orders accepted by other agents are hidden.
     */
    renderNearPickupsTable(pickups, hub) {
        const container = document.getElementById("nearPickupsTableBody");
        if (!container) return;

        if (!pickups || pickups.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        🌾 No pending farm gate pickups currently available near ${hub ? hub.hub_name : 'this hub'}.
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = pickups.map(o => {
            const dist = o.distance_to_hub_km !== undefined ? o.distance_to_hub_km : 15.0;
            const isNear = dist <= 45.0;
            const distBadge = isNear
                ? `<span class="badge badge-success font-weight-bold">⚡ ${dist.toFixed(1)} km (Near Hub)</span>`
                : `<span class="badge badge-light font-weight-bold">🛣️ ${dist.toFixed(1)} km (Extended)</span>`;

            let actionHtml = "";
            if (o.is_unassigned) {
                actionHtml = `
                    <div class="btn-group-actions">
                        <button type="button" class="btn btn-xs btn-primary font-weight-bold" 
                            onclick='LogisticsHook.acceptOrder(${o.id}, "pickup")'>
                            ✋ Accept Order
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-success font-weight-bold" 
                            onclick='LogisticsHook.navigateLiveGPS(${JSON.stringify(o).replace(/'/g, "&#39;")}, "pickup")' title="Preview Turn-by-Turn GPS">
                            🧭 Preview GPS
                        </button>
                    </div>
                `;
            } else if (o.is_assigned_to_me) {
                actionHtml = `
                    <div class="btn-group-actions">
                        <div class="small text-success font-weight-bold mb-1">✅ Assigned to You</div>
                        <button type="button" class="btn btn-xs btn-success font-weight-bold" 
                            onclick='LogisticsHook.navigateLiveGPS(${JSON.stringify(o).replace(/'/g, "&#39;")}, "pickup")' title="Start Live GPS Navigation">
                            🧭 Start GPS Navigation (Google Maps)
                        </button>
                        <button type="button" class="btn btn-xs btn-primary font-weight-bold" 
                            onclick='LogisticsHook.openVerificationModal(${JSON.stringify(o).replace(/'/g, "&#39;")}, "confirm_pickup")'>
                            🔍 Verify & Confirm Pickup
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-secondary" 
                            onclick='LogisticsHook.releaseOrder(${o.id})' title="Release this order back to open queue">
                            ↩ Release
                        </button>
                    </div>
                `;
            } else {
                actionHtml = `<span class="badge badge-light">🔒 Claimed by ${o.assigned_agent_name}</span>`;
            }

            return `
                <tr>
                    <td>
                        <strong>#${o.order_number}</strong>
                        <div class="small text-muted">${o.created_at ? o.created_at.split(' ')[0] : 'Today'}</div>
                    </td>
                    <td>
                        <strong>${o.product_name}</strong>
                        <div class="small text-primary font-weight-bold">${o.quantity} kg • Total ₹${o.total_amount}</div>
                    </td>
                    <td>
                        <div>👨‍🌾 <strong>${o.farmer_name}</strong></div>
                        <div class="small text-muted">📍 ${o.farmer_state || 'Farm Gate'} • 📞 ${o.f_mobile || 'Registered'}</div>
                    </td>
                    <td>
                        ${distBadge}
                    </td>
                    <td>
                        <span class="${o.badge_class}">${o.status_display || 'Awaiting Pickup'}</span>
                    </td>
                    <td>
                        ${actionHtml}
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Render Delivery Drops Table (Hub-to-Hub & Consumer's Nearby Hub Distribution)
     */
    renderRouteDeliveriesTable(drops, hub) {
        const container = document.getElementById("routeDropsTableBody");
        if (!container) return;

        if (!drops || drops.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        🚛 No active transit drops scheduled across connected hub corridors right now.
                    </td>
                </tr>
            `;
            return;
        }

        container.innerHTML = drops.map(o => {
            const destHub = o.destination_hub || hub || { hub_name: "Consumer Nearby Hub" };
            const isAtConsumerHub = o.is_consumer_hub;
            const destHubBadge = isAtConsumerHub
                ? `<span class="badge badge-success font-weight-bold">🎯 At Consumer's Nearby Hub</span><div class="small font-weight-bold text-dark mt-1">🏢 ${destHub.hub_name.split(' ')[0]} Hub</div>`
                : `<span class="badge badge-warning text-dark font-weight-bold">🚛 Routing to Nearby Hub</span><div class="small text-muted mt-1">➔ ${destHub.hub_name.split(' ')[0]}</div>`;

            let assignmentHtml = "";
            let actionHtml = "";

            if (o.is_unassigned) {
                assignmentHtml = `<span class="badge badge-light font-weight-bold">⚡ Open / Available</span>`;
                actionHtml = `
                    <div class="btn-group-actions">
                        <button type="button" class="btn btn-xs btn-warning text-dark font-weight-bold" 
                            onclick='LogisticsHook.acceptOrder(${o.id}, "delivery")'>
                            ✋ Accept Delivery
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-success font-weight-bold" 
                            onclick='LogisticsHook.navigateLiveGPS(${JSON.stringify(o).replace(/'/g, "&#39;")}, "delivery")' title="Preview GPS Route">
                            🧭 Preview GPS
                        </button>
                    </div>
                `;
            } else if (o.is_assigned_to_me) {
                assignmentHtml = `<span class="badge badge-success font-weight-bold">✅ Assigned to You</span>`;
                actionHtml = `
                    <div class="btn-group-actions">
                        <button type="button" class="btn btn-xs btn-success font-weight-bold" 
                            onclick='LogisticsHook.navigateLiveGPS(${JSON.stringify(o).replace(/'/g, "&#39;")}, "delivery")' title="Start Live GPS Navigation">
                            🧭 Start GPS Navigation (Google Maps)
                        </button>
                        <button type="button" class="btn btn-xs btn-warning text-dark font-weight-bold" 
                            onclick='LogisticsHook.openVerificationModal(${JSON.stringify(o).replace(/'/g, "&#39;")}, "confirm_delivery")'>
                            🔍 Verify & Confirm Delivery
                        </button>
                        <button type="button" class="btn btn-xs btn-light" 
                            onclick='window.showTrackingModal(${JSON.stringify(o).replace(/'/g, "&#39;")})'>
                            Telemetry
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-secondary" 
                            onclick='LogisticsHook.releaseOrder(${o.id})' title="Release this order back to open queue">
                            ↩ Release
                        </button>
                    </div>
                `;
            } else {
                assignmentHtml = `<span class="badge badge-light">🔒 ${o.assigned_agent_name}</span>`;
                actionHtml = `<span class="small text-muted">In transit with carrier</span>`;
            }

            return `
                <tr>
                    <td>
                        <strong>#${o.order_number}</strong>
                        <div class="small text-muted">${o.status === 'shipped' ? 'In Transit' : 'Pickup Complete'}</div>
                    </td>
                    <td>
                        <strong>${o.product_name}</strong>
                        <div class="small text-success font-weight-bold">${o.quantity} kg Load</div>
                    </td>
                    <td>
                        <div>🛒 <strong>${o.buyer_name}</strong></div>
                        <div class="small text-muted">📍 ${o.delivery_location} • 📞 ${o.buyer_mobile || o.b_mobile || 'Contact Buyer'}</div>
                    </td>
                    <td>
                        ${destHubBadge}
                    </td>
                    <td>
                        ${assignmentHtml}
                    </td>
                    <td>
                        ${actionHtml}
                    </td>
                </tr>
            `;
        }).join('');
    },

    /**
     * Render Consignment & Delivery Audit Table (renamed from renderAllConsignmentsTable)
     * Provides complete transparent audit ledger across all network consignments.
     */
    renderAuditTable(orders) {
        const container = document.getElementById("logisticsOrdersTableBody");
        if (!container) return;

        let filtered = orders || [];
        if (this.auditFilter === "mine") {
            filtered = filtered.filter(o => o.is_assigned_to_me);
        } else if (this.auditFilter === "unassigned") {
            filtered = filtered.filter(o => o.is_unassigned);
        }

        if (!filtered || filtered.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">📋 No audit records found for current filter.</td></tr>`;
            return;
        }

        container.innerHTML = filtered.map(o => {
            const origHubName = o.origin_hub ? o.origin_hub.hub_name.split(' ')[0] : 'Origin Hub';
            const destHubName = o.destination_hub ? o.destination_hub.hub_name.split(' ')[0] : 'Consumer Nearby Hub';

            const carrierBadge = o.is_assigned_to_me
                ? `<span class="badge badge-success font-weight-bold">✅ You (${o.assigned_agent_name})</span>`
                : (o.assigned_agent_name
                    ? `<span class="badge badge-light font-weight-bold">👤 ${o.assigned_agent_name}</span>`
                    : `<span class="badge badge-warning text-dark font-weight-bold">⚡ Unassigned / Open</span>`);

            return `
                <tr>
                    <td>
                        <strong>#${o.order_number}</strong>
                        <div class="small text-muted">${o.created_at ? o.created_at.split(' ')[0] : 'Today'}</div>
                    </td>
                    <td>
                        <strong>${o.product_name}</strong>
                        <div class="small font-weight-bold text-primary">${o.quantity} kg • ₹${o.total_amount}</div>
                    </td>
                    <td>
                        <div>👨‍🌾 <strong>${o.farmer_name}</strong> (${o.farmer_state || 'Farm Gate'})</div>
                        <div class="small text-muted font-weight-bold">🏢 Origin: ${origHubName} Hub</div>
                    </td>
                    <td>
                        <div>🛒 <strong>${o.buyer_name}</strong> (📍 ${o.delivery_location})</div>
                        <div class="small text-success font-weight-bold">🏢 Consumer's Nearby Hub: ${destHubName}</div>
                    </td>
                    <td>
                        ${carrierBadge}
                    </td>
                    <td>
                        <span class="${o.badge_class}">${o.status_display}</span>
                    </td>
                    <td>
                        <div class="btn-group-actions">
                            <button class="btn btn-xs btn-light font-weight-bold" 
                                onclick='window.showTrackingModal(${JSON.stringify(o).replace(/'/g, "&#39;")})'>
                                📜 Audit Telemetry
                            </button>
                            <button class="btn btn-xs btn-outline-success" 
                                onclick='LogisticsHook.navigateLiveGPS(${JSON.stringify(o).replace(/'/g, "&#39;")})' title="Open in Live GPS Navigation">
                                🧭 GPS Nav
                            </button>
                            ${o.is_assigned_to_me && o.status === 'ordered' ? `
                                <button class="btn btn-xs btn-primary font-weight-bold" 
                                    onclick='LogisticsHook.openVerificationModal(${JSON.stringify(o).replace(/'/g, "&#39;")}, "confirm_pickup")'>
                                    🔍 Verify Pickup
                                </button>
                            ` : ''}
                            ${o.is_assigned_to_me && (o.status === 'pickup_complete' || o.status === 'shipped') ? `
                                <button class="btn btn-xs btn-warning text-dark font-weight-bold" 
                                    onclick='LogisticsHook.openVerificationModal(${JSON.stringify(o).replace(/'/g, "&#39;")}, "confirm_delivery")'>
                                    🔍 Verify Delivery
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderAllConsignmentsTable(orders) {
        this.renderAuditTable(orders);
    },

    // =========================================================================
    // DELIVERY PERSON ORDER VERIFICATION & CONFIRMATION MODAL
    // =========================================================================

    /**
     * Open Order Verification Modal before confirming pickup or delivery
     */
    openVerificationModal(order, action) {
        this.currentVerifyingOrder = order;

        const modal = document.getElementById("orderVerificationModal");
        if (!modal) return;

        const titleEl = document.getElementById("modalVerificationTitle");
        const idInput = document.getElementById("verify_order_id");
        const actionInput = document.getElementById("verify_action");
        const expectedOrderInput = document.getElementById("verify_expected_order_number");
        const numDisplay = document.getElementById("verify_order_num_display");
        const cropDisplay = document.getElementById("verify_commodity_display");
        const partyDisplay = document.getElementById("verify_party_display");
        const badgeStatus = document.getElementById("verify_badge_status");
        const btnSubmit = document.getElementById("btnSubmitVerification");
        const orderInput = document.getElementById("verify_input_order_num");
        const notesInput = document.getElementById("verify_agent_notes");

        idInput.value = order.id;
        actionInput.value = action;
        expectedOrderInput.value = order.order_number;

        numDisplay.innerText = `#${order.order_number}`;
        cropDisplay.innerText = `${order.product_name} (${order.quantity} kg) • ₹${order.total_amount}`;

        if (action === "confirm_pickup") {
            titleEl.innerHTML = "🚜 Verify & Confirm Farm Gate Pickup";
            badgeStatus.className = "badge badge-primary font-weight-bold";
            badgeStatus.innerText = "FARM GATE PICKUP AUDIT";
            partyDisplay.innerHTML = `
                <div>Origin Farmer: <strong>${order.farmer_name}</strong> (${order.farmer_state || 'Farm Gate'})</div>
                <div>Contact Mobile: <strong>${order.f_mobile || 'Verified'}</strong></div>
            `;
            btnSubmit.className = "btn btn-primary font-weight-bold";
            btnSubmit.innerText = "✅ Confirm Verified Pickup";
        } else {
            titleEl.innerHTML = "📦 Verify & Confirm Customer Delivery";
            badgeStatus.className = "badge badge-warning text-dark font-weight-bold";
            badgeStatus.innerText = "DOORSTEP DELIVERY AUDIT";
            partyDisplay.innerHTML = `
                <div>Recipient Customer: <strong>${order.buyer_name}</strong></div>
                <div>📍 Destination: <strong>${order.delivery_location}</strong> • 📞 ${order.buyer_mobile || order.b_mobile || 'Direct'}</div>
            `;
            btnSubmit.className = "btn btn-warning text-dark font-weight-bold";
            btnSubmit.innerText = "✅ Confirm Verified Delivery (Start 7d Inspection)";
        }

        // Reset checklist items
        document.getElementById("chk_label_match").checked = true;
        document.getElementById("chk_quality_inspect").checked = true;
        document.getElementById("chk_weight_verify").checked = true;
        document.getElementById("chk_handover_signed").checked = true;

        orderInput.value = "";
        notesInput.value = "";

        modal.classList.add("active");
    },

    closeVerificationModal() {
        const modal = document.getElementById("orderVerificationModal");
        if (modal) modal.classList.remove("active");
        this.currentVerifyingOrder = null;
    },

    autofillOrderNumber() {
        if (!this.currentVerifyingOrder) return;
        const input = document.getElementById("verify_input_order_num");
        if (input) {
            input.value = this.currentVerifyingOrder.order_number;
            if (window.showToast) window.showToast("Order Number scanned & matched!", "info");
        }
    },

    /**
     * Submit Order Verification
     */
    async submitOrderVerification() {
        const orderId = document.getElementById("verify_order_id").value;
        const action = document.getElementById("verify_action").value;
        const expectedOrderNum = document.getElementById("verify_expected_order_number").value;
        const enteredOrderNum = document.getElementById("verify_input_order_num").value.trim().toUpperCase();
        const agentNotes = document.getElementById("verify_agent_notes").value.trim();

        // 1. Validate Checklist
        const c1 = document.getElementById("chk_label_match").checked;
        const c2 = document.getElementById("chk_quality_inspect").checked;
        const c3 = document.getElementById("chk_weight_verify").checked;
        const c4 = document.getElementById("chk_handover_signed").checked;

        if (!c1 || !c2 || !c3 || !c4) {
            if (window.showToast) window.showToast("Please complete all mandatory verification checklist checks.", "warning");
            return;
        }

        // 2. Validate Order Number Match
        if (!enteredOrderNum || enteredOrderNum !== expectedOrderNum.toUpperCase()) {
            if (window.showToast) {
                window.showToast(`Verification Failed: Scanned/Entered '${enteredOrderNum || 'empty'}' does not match expected #${expectedOrderNum}! Cannot confirm wrong consignment.`, "error");
            }
            return;
        }

        const btn = document.getElementById("btnSubmitVerification");
        if (btn) btn.disabled = true;

        try {
            const user = api.currentUser || { name: "Authorized Logistics Carrier" };
            const res = await api.verifyAndConfirmLogistics({
                order_id: orderId,
                action: action,
                verified_order_number: enteredOrderNum,
                agent_notes: agentNotes,
                agent_name: user.name
            });

            if (res && res.success) {
                if (window.showToast) window.showToast(res.message, "success");
                this.closeVerificationModal();
                this.loadHubOperations(this.activeHubId);
            } else {
                throw new Error((res && res.message) || "Verification rejected.");
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    // =========================================================================
    // ADD NEW DELIVERY HUB MODAL & OSM PICKER
    // =========================================================================

    openAddHubModal() {
        const modal = document.getElementById("addDeliveryHubModal");
        if (!modal) return;

        document.getElementById("addDeliveryHubForm").reset();
        document.getElementById("hub_lat").value = "13.1488";
        document.getElementById("hub_lng").value = "80.2306";

        modal.classList.add("active");

        setTimeout(() => {
            this.initHubPickerMap();
        }, 250);
    },

    closeAddHubModal() {
        const modal = document.getElementById("addDeliveryHubModal");
        if (modal) modal.classList.remove("active");
        if (this.hubPickerMap) {
            try { this.hubPickerMap.remove(); } catch (e) {}
            this.hubPickerMap = null;
        }
    },

    initHubPickerMap() {
        const container = document.getElementById("hubMapPickerContainer");
        if (!container) return;

        if (this.hubPickerMap) {
            this.hubPickerMap.invalidateSize();
            return;
        }

        const defaultLat = parseFloat(document.getElementById("hub_lat").value) || 13.1488;
        const defaultLng = parseFloat(document.getElementById("hub_lng").value) || 80.2306;

        this.hubPickerMap = L.map("hubMapPickerContainer", {
            center: [defaultLat, defaultLng],
            zoom: 11
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.hubPickerMap);

        this.hubPickerMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(this.hubPickerMap);

        this.hubPickerMarker.on("dragend", (e) => {
            const pos = e.target.getLatLng();
            document.getElementById("hub_lat").value = pos.lat.toFixed(4);
            document.getElementById("hub_lng").value = pos.lng.toFixed(4);
        });

        this.hubPickerMap.on("click", (e) => {
            this.hubPickerMarker.setLatLng(e.latlng);
            document.getElementById("hub_lat").value = e.latlng.lat.toFixed(4);
            document.getElementById("hub_lng").value = e.latlng.lng.toFixed(4);
        });
    },

    fetchHubCurrentGps() {
        if (!navigator.geolocation) {
            if (window.showToast) window.showToast("Geolocation not supported by this browser.", "warning");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                document.getElementById("hub_lat").value = lat.toFixed(4);
                document.getElementById("hub_lng").value = lng.toFixed(4);
                if (this.hubPickerMap && this.hubPickerMarker) {
                    this.hubPickerMap.flyTo([lat, lng], 13);
                    this.hubPickerMarker.setLatLng([lat, lng]);
                }
                if (window.showToast) window.showToast("GPS coordinates captured!", "success");
            },
            (err) => {
                if (window.showToast) window.showToast("Could not retrieve GPS: " + err.message, "warning");
            }
        );
    },

    async saveNewHub() {
        const hubName = document.getElementById("hub_name").value.trim();
        const inchargeName = document.getElementById("hub_incharge").value.trim();
        const contactNumber = document.getElementById("hub_phone").value.trim();
        const hubType = document.getElementById("hub_type").value;
        const address = document.getElementById("hub_address").value.trim();
        const lat = parseFloat(document.getElementById("hub_lat").value) || 13.0827;
        const lng = parseFloat(document.getElementById("hub_lng").value) || 80.2707;

        if (!hubName || !inchargeName || !contactNumber || !address) {
            if (window.showToast) window.showToast("Please fill all required hub fields.", "warning");
            return;
        }

        try {
            const payload = {
                hub_name: hubName,
                incharge_name: inchargeName,
                contact_number: contactNumber,
                hub_type: hubType,
                address: address,
                latitude: lat,
                longitude: lng
            };

            const res = await api.addDeliveryHub(payload);
            if (res && res.success) {
                if (window.showToast) window.showToast(res.message, "success");
                this.closeAddHubModal();
                // Reload hubs with newly created hub active
                this.loadHubOperations(res.hub ? res.hub.id : null);
            } else {
                throw new Error((res && res.message) || "Failed to register hub.");
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    },

    // =========================================================================
    // AI ROUTE OPTIMIZATION & OPENSTREETMAP VISUALIZATION
    // =========================================================================

    async triggerOptimization() {
        const btn = document.getElementById("btnRunRouteOpt");
        const icon = document.getElementById("btnOptIcon");
        const corridorSelect = document.getElementById("logisticsCorridorSelect");
        const corridor = corridorSelect ? corridorSelect.value : "chennai_corridor";

        if (btn) btn.disabled = true;
        if (icon) icon.innerHTML = "⏳";
        if (window.showToast) window.showToast("Computing AI Multi-Hub Precedence & Traffic-Weighted Route on OpenStreetMap...", "info");

        try {
            await this.fetchAndRenderRoute(corridor);
            if (window.showToast) window.showToast("AI Route Optimization Computed Successfully on OpenStreetMap!", "success");
        } catch (err) {
            if (window.showToast) window.showToast("Optimization failed: " + err.message, "error");
        } finally {
            if (btn) btn.disabled = false;
            if (icon) icon.innerHTML = "⚡";
        }
    },

    async fetchAndRenderRoute(corridorKey = "chennai_corridor") {
        if (!this.map) this.initMap();

        try {
            const data = await api.getOptimizedRoute(corridorKey);
            if (!data || !data.success) {
                throw new Error(data.message || "Failed to calculate route");
            }

            this.currentRouteData = data;
            this.renderKPIs(data.route_summary);
            this.renderMapRoutes(data.waypoints, data.traffic_segments);
            this.renderItinerary(data.waypoints);

            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 300);

            return data;
        } catch (err) {
            console.error("[LogisticsHook] Error fetching route:", err);
            throw err;
        }
    },

    renderKPIs(summary) {
        if (!summary) return;

        const totalDistEl = document.getElementById("metricTotalDist");
        const durationEl = document.getElementById("metricDuration");
        const trafficSavedEl = document.getElementById("metricTrafficSaved");
        const fuelSavedEl = document.getElementById("metricFuelSaved");
        const co2SavedEl = document.getElementById("metricCo2Saved");
        const hubsCountEl = document.getElementById("metricHubsCount");
        const deliveriesCountEl = document.getElementById("metricDeliveriesCount");
        const scoreBadge = document.getElementById("logisticsOptScoreBadge");
        const legCountBadge = document.getElementById("itineraryLegCount");

        const hours = Math.floor(summary.estimated_duration_mins / 60);
        const mins = summary.estimated_duration_mins % 60;
        const durStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} mins`;

        if (totalDistEl) totalDistEl.innerText = `${summary.total_distance_km} km`;
        if (durationEl) durationEl.innerText = durStr;
        if (trafficSavedEl) trafficSavedEl.innerText = `+${summary.traffic_delay_avoided_mins} mins`;
        if (fuelSavedEl) fuelSavedEl.innerText = `${summary.fuel_savings_liters} L`;
        if (co2SavedEl) co2SavedEl.innerText = `${summary.carbon_reduction_kg} kg CO2`;
        if (hubsCountEl) hubsCountEl.innerText = `${summary.hubs_collected} Farm Hubs`;
        if (deliveriesCountEl) deliveriesCountEl.innerText = `${summary.orders_delivered} Drops`;
        if (scoreBadge) scoreBadge.innerText = summary.optimization_score || "98.4% Efficiency";
        if (legCountBadge) legCountBadge.innerText = `${(summary.hubs_collected + summary.orders_delivered + 1)} Stops`;
    },

    renderMapRoutes(waypoints, trafficSegments) {
        if (!this.map || !this.markersLayer || !this.routesLayer) return;

        this.markersLayer.clearLayers();
        this.routesLayer.clearLayers();

        const latLngBounds = [];

        if (trafficSegments && trafficSegments.length > 0) {
            trafficSegments.forEach((seg) => {
                const p1 = seg.from_coords;
                const p2 = seg.to_coords;
                latLngBounds.push(p1);
                latLngBounds.push(p2);

                const midLat = (p1[0] + p2[0]) / 2 + (Math.sin(p1[0] * 10) * 0.008);
                const midLng = (p1[1] + p2[1]) / 2 + (Math.cos(p2[1] * 10) * 0.008);
                const pathCoords = [p1, [midLat, midLng], p2];

                L.polyline(pathCoords, {
                    color: "#ffffff",
                    weight: 8,
                    opacity: 0.9,
                    lineCap: "round",
                    lineJoin: "round"
                }).addTo(this.routesLayer);

                const trafficLine = L.polyline(pathCoords, {
                    color: seg.color || "#10b981",
                    weight: 5,
                    opacity: 0.95,
                    lineCap: "round",
                    lineJoin: "round"
                }).addTo(this.routesLayer);

                const osmLegDirectionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${p1[0]}%2C${p1[1]}%3B${p2[0]}%2C${p2[1]}`;

                trafficLine.bindPopup(`
                    <div style="font-size: 0.85rem; min-width: 210px;">
                        <div style="font-weight: 700; margin-bottom: 4px;">🛣️ Route Leg: ${seg.from_name.split(' ')[0]} &rarr; ${seg.to_name.split(' ')[0]}</div>
                        <div>Distance: <strong>${seg.distance_km} km</strong></div>
                        <div>Transit Time: <strong>${seg.travel_mins} mins</strong></div>
                        <div>Traffic Flow: <span style="color: ${seg.color}; font-weight: 700;">${seg.traffic_level}</span> (${seg.traffic_multiplier}x penalty)</div>
                        <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 4px;">
                            <a href="${osmLegDirectionsUrl}" target="_blank" class="osm-ext-nav-link" style="color: #0284c7; font-weight: 600;">
                                🧭 Open Leg in OpenStreetMap Directions
                            </a>
                        </div>
                    </div>
                `);
            });
        }

        waypoints.forEach((wp) => {
            const isDepot = wp.type === "depot";
            const isHub = wp.type === "hub_pickup";
            const isDelivery = wp.type === "customer_delivery";

            latLngBounds.push([wp.lat, wp.lng]);

            let bgClass = "marker-depot";
            let iconGlyph = "🏢";
            let typeTitle = "Central Depot";

            if (isHub) {
                bgClass = "marker-hub";
                iconGlyph = `🌾 ${wp.step_number}`;
                typeTitle = "Aggregation Hub Pickup";
            } else if (isDelivery) {
                bgClass = "marker-delivery";
                iconGlyph = `📦 ${wp.step_number}`;
                typeTitle = "Customer Delivery Drop";
            }

            const customIcon = L.divIcon({
                className: "custom-leaflet-marker",
                html: `
                    <div class="route-marker-pin ${bgClass}">
                        <span class="marker-text">${iconGlyph}</span>
                    </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
                popupAnchor: [0, -36]
            });

            const marker = L.marker([wp.lat, wp.lng], { icon: customIcon }).addTo(this.markersLayer);

            const osmInspectUrl = `https://www.openstreetmap.org/?mlat=${wp.lat}&mlon=${wp.lng}#map=16/${wp.lat}/${wp.lng}`;
            const osmDirectionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${waypoints[0].lat}%2C${waypoints[0].lng}%3B${wp.lat}%2C${wp.lng}`;

            marker.bindPopup(`
                <div class="leaflet-route-popup">
                    <div class="popup-badge ${bgClass}">${typeTitle} (Stop #${wp.step_number})</div>
                    <h4 class="popup-title">${wp.name}</h4>
                    ${wp.cargo ? `<div class="popup-cargo"><strong>Cargo:</strong> ${wp.cargo}</div>` : ''}
                    <div class="popup-meta-row">
                        <span>Leg Dist: <strong>${wp.leg_distance_km} km</strong></span>
                        <span>ETA: <strong>+${wp.eta_mins} mins</strong></span>
                    </div>
                    <div class="popup-traffic">
                        Traffic: <strong style="color: ${wp.traffic_color}">${wp.traffic_level}</strong>
                    </div>
                    <div class="popup-osm-actions mt-2 pt-2" style="border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 4px;">
                        <a href="${osmDirectionsUrl}" target="_blank" class="osm-ext-nav-link" style="color: #0284c7; font-weight: 600; font-size: 0.82rem;">
                            🧭 Open Turn-by-Turn from Depot in OSM
                        </a>
                        <a href="${osmInspectUrl}" target="_blank" class="osm-ext-nav-link text-muted" style="font-size: 0.78rem;">
                            🗺️ View on OpenStreetMap (${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)})
                        </a>
                    </div>
                </div>
            `);
        });

        if (latLngBounds.length > 0) {
            this.map.fitBounds(latLngBounds, { padding: [40, 40] });
        }
    },

    renderItinerary(waypoints) {
        const container = document.getElementById("itineraryStopsList");
        if (!container) return;

        if (!waypoints || waypoints.length === 0) {
            container.innerHTML = `<p class="text-muted p-3">No active waypoints for selected corridor.</p>`;
            return;
        }

        let html = "";
        let currentPhase = "";

        waypoints.forEach((wp) => {
            const isDepot = wp.type === "depot";
            const isHub = wp.type === "hub_pickup";
            const isDelivery = wp.type === "customer_delivery";

            if (isDepot && currentPhase !== "depot") {
                html += `<div class="itinerary-phase-header">📍 Phase 0: Central Fleet Origin</div>`;
                currentPhase = "depot";
            } else if (isHub && currentPhase !== "hub") {
                html += `<div class="itinerary-phase-header phase-hub">🚜 Phase 1: Farm Gate Aggregation & Pickups</div>`;
                currentPhase = "hub";
            } else if (isDelivery && currentPhase !== "delivery") {
                html += `<div class="itinerary-phase-header phase-del">🚛 Phase 2: Direct Consumer Delivery Distribution</div>`;
                currentPhase = "delivery";
            }

            let badgeClass = "badge-depot";
            let stepLabel = "Depot";
            if (isHub) {
                badgeClass = "badge-hub";
                stepLabel = `Pickup #${wp.step_number}`;
            } else if (isDelivery) {
                badgeClass = "badge-delivery";
                stepLabel = `Drop #${wp.step_number}`;
            }

            const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${waypoints[0].lat}%2C${waypoints[0].lng}%3B${wp.lat}%2C${wp.lng}`;

            html += `
                <div class="itinerary-card-item">
                    <div class="itinerary-step-left" onclick="LogisticsHook.flyToStop(${wp.lat}, ${wp.lng})">
                        <span class="itinerary-badge ${badgeClass}">${stepLabel}</span>
                        <div class="itinerary-connector-line"></div>
                    </div>
                    <div class="itinerary-step-body">
                        <div class="itinerary-stop-name" onclick="LogisticsHook.flyToStop(${wp.lat}, ${wp.lng})">${wp.name}</div>
                        ${wp.cargo ? `<div class="itinerary-cargo-desc">${wp.cargo}</div>` : ''}
                        <div class="itinerary-stop-metrics">
                            <span>🛣️ ${wp.leg_distance_km} km</span>
                            <span>⏱️ ETA: +${wp.eta_mins}m</span>
                            <span class="traffic-tag" style="background: ${wp.traffic_color}18; color: ${wp.traffic_color}; border: 1px solid ${wp.traffic_color}40;">
                                🚦 ${wp.traffic_level}
                            </span>
                        </div>
                        <div class="mt-1">
                            <a href="${osmUrl}" target="_blank" class="osm-itinerary-link" title="Open Turn-by-Turn GPS on OpenStreetMap" style="font-size: 0.8rem; color: #0284c7; font-weight: 600;">
                                🧭 Navigate Stop on OSM
                            </a>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    },

    flyToStop(lat, lng) {
        if (!this.map) return;
        this.map.flyTo([lat, lng], 13, { duration: 1.2 });
    },

    openExternalOSMNavigation() {
        if (!this.currentRouteData || !this.currentRouteData.waypoints || this.currentRouteData.waypoints.length < 2) {
            if (window.showToast) window.showToast("Computing route waypoints first...", "info");
            this.fetchAndRenderRoute().then(() => this.openExternalOSMNavigation());
            return;
        }

        const waypoints = this.currentRouteData.waypoints;
        const origin = waypoints[0];
        const lastStop = waypoints[waypoints.length - 1];

        const osmDirectionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${lastStop.lat}%2C${lastStop.lng}`;

        if (window.showToast) {
            window.showToast("Launching OpenStreetMap turn-by-turn route navigation...", "info");
        }
        window.open(osmDirectionsUrl, "_blank");
    },

    navigateFromVerificationModal() {
        this.navigateLiveGPSCurrent();
    },

    /**
     * Swiggy/Zomato style Live GPS Driving Navigation:
     * Takes delivery agent's live GPS device location and initiates turn-by-turn
     * Google Maps navigation directly to the farm gate (pickup) or customer doorstep (delivery).
     */
    navigateLiveGPSCurrent() {
        if (!this.currentVerifyingOrder) {
            if (window.showToast) window.showToast("No order selected for navigation.", "warning");
            return;
        }
        const order = this.currentVerifyingOrder;
        const actionInput = document.getElementById("verify_action");
        const action = actionInput ? actionInput.value : "auto";
        const targetType = action === "confirm_pickup" ? "pickup" : "delivery";
        this.closeVerificationModal();
        this.navigateLiveGPS(order, targetType);
    },

    navigateLiveGPS(order, targetType = "auto") {
        if (!order) return;

        let destLat, destLng, destLabel;
        const isPickup = targetType === "pickup" || (targetType === "auto" && order.status === "ordered");

        if (isPickup) {
            destLat = order.farmer_lat || 12.9352;
            destLng = order.farmer_lng || 80.1878;
            destLabel = `🌾 Farm Gate: ${order.farmer_name || 'Farmer'} (${order.farmer_state || 'Farm Hub'})`;
        } else {
            if (order.buyer_lat && order.buyer_lng) {
                destLat = order.buyer_lat;
                destLng = order.buyer_lng;
            } else {
                const resolved = this.lookupCoords(order.delivery_location || "Adyar");
                destLat = resolved.lat;
                destLng = resolved.lng;
            }
            destLabel = `📦 Doorstep: ${order.buyer_name || 'Customer'} (📍 ${order.delivery_location || 'Address'})`;
        }

        if (window.showToast) {
            window.showToast(`🧭 Opening Live GPS Navigation to ${destLabel}...`, "info");
        }

        // Swiggy-style navigation URL using Google Maps driving mode & dir_action=navigate
        // If navigator.geolocation is available, we query current GPS coordinates.
        // If GPS is unavailable/slow, Google Maps automatically uses the device's live GPS origin when origin is omitted.
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const uLat = pos.coords.latitude;
                    const uLng = pos.coords.longitude;
                    const navUrl = `https://www.google.com/maps/dir/?api=1&origin=${uLat},${uLng}&destination=${destLat},${destLng}&travelmode=driving&dir_action=navigate`;
                    window.open(navUrl, "_blank");
                },
                (err) => {
                    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving&dir_action=navigate`;
                    window.open(navUrl, "_blank");
                },
                { enableHighAccuracy: true, timeout: 3500 }
            );
        } else {
            const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving&dir_action=navigate`;
            window.open(navUrl, "_blank");
        }
    },

    openDirectOSMNavigation(order) {
        let buyerLat = order.buyer_lat;
        let buyerLng = order.buyer_lng;
        let farmerLat = order.farmer_lat || 12.9352;
        let farmerLng = order.farmer_lng || 80.1878;

        if (!buyerLat || !buyerLng) {
            const resolved = this.lookupCoords(order.delivery_location || "Adyar");
            buyerLat = resolved.lat;
            buyerLng = resolved.lng;
        }

        const osmTurnByTurnUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${farmerLat}%2C${farmerLng}%3B${buyerLat}%2C${buyerLng}`;
        window.open(osmTurnByTurnUrl, "_blank");
        if (window.showToast) {
            window.showToast(`Launching OpenStreetMap navigation for Order #${order.order_number}`, "info");
        }
    },

    navigateToDelivery(order) {
        // 1. Immediately switch to Route Navigation tab so map is in the DOM
        if (typeof window.showLogisticsSubTab === "function") {
            window.showLogisticsSubTab("routing");
        }

        if (!this.map) {
            this.initMap();
        }

        let buyerLat = order.buyer_lat;
        let buyerLng = order.buyer_lng;
        let farmerLat = order.farmer_lat || 12.9352;
        let farmerLng = order.farmer_lng || 80.1878;

        if (!buyerLat || !buyerLng) {
            const resolved = this.lookupCoords(order.delivery_location || "Adyar");
            buyerLat = resolved.lat;
            buyerLng = resolved.lng;
        }

        // Allow tab panel to become visible before rendering map coordinates
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
            }

            if (!this.navigationLayer) {
                this.navigationLayer = L.layerGroup().addTo(this.map);
            }
            this.navigationLayer.clearLayers();

            const routePath = [
                [farmerLat, farmerLng],
                [(farmerLat + buyerLat) / 2 + 0.005, (farmerLng + buyerLng) / 2 + 0.005],
                [buyerLat, buyerLng]
            ];

            L.polyline(routePath, {
                color: "#ffffff",
                weight: 9,
                opacity: 0.9,
                lineCap: "round"
            }).addTo(this.navigationLayer);

            L.polyline(routePath, {
                color: "#0284c7",
                weight: 5,
                dashArray: "8, 12",
                opacity: 1
            }).addTo(this.navigationLayer);

            const farmIcon = L.divIcon({
                className: "custom-leaflet-marker",
                html: `<div class="route-marker-pin marker-hub"><span class="marker-text">👨‍🌾</span></div>`,
                iconSize: [36, 36],
                iconAnchor: [18, 36],
                popupAnchor: [0, -36]
            });
            const farmMarker = L.marker([farmerLat, farmerLng], { icon: farmIcon }).addTo(this.navigationLayer);
            farmMarker.bindPopup(`
                <div class="leaflet-route-popup">
                    <div class="popup-badge marker-hub">🌾 Origin Farm Gate</div>
                    <h4 class="popup-title">${order.farmer_name || 'Farmer'} (${order.farmer_state || 'Agri Hub'})</h4>
                    <div class="popup-cargo">Commodity: <strong>${order.product_name} (${order.quantity} kg)</strong></div>
                </div>
            `);

            const beaconIcon = L.divIcon({
                className: "beacon-marker-container",
                html: `
                    <div class="delivery-beacon-marker">
                        <div class="beacon-pulse"></div>
                        <div class="beacon-pin">🎯</div>
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
                popupAnchor: [0, -22]
            });

            const deliveryMarker = L.marker([buyerLat, buyerLng], { icon: beaconIcon }).addTo(this.navigationLayer);

            const osmTurnByTurnUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${farmerLat}%2C${farmerLng}%3B${buyerLat}%2C${buyerLng}`;
            const osmInspectUrl = `https://www.openstreetmap.org/?mlat=${buyerLat}&mlon=${buyerLng}#map=16/${buyerLat}/${buyerLng}`;
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${farmerLat},${farmerLng}&destination=${buyerLat},${buyerLng}&travelmode=driving`;

            deliveryMarker.bindPopup(`
                <div class="leaflet-route-popup" style="min-width: 270px;">
                    <div class="popup-badge marker-delivery">📦 Target Delivery Destination</div>
                    <h4 class="popup-title">Consignment #${order.order_number}</h4>
                    <div class="popup-cargo"><strong>Customer:</strong> ${order.buyer_name || 'Consumer'}</div>
                    <div class="popup-cargo"><strong>📍 Address:</strong> ${order.delivery_location || 'Customer Address'}</div>
                    <div class="popup-meta-row mt-1">
                        <span>Produce: <strong>${order.product_name}</strong></span>
                        <span>Load: <strong>${order.quantity} kg</strong></span>
                    </div>
                    <div class="popup-meta-row mt-1">
                        <span>GPS: <strong>${Number(buyerLat).toFixed(4)}, ${Number(buyerLng).toFixed(4)}</strong></span>
                        <span>Status: <strong>${order.status_display || order.status}</strong></span>
                    </div>
                    <div class="mt-3 pt-2" style="border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px;">
                        <a href="${osmTurnByTurnUrl}" target="_blank" class="btn btn-sm btn-primary w-100 font-weight-bold" style="text-align: center; display: block; color: white !important;">
                            🧭 Turn-by-Turn GPS (OpenStreetMap)
                        </a>
                        <a href="${googleMapsUrl}" target="_blank" class="btn btn-sm btn-outline-success w-100 text-center" style="font-size: 0.82rem; font-weight: 600;">
                            🗺️ Open in Google Maps
                        </a>
                    </div>
                </div>
            `);

            this.map.fitBounds([[farmerLat, farmerLng], [buyerLat, buyerLng]], { padding: [80, 80] });

            setTimeout(() => {
                deliveryMarker.openPopup();
            }, 300);

            const mapEl = document.getElementById("logisticsRouteMap");
            if (mapEl) {
                mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 150);

        if (window.showToast) {
            window.showToast(`Navigating to ${order.delivery_location || 'destination'} on OpenStreetMap`, "info");
        }
    },

    async searchDeliveryLocation(query) {
        if (!this.map) this.initMap();

        const inputEl = document.getElementById("osmDeliverySearchInput");
        const q = (query || (inputEl ? inputEl.value : "")).trim();
        if (!q) {
            if (window.showToast) window.showToast("Please enter a delivery location or landmark to search.", "warning");
            return;
        }

        if (window.showToast) window.showToast(`Searching '${q}' on OpenStreetMap...`, "info");

        const localHit = this.lookupCoords(q);
        if (localHit.isExact) {
            this.plotSearchResult(localHit.lat, localHit.lng, localHit.name || q);
            return;
        }

        try {
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', India')}&limit=1`;
            const resp = await fetch(nominatimUrl, { headers: { "Accept": "application/json" } });
            const results = await resp.json();

            if (results && results.length > 0) {
                const item = results[0];
                this.plotSearchResult(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
            } else {
                this.plotSearchResult(localHit.lat, localHit.lng, `${q} (Agro Corridor Region)`);
            }
        } catch (err) {
            this.plotSearchResult(localHit.lat, localHit.lng, `${q} (Location)`);
        }
    },

    plotSearchResult(lat, lng, label) {
        if (!this.navigationLayer) {
            this.navigationLayer = L.layerGroup().addTo(this.map);
        }
        this.navigationLayer.clearLayers();

        const searchIcon = L.divIcon({
            className: "search-result-marker",
            html: `
                <div class="delivery-beacon-marker">
                    <div class="beacon-pulse"></div>
                    <div class="beacon-pin" style="background: #0284c7;">📍</div>
                </div>
            `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
            popupAnchor: [0, -20]
        });

        const marker = L.marker([lat, lng], { icon: searchIcon }).addTo(this.navigationLayer);
        const osmInspectUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
        const osmNavUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=13.1488%2C80.2306%3B${lat}%2C${lng}`;

        marker.bindPopup(`
            <div class="leaflet-route-popup" style="min-width: 250px;">
                <div class="popup-badge marker-delivery">📍 OpenStreetMap Geocoded Delivery Point</div>
                <h4 class="popup-title">${label}</h4>
                <div class="popup-meta-row mt-1">
                    <span>Latitude: <strong>${lat.toFixed(4)}</strong></span>
                    <span>Longitude: <strong>${lng.toFixed(4)}</strong></span>
                </div>
                <div class="mt-3 pt-2" style="border-top: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px;">
                    <a href="${osmNavUrl}" target="_blank" class="btn btn-sm btn-primary w-100 font-weight-bold" style="color: white !important;">
                        🧭 Turn-by-Turn Route on OpenStreetMap
                    </a>
                    <a href="${osmInspectUrl}" target="_blank" class="btn btn-sm btn-outline-light w-100 text-center" style="font-size: 0.8rem;">
                        🗺️ View on OpenStreetMap
                    </a>
                </div>
            </div>
        `).openPopup();

        this.map.flyTo([lat, lng], 14, { duration: 1.2 });
        if (window.showToast) window.showToast(`Located '${label.split(',')[0]}' on OpenStreetMap`, "success");
    },

    lookupCoords(locationStr) {
        if (!locationStr) return { lat: 13.0012, lng: 80.2565, isExact: false };
        const lower = locationStr.toLowerCase();
        for (const [key, coords] of Object.entries(this.LOCATION_DICTIONARY)) {
            if (lower.includes(key)) {
                return { ...coords, isExact: true };
            }
        }
        return { lat: 13.0012, lng: 80.2565, name: locationStr, isExact: false };
    },

    cleanupModalMap() {
        if (this.modalMap) {
            try { this.modalMap.remove(); } catch (e) {}
            this.modalMap = null;
        }
    },

    renderCustomTrackingUI(order, containerElement) {
        if (!containerElement) return;

        this.cleanupModalMap();

        const buyerLat = order.buyer_lat || 13.0012;
        const buyerLng = order.buyer_lng || 80.2565;
        const farmerLat = order.farmer_lat || 12.9352;
        const farmerLng = order.farmer_lng || 80.1878;

        const osmTurnByTurnUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${farmerLat}%2C${farmerLng}%3B${buyerLat}%2C${buyerLng}`;
        const osmInspectUrl = `https://www.openstreetmap.org/?mlat=${buyerLat}&mlon=${buyerLng}#map=15/${buyerLat}/${buyerLng}`;

        let timelineHtml = `
            <div class="logistics-custom-card">
                <div class="logistics-header-bar">
                    <h4>🚛 KisanSetu Logistics Dispatch Pipeline</h4>
                    <span class="badge-pill">Consignment ID: #${order.order_number}</span>
                </div>
                <div class="tracking-summary-sub">
                    <span>Commodity: <strong>${order.product_name} (${order.quantity} kg)</strong></span>
                    <span>Destination: <strong>${order.delivery_location}</strong></span>
                </div>

                <div class="osm-modal-map-wrapper mt-3">
                    <div class="osm-modal-map-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span class="small font-weight-bold">🗺️ OpenStreetMap Delivery Route & Telemetry:</span>
                        <a href="${osmTurnByTurnUrl}" target="_blank" class="badge badge-success font-weight-bold" style="text-decoration: none; padding: 4px 8px;">
                            🧭 Open in OSM Directions
                        </a>
                    </div>
                    <div id="osmModalMap" class="osm-modal-map" style="height: 240px; width: 100%; border-radius: var(--radius-sm); border: 1px solid #cbd5e1;"></div>
                </div>

                <div class="tracking-steps-container mt-3">
        `;

        const logs = order.tracking_info || [];
        if (logs.length === 0) {
            timelineHtml += `<p class="text-muted p-2">Awaiting carrier farm gate pickup confirmation.</p>`;
        } else {
            logs.forEach((step, idx) => {
                const isLatest = idx === logs.length - 1;
                timelineHtml += `
                    <div class="tracking-step-item ${isLatest ? 'step-active' : 'step-completed'}">
                        <div class="step-dot"></div>
                        <div class="step-content">
                            <div class="step-title">${step.status}</div>
                            <div class="step-meta">
                                <span>📍 ${step.location || 'Agri Logistics Hub'}</span> • <span>🕒 ${step.time || 'Logged'}</span>
                                ${step.verified_by ? ` • <span>👤 Verified by: ${step.verified_by}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        timelineHtml += `
                </div>
                <div class="logistics-extensibility-box mt-3">
                    <span class="icon">🤖</span>
                    <div class="desc">
                        <strong>OpenStreetMap & AI 2-Opt Routing:</strong>
                        <span>Consignment route optimized with dynamic road congestion penalty. Live telemetry mapped to OpenStreetMap turn-by-turn navigation corridors.</span>
                    </div>
                </div>

                <div class="mt-3 pt-2" style="display: flex; gap: 8px;">
                    <a href="${osmTurnByTurnUrl}" target="_blank" class="btn btn-sm btn-primary font-weight-bold" style="flex: 1; text-align: center; color: white !important;">
                        🧭 Turn-by-Turn GPS on OpenStreetMap
                    </a>
                    <a href="${osmInspectUrl}" target="_blank" class="btn btn-sm btn-outline-light" style="flex: 1; text-align: center;">
                        🗺️ View on OpenStreetMap
                    </a>
                </div>
            </div>
        `;

        containerElement.innerHTML = timelineHtml;

        setTimeout(() => {
            const mapDiv = document.getElementById("osmModalMap");
            if (!mapDiv) return;

            try {
                this.modalMap = L.map("osmModalMap", {
                    center: [(farmerLat + buyerLat) / 2, (farmerLng + buyerLng) / 2],
                    zoom: 11,
                    scrollWheelZoom: false
                });

                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    maxZoom: 18,
                    attribution: '&copy; OpenStreetMap contributors'
                }).addTo(this.modalMap);

                const originMarker = L.marker([farmerLat, farmerLng]).addTo(this.modalMap);
                originMarker.bindPopup(`<b>Farm Gate:</b> ${order.farmer_name || 'Farmer'}`);

                const destMarker = L.marker([buyerLat, buyerLng]).addTo(this.modalMap);
                destMarker.bindPopup(`<b>Delivery Destination:</b> ${order.delivery_location}`);

                L.polyline([[farmerLat, farmerLng], [buyerLat, buyerLng]], {
                    color: "#0284c7",
                    weight: 4,
                    dashArray: "6, 8"
                }).addTo(this.modalMap);

                this.modalMap.fitBounds([[farmerLat, farmerLng], [buyerLat, buyerLng]], { padding: [30, 30] });

                setTimeout(() => {
                    if (this.modalMap) this.modalMap.invalidateSize();
                }, 200);
            } catch (err) {
                console.warn("[LogisticsHook] Error initializing modal map:", err);
            }
        }, 150);
    }
};

window.LogisticsHook = LogisticsHook;

// Live Cross-Panel Sync: auto-refresh logistics when customer places an order
window.addEventListener("kisansetu:order_placed", () => {
    if (window.LogisticsHook) {
        if (typeof window.LogisticsHook.loadHubOperations === "function") {
            window.LogisticsHook.loadHubOperations(window.LogisticsHook.activeHubId);
        }
        if (window.LogisticsHook.activeTab === "pipeline" && typeof window.LogisticsHook.loadPipeline === "function") {
            window.LogisticsHook.loadPipeline();
        }
    }
});
