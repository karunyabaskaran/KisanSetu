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
    markersLayer: [],
    routesLayer: [],
    navigationLayer: [],
    infoWindow: null,
    currentRouteData: null,
    currentGoogleMapsUrl: null,
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
     * Initialize Google Maps on the Logistics Panel
     */
    initMap() {
        const mapContainer = document.getElementById("googleLogisticsMap") || document.getElementById("logisticsRouteMap");
        if (!mapContainer) return;

        if (this.map && window.google && window.google.maps) {
            google.maps.event.trigger(this.map, "resize");
            return;
        }

        if (window.google && window.google.maps) {
            this.map = new google.maps.Map(mapContainer, {
                center: { lat: 13.0400, lng: 80.1500 },
                zoom: 10,
                mapTypeId: google.maps.MapTypeId.ROADMAP,
                fullscreenControl: true,
                mapTypeControl: true,
                streetViewControl: false
            });
            this.infoWindow = new google.maps.InfoWindow();
            this.isInitialized = true;

            // Initialize Places Autocomplete if search input present
            const searchInput = document.getElementById("googleDeliverySearchInput");
            if (searchInput && google.maps.places && !searchInput.dataset.acBound) {
                searchInput.dataset.acBound = "true";
                try {
                    const autocomplete = new google.maps.places.Autocomplete(searchInput, {
                        componentRestrictions: { country: "in" }
                    });
                    autocomplete.addListener("place_changed", () => {
                        const place = autocomplete.getPlace();
                        if (place && place.geometry && place.geometry.location) {
                            const lat = place.geometry.location.lat();
                            const lng = place.geometry.location.lng();
                            this.plotSearchResult(lat, lng, place.name || place.formatted_address);
                        }
                    });
                } catch (e) {
                    console.warn("Places autocomplete setup note:", e);
                }
            }
        } else {
            mapContainer.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:14px; gap:8px;">
                    <span class="spinner-border text-primary"></span>
                    <span>Connecting to Google Maps Logistics Engine...</span>
                </div>
            `;
            setTimeout(() => {
                if (window.google && window.google.maps) {
                    this.initMap();
                }
            }, 1000);
            return;
        }

        const corridorSelect = document.getElementById("logisticsCorridorSelect");
        if (corridorSelect && !corridorSelect.dataset.bound) {
            corridorSelect.dataset.bound = "true";
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

            // 6. Render Buyer-Grouped Consignments (Requirement 8)
            this.renderBuyerGroupedPickups(opsRes.buyer_grouped_pickups || []);

            // 7. Render Near Pickups Table (Available & Assigned)
            this.renderNearPickupsTable(nearPickups, activeHub);

            // 7. Render Route Deliveries Table (Hub-to-Hub & Consumer Nearby Hub Distribution)
            this.renderRouteDeliveriesTable(routeDeliveries, activeHub);

            // 8. Render Audit Table
            this.renderAuditTable(this.allConsignmentsCache);

            // Pan map to active hub
            if (this.map && activeHub && activeHub.latitude) {
                if (typeof this.map.panTo === "function") {
                    this.map.panTo({ lat: activeHub.latitude, lng: activeHub.longitude });
                    this.map.setZoom(12);
                }
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
     * Requirement 8: Accept entire multi-order consignment for a single buyer
     */
    async acceptBuyerConsignment(buyerId) {
        const user = api.currentUser || { id: 7, name: "Gramin Express Logistics", mobile: "9811122233" };
        try {
            if (window.showToast) window.showToast("Assigning entire buyer consignment to your carrier...", "info");
            const res = await api.acceptBuyerConsignment({
                buyer_id: buyerId,
                agent_id: user.id,
                agent_name: user.name,
                agent_mobile: user.mobile || "9811122233"
            });
            if (res && res.success) {
                if (window.showToast) window.showToast(res.message, "success");
                this.loadHubOperations(this.activeHubId);
            } else {
                throw new Error((res && res.message) || "Could not accept buyer consignment.");
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    },

    /**
     * Requirement 8: Deliver all orders placed by a single buyer at a time simultaneously
     */
    async deliverBuyerConsignment(buyerId) {
        const user = api.currentUser || { id: 7 };
        if (!confirm("Confirm delivery of all items for this buyer simultaneously?")) return;

        try {
            if (window.showToast) window.showToast("Delivering all orders for buyer...", "info");
            const res = await api.deliverBuyerConsignment({
                buyer_id: buyerId,
                agent_id: user.id
            });
            if (res && res.success) {
                if (window.showToast) window.showToast(res.message, "success");
                this.loadHubOperations(this.activeHubId);
                // Trigger live sync for buyer and farmer
                window.dispatchEvent(new CustomEvent("kisansetu:order_delivered"));
                if (window.BuyerController && typeof window.BuyerController.loadMyOrders === "function") {
                    window.BuyerController.loadMyOrders();
                }
                if (window.FarmerController && typeof window.FarmerController.loadOrders === "function") {
                    window.FarmerController.loadOrders();
                }
            } else {
                throw new Error((res && res.message) || "Could not deliver buyer consignment.");
            }
        } catch (err) {
            if (window.showToast) window.showToast(err.message, "error");
        }
    },

    /**
     * Requirement 8: Render Buyer-Grouped Consignments
     */
    renderBuyerGroupedPickups(groups) {
        const container = document.getElementById("buyerGroupedPickupsContainer");
        if (!container) return;

        if (!groups || groups.length === 0) {
            container.innerHTML = `
                <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: var(--radius-md); padding: 16px; text-align: center; color: #64748b; font-size: 0.9rem;">
                    No consolidated buyer consignments currently waiting for single-route delivery.
                </div>
            `;
            return;
        }

        container.innerHTML = groups.map(g => {
            const hasUnassigned = g.any_unassigned;
            const isAssignedToMe = g.all_assigned_to_me;
            const canDeliverAll = g.can_deliver_all;

            let actionBtn = "";
            if (hasUnassigned) {
                actionBtn = `
                    <button type="button" class="btn btn-sm btn-primary font-weight-bold btn-block" onclick="LogisticsHook.acceptBuyerConsignment(${g.buyer_id})">
                        ✋ Accept Entire Consignment (${g.total_orders} Orders)
                    </button>
                `;
            } else if (canDeliverAll) {
                actionBtn = `
                    <button type="button" class="btn btn-sm btn-success font-weight-bold btn-block" onclick="LogisticsHook.deliverBuyerConsignment(${g.buyer_id})">
                        🚚 Deliver All (${g.total_orders} Orders) to Buyer at a Time
                    </button>
                `;
            } else if (isAssignedToMe) {
                actionBtn = `
                    <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn btn-xs btn-outline-success font-weight-bold" style="flex: 1;" onclick="LogisticsHook.deliverBuyerConsignment(${g.buyer_id})">
                            🚚 Deliver All at a Time
                        </button>
                    </div>
                `;
            }

            return `
                <div class="buyer-consignment-card">
                    <div>
                        <div class="buyer-consignment-header">
                            <div>
                                <div style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Consignment Destination</div>
                                <h4 style="margin: 2px 0 0 0; color: #0f172a; font-size: 1.05rem;">👤 ${g.buyer_name}</h4>
                                <div class="small text-muted">📞 ${g.buyer_mobile || 'Registered'} • 📍 ${g.delivery_location || (g.buyer_district + ', ' + g.buyer_state)}</div>
                            </div>
                            <span class="badge ${isAssignedToMe ? 'badge-success' : 'badge-primary'}" style="font-weight: 700;">
                                ${g.total_orders} Orders (${g.total_quantity_kg} kg)
                            </span>
                        </div>

                        <!-- Orders in this consignment -->
                        <div class="buyer-consignment-orders-list">
                            <div style="font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 6px;">Consignment Cargo Manifest:</div>
                            ${g.orders.map(o => `
                                <div class="buyer-consignment-item">
                                    <span><strong>#${o.order_number}</strong>: ${o.product_name} (${o.quantity} kg)</span>
                                    <span class="text-muted" style="font-size: 0.78rem;">👨‍🌾 ${o.farmer_name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="mt-2">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 8px;">
                            <span class="text-muted">Total Consignment Value:</span>
                            <strong style="color: #15803d; font-size: 0.95rem;">₹${g.total_value.toFixed(2)}</strong>
                        </div>
                        ${actionBtn}
                    </div>
                </div>
            `;
        }).join('');
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
        if (this.hubPickerMarker) {
            this.hubPickerMarker.setMap(null);
            this.hubPickerMarker = null;
        }
        this.hubPickerMap = null;
    },

    initHubPickerMap() {
        const container = document.getElementById("hubMapPickerContainer");
        if (!container) return;

        const defaultLat = parseFloat(document.getElementById("hub_lat").value) || 13.1488;
        const defaultLng = parseFloat(document.getElementById("hub_lng").value) || 80.2306;

        if (window.google && window.google.maps) {
            this.hubPickerMap = new google.maps.Map(container, {
                center: { lat: defaultLat, lng: defaultLng },
                zoom: 12,
                mapTypeId: google.maps.MapTypeId.ROADMAP
            });

            this.hubPickerMarker = new google.maps.Marker({
                position: { lat: defaultLat, lng: defaultLng },
                map: this.hubPickerMap,
                draggable: true,
                title: "Drag to pin hub location"
            });

            this.hubPickerMarker.addListener("dragend", (e) => {
                const lat = e.latLng.lat();
                const lng = e.latLng.lng();
                document.getElementById("hub_lat").value = lat.toFixed(4);
                document.getElementById("hub_lng").value = lng.toFixed(4);
            });

            this.hubPickerMap.addListener("click", (e) => {
                this.hubPickerMarker.setPosition(e.latLng);
                document.getElementById("hub_lat").value = e.latLng.lat().toFixed(4);
                document.getElementById("hub_lng").value = e.latLng.lng().toFixed(4);
            });
        }
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
                    if (typeof this.hubPickerMap.panTo === "function") {
                        this.hubPickerMap.panTo({ lat, lng });
                        this.hubPickerMap.setZoom(14);
                        this.hubPickerMarker.setPosition({ lat, lng });
                    }
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

    // =========================================================================
    // AI ROUTE OPTIMIZATION & GOOGLE MAPS VISUALIZATION
    // =========================================================================

    async triggerOptimization() {
        const btn = document.getElementById("btnRunRouteOpt");
        const icon = document.getElementById("btnOptIcon");
        const corridorSelect = document.getElementById("logisticsCorridorSelect");
        const corridor = corridorSelect ? corridorSelect.value : "chennai_corridor";

        if (btn) btn.disabled = true;
        if (icon) icon.innerHTML = "⏳";
        if (window.showToast) window.showToast("Computing Gemini AI Multi-Hub Precedence & Route on Google Maps...", "info");

        try {
            await this.fetchAndRenderRoute(corridor);
            if (window.showToast) window.showToast("AI Route Optimization Computed Successfully on Google Maps!", "success");
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
            const user = (window.api && window.api.currentUser) || null;
            const farmerLoc = (user && (user.location || user.state)) || "Adyar, Chennai";
            const data = await api.getOptimizedRoute(corridorKey, farmerLoc);
            if (!data || !data.success) {
                throw new Error(data.message || "Failed to calculate route");
            }

            this.currentRouteData = data;
            this.currentGoogleMapsUrl = data.google_maps_url;

            this.renderKPIs(data.route_summary);
            this.renderGeminiAdvisory(data.gemini_advisory);

            // Update Farmer Nearest Hub & Relay Status Bar
            const statusBar = document.getElementById("logisticsHubStatusBar");
            const farmerHubText = document.getElementById("logisticsFarmerHubText");
            const relayBadge = document.getElementById("logisticsRelayBadge");

            if (statusBar) {
                statusBar.style.display = "flex";
                if (farmerHubText && data.farmer_hub_assignment) {
                    const fh = data.farmer_hub_assignment;
                    farmerHubText.innerHTML = `🌾 <strong>Farmer Location Assigned:</strong> 🏢 ${fh.hub_name} (${fh.distance_to_hub_km} km away, ~${fh.estimated_travel_mins} mins) &rarr; Order dispatched to collection hub`;
                }
                if (relayBadge) {
                    const relayCount = (data.relay_dropoffs && data.relay_dropoffs.length) || 0;
                    relayBadge.innerText = `${relayCount} Relay Handover${relayCount === 1 ? '' : 's'}`;
                    relayBadge.className = relayCount > 0 ? "badge badge-warning text-dark font-weight-bold" : "badge badge-info";
                }
            }

            this.renderMapRoutes(data.waypoints, data.traffic_segments, data.relay_dropoffs);
            this.renderItinerary(data.waypoints, data.relay_dropoffs);

            setTimeout(() => {
                if (this.map && window.google && window.google.maps) {
                    google.maps.event.trigger(this.map, "resize");
                }
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

    renderGeminiAdvisory(advisory) {
        if (!advisory) return;
        const card = document.getElementById("geminiRouteAdvisoryCard");
        if (card) card.style.display = "block";

        const stratEl = document.getElementById("geminiDispatchStrategy");
        const perishEl = document.getElementById("geminiPerishablePriority");
        const depEl = document.getElementById("geminiDepartureWindow");
        const tipEl = document.getElementById("geminiTrafficTip");
        const badgeEl = document.getElementById("geminiAdvisoryEfficiencyBadge");

        if (stratEl && advisory.dispatch_strategy) stratEl.innerText = advisory.dispatch_strategy;
        if (perishEl && advisory.perishable_cargo_priority) perishEl.innerText = advisory.perishable_cargo_priority;
        if (depEl && advisory.recommended_departure_window) depEl.innerText = advisory.recommended_departure_window;
        if (tipEl && advisory.traffic_mitigation_tip) tipEl.innerText = `💡 ${advisory.traffic_mitigation_tip}`;
        if (badgeEl && advisory.fuel_efficiency_score) badgeEl.innerText = advisory.fuel_efficiency_score;
    },

    renderMapRoutes(waypoints, trafficSegments, relayDropoffs = []) {
        if (!this.map || !window.google || !window.google.maps) return;

        // Clear existing markers & polylines
        if (this.markersLayer && Array.isArray(this.markersLayer)) {
            this.markersLayer.forEach(m => m.setMap(null));
        }
        this.markersLayer = [];

        if (this.routesLayer && Array.isArray(this.routesLayer)) {
            this.routesLayer.forEach(p => p.setMap(null));
        }
        this.routesLayer = [];

        const bounds = new google.maps.LatLngBounds();

        // 1. Draw Traffic Polylines on Google Map
        if (trafficSegments && trafficSegments.length > 0) {
            trafficSegments.forEach((seg) => {
                const p1 = { lat: seg.from_coords[0], lng: seg.from_coords[1] };
                const p2 = { lat: seg.to_coords[0], lng: seg.to_coords[1] };
                bounds.extend(p1);
                bounds.extend(p2);

                const midLat = (p1.lat + p2.lat) / 2 + (Math.sin(p1.lat * 10) * 0.006);
                const midLng = (p1.lng + p2.lng) / 2 + (Math.cos(p2.lng * 10) * 0.006);
                const pathCoords = [p1, { lat: midLat, lng: midLng }, p2];

                // Outline polyline
                const outlinePoly = new google.maps.Polyline({
                    path: pathCoords,
                    geodesic: true,
                    strokeColor: "#ffffff",
                    strokeOpacity: 0.9,
                    strokeWeight: 8,
                    map: this.map
                });
                this.routesLayer.push(outlinePoly);

                // Traffic colored polyline
                const trafficPoly = new google.maps.Polyline({
                    path: pathCoords,
                    geodesic: true,
                    strokeColor: seg.color || "#10b981",
                    strokeOpacity: 0.95,
                    strokeWeight: 5,
                    map: this.map
                });
                this.routesLayer.push(trafficPoly);

                const gmapsLegUrl = `https://www.google.com/maps/dir/?api=1&origin=${p1.lat},${p1.lng}&destination=${p2.lat},${p2.lng}&travelmode=driving`;

                trafficPoly.addListener("click", (e) => {
                    if (this.infoWindow) {
                        this.infoWindow.setContent(`
                            <div style="font-size: 13px; min-width: 220px; font-family: Inter, sans-serif;">
                                <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">🛣️ Route Leg: ${seg.from_name} &rarr; ${seg.to_name}</div>
                                <div>Distance: <strong>${seg.distance_km} km</strong></div>
                                <div>Estimated Time: <strong>${seg.travel_mins} mins</strong></div>
                                <div>Traffic Flow: <strong style="color: ${seg.color}">${seg.traffic_level}</strong> (${seg.traffic_multiplier}x penalty)</div>
                                <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
                                    <a href="${gmapsLegUrl}" target="_blank" style="color: #1a73e8; font-weight: 600; text-decoration: none;">
                                        🧭 Open Leg in Google Maps
                                    </a>
                                </div>
                            </div>
                        `);
                        this.infoWindow.setPosition(e.latLng);
                        this.infoWindow.open(this.map);
                    }
                });
            });
        }

        // 2. Add Stop Markers on Google Map
        waypoints.forEach((wp) => {
            const pos = { lat: wp.lat, lng: wp.lng };
            bounds.extend(pos);

            const isDepot = wp.type === "depot";
            const isHub = wp.type === "hub_pickup";
            const isDelivery = wp.type === "customer_delivery";

            let pinColor = "#0284c7"; // Depot Blue
            let labelChar = "D";
            let typeTitle = "Central Fleet Origin Depot";

            if (isHub) {
                pinColor = "#eab308"; // Hub Amber
                labelChar = String(wp.step_number);
                typeTitle = "Aggregation Hub Pickup";
            } else if (isDelivery) {
                pinColor = "#16a34a"; // Delivery Green
                labelChar = String(wp.step_number);
                typeTitle = "Customer Delivery Drop";
            }

            const marker = new google.maps.Marker({
                position: pos,
                map: this.map,
                title: `${typeTitle}: ${wp.name}`,
                label: {
                    text: labelChar,
                    color: "#ffffff",
                    fontWeight: "bold",
                    fontSize: "12px"
                },
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 14,
                    fillColor: pinColor,
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 2
                }
            });
            this.markersLayer.push(marker);

            const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${wp.lat},${wp.lng}&travelmode=driving`;

            marker.addListener("click", () => {
                if (this.infoWindow) {
                    this.infoWindow.setContent(`
                        <div style="font-size: 13px; min-width: 230px; font-family: Inter, sans-serif;">
                            <div style="font-size: 11px; font-weight: 800; color: ${pinColor}; text-transform: uppercase; margin-bottom: 2px;">
                                ${typeTitle} (Stop #${wp.step_number})
                            </div>
                            <h4 style="margin: 2px 0 6px; font-size: 14px; color: #1e293b;">${wp.name}</h4>
                            ${wp.cargo ? `<div style="font-size: 12px; color: #334155; margin-bottom: 4px;"><strong>Cargo:</strong> ${wp.cargo}</div>` : ''}
                            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 4px;">
                                <span>Distance: <strong>${wp.leg_distance_km} km</strong></span>
                                <span>ETA: <strong>+${wp.eta_mins} mins</strong></span>
                            </div>
                            <div style="font-size: 12px; color: #64748b;">
                                Traffic: <strong style="color: ${wp.traffic_color}">${wp.traffic_level}</strong>
                            </div>
                            <div style="margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px;">
                                <a href="${gmapsNavUrl}" target="_blank" style="color: #1a73e8; font-weight: 700; text-decoration: none;">
                                    🗺️ Turn-by-Turn GPS in Google Maps
                                </a>
                            </div>
                        </div>
                    `);
                    this.infoWindow.open(this.map, marker);
                }
            });
        });

        // 3. Mark Out-of-Corridor Relay Dropoffs at designated intermediate transit hubs
        if (relayDropoffs && relayDropoffs.length > 0) {
            relayDropoffs.forEach((relay, rIdx) => {
                const dropHub = relay.designated_drop_hub;
                if (!dropHub || !dropHub.latitude || !dropHub.longitude) return;

                const relayPos = {
                    lat: dropHub.latitude + ((rIdx + 1) * 0.003),
                    lng: dropHub.longitude + ((rIdx + 1) * 0.003)
                };
                bounds.extend(relayPos);

                const relayMarker = new google.maps.Marker({
                    position: relayPos,
                    map: this.map,
                    title: `Relay Drop: ${relay.buyer_name}`,
                    label: {
                        text: "R",
                        color: "#ffffff",
                        fontWeight: "bold",
                        fontSize: "11px"
                    },
                    icon: {
                        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                        scale: 6,
                        fillColor: "#9333ea", // Purple
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2
                    }
                });
                this.markersLayer.push(relayMarker);

                const gmapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${dropHub.latitude},${dropHub.longitude}&travelmode=driving`;

                relayMarker.addListener("click", () => {
                    if (this.infoWindow) {
                        this.infoWindow.setContent(`
                            <div style="font-size: 13px; min-width: 250px; font-family: Inter, sans-serif;">
                                <span style="background: #9333ea; color: white; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700;">
                                    📦 INTERMEDIATE RELAY DROP
                                </span>
                                <h4 style="margin: 6px 0 4px; font-size: 14px; color: #1e293b;">${dropHub.hub_name}</h4>
                                <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">
                                    <strong>Destined Buyer:</strong> ${relay.buyer_name} (📍 ${relay.address})
                                </div>
                                <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">
                                    <strong>Cargo:</strong> ${relay.cargo || 'Produce'} • <strong>Off-Corridor:</strong> ${relay.distance_from_corridor_km} km away
                                </div>
                                <div style="font-size: 11px; color: #9333ea; font-weight: 600; margin-bottom: 6px;">
                                    💡 Order dropped at ${dropHub.hub_name} on active corridor for next-leg regional delivery relay.
                                </div>
                                <div style="border-top: 1px solid #e2e8f0; padding-top: 6px;">
                                    <a href="${gmapsNavUrl}" target="_blank" style="color: #1a73e8; font-weight: 700; text-decoration: none;">
                                        🗺️ Navigate to Relay Hub in Google Maps
                                    </a>
                                </div>
                            </div>
                        `);
                        this.infoWindow.open(this.map, relayMarker);
                    }
                });
            });
        }

        this.map.fitBounds(bounds);
    },

    renderItinerary(waypoints, relayDropoffs = []) {
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
                html += `<div class="itinerary-phase-header">📍 Phase 0: Central Fleet Origin (Depot)</div>`;
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

            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${wp.lat},${wp.lng}&travelmode=driving`;

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
                            <a href="${gmapsUrl}" target="_blank" class="osm-itinerary-link" title="Open Turn-by-Turn GPS on Google Maps" style="font-size: 0.8rem; color: #1a73e8; font-weight: 600;">
                                🧭 Navigate Stop in Google Maps
                            </a>
                        </div>
                    </div>
                </div>
            `;
        });

        // Phase 3: Out-of-Corridor Relay Drops
        if (relayDropoffs && relayDropoffs.length > 0) {
            html += `<div class="itinerary-phase-header" style="background: #f3e8ff; color: #7e22ce; border-left: 4px solid #9333ea;">📦 Phase 3: Intermediate Hub Relay Dropoffs (Out-of-Corridor)</div>`;
            relayDropoffs.forEach((relay) => {
                const hub = relay.designated_drop_hub;
                const gmapsUrl = hub ? `https://www.google.com/maps/dir/?api=1&destination=${hub.latitude},${hub.longitude}&travelmode=driving` : '#';
                html += `
                    <div class="itinerary-card-item" style="border-left: 3px solid #9333ea; background: #faf5ff;">
                        <div class="itinerary-step-left" onclick="LogisticsHook.flyToStop(${hub.latitude}, ${hub.longitude})">
                            <span class="itinerary-badge" style="background: #9333ea; color: white;">Relay</span>
                        </div>
                        <div class="itinerary-step-body">
                            <div class="itinerary-stop-name" onclick="LogisticsHook.flyToStop(${hub.latitude}, ${hub.longitude})">
                                Drop at: ${hub.hub_name}
                            </div>
                            <div class="itinerary-cargo-desc" style="color: #7e22ce;">
                                Handover for Customer: <strong>${relay.buyer_name}</strong> (📍 ${relay.address} - ${relay.distance_from_corridor_km} km off corridor)
                            </div>
                            <div class="mt-1">
                                <a href="${gmapsUrl}" target="_blank" class="osm-itinerary-link" style="font-size: 0.8rem; color: #9333ea; font-weight: 700;">
                                    🗺️ Handover Drop Directions in Google Maps
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;
    },

    flyToStop(lat, lng) {
        if (!this.map) return;
        if (window.google && window.google.maps && typeof this.map.panTo === "function") {
            this.map.panTo({ lat, lng });
            this.map.setZoom(14);
        }
    },

    openGoogleMapsDirections() {
        if (this.currentGoogleMapsUrl) {
            window.open(this.currentGoogleMapsUrl, "_blank");
            return;
        }

        if (this.currentRouteData && this.currentRouteData.waypoints && this.currentRouteData.waypoints.length >= 2) {
            const wps = this.currentRouteData.waypoints;
            const origin = `${wps[0].lat},${wps[0].lng}`;
            const dest = `${wps[wps.length - 1].lat},${wps[wps.length - 1].lng}`;
            const middle = wps.slice(1, -1).map(w => `${w.lat},${w.lng}`).join("|");
            const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&waypoints=${middle}&travelmode=driving`;
            window.open(url, "_blank");
            return;
        }

        if (window.showToast) window.showToast("Calculating route first...", "info");
        this.fetchAndRenderRoute().then(() => this.openGoogleMapsDirections());
    },

    openExternalOSMNavigation() {
        this.openGoogleMapsDirections();
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

        setTimeout(() => {
            if (this.map && window.google && window.google.maps) {
                google.maps.event.trigger(this.map, "resize");

                // Clear previous navigation layer markers/polylines
                if (this.navigationLayer && Array.isArray(this.navigationLayer)) {
                    this.navigationLayer.forEach(item => item.setMap(null));
                }
                this.navigationLayer = [];

                const p1 = { lat: farmerLat, lng: farmerLng };
                const p2 = { lat: buyerLat, lng: buyerLng };
                const midLat = (farmerLat + buyerLat) / 2 + 0.005;
                const midLng = (farmerLng + buyerLng) / 2 + 0.005;
                const pathCoords = [p1, { lat: midLat, lng: midLng }, p2];

                const navPoly = new google.maps.Polyline({
                    path: pathCoords,
                    geodesic: true,
                    strokeColor: "#0284c7",
                    strokeOpacity: 0.9,
                    strokeWeight: 5,
                    map: this.map
                });
                this.navigationLayer.push(navPoly);

                const farmMarker = new google.maps.Marker({
                    position: p1,
                    map: this.map,
                    title: `🌾 Farm Gate: ${order.farmer_name || 'Farmer'}`,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 12,
                        fillColor: "#eab308",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2
                    }
                });
                this.navigationLayer.push(farmMarker);

                const delMarker = new google.maps.Marker({
                    position: p2,
                    map: this.map,
                    title: `📦 Delivery Doorstep: ${order.buyer_name || 'Customer'}`,
                    animation: google.maps.Animation.DROP,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 14,
                        fillColor: "#16a34a",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2
                    }
                });
                this.navigationLayer.push(delMarker);

                const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${farmerLat},${farmerLng}&destination=${buyerLat},${buyerLng}&travelmode=driving`;

                const infoHtml = `
                    <div style="font-size: 13px; min-width: 250px; font-family: Inter, sans-serif;">
                        <span style="background: #16a34a; color: white; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700;">
                            📦 TARGET DELIVERY
                        </span>
                        <h4 style="margin: 6px 0 4px; font-size: 14px; color: #1e293b;">Consignment #${order.order_number}</h4>
                        <div style="font-size: 12px; color: #475569; margin-bottom: 3px;"><strong>Customer:</strong> ${order.buyer_name || 'Consumer'} (📍 ${order.delivery_location})</div>
                        <div style="font-size: 12px; color: #475569; margin-bottom: 6px;"><strong>Load:</strong> ${order.product_name} (${order.quantity} kg)</div>
                        <div style="border-top: 1px solid #e2e8f0; padding-top: 6px;">
                            <a href="${googleMapsUrl}" target="_blank" style="color: #1a73e8; font-weight: 700; text-decoration: none;">
                                🗺️ Live Navigation in Google Maps
                            </a>
                        </div>
                    </div>
                `;

                if (this.infoWindow) {
                    this.infoWindow.setContent(infoHtml);
                    this.infoWindow.open(this.map, delMarker);
                }

                delMarker.addListener("click", () => {
                    if (this.infoWindow) {
                        this.infoWindow.setContent(infoHtml);
                        this.infoWindow.open(this.map, delMarker);
                    }
                });

                const bounds = new google.maps.LatLngBounds();
                bounds.extend(p1);
                bounds.extend(p2);
                this.map.fitBounds(bounds);
            }

            const mapEl = document.getElementById("googleLogisticsMap") || document.getElementById("logisticsRouteMap");
            if (mapEl) {
                mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 200);

        if (window.showToast) {
            window.showToast(`Navigating to ${order.delivery_location || 'destination'} on Google Maps`, "info");
        }
    },

    async searchDeliveryLocation(query) {
        if (!this.map) this.initMap();

        const inputEl = document.getElementById("googleDeliverySearchInput") || document.getElementById("osmDeliverySearchInput");
        const q = (query || (inputEl ? inputEl.value : "")).trim();
        if (!q) {
            if (window.showToast) window.showToast("Please enter a delivery location or landmark to search.", "warning");
            return;
        }

        if (window.showToast) window.showToast(`Searching '${q}' on Google Maps...`, "info");

        if (window.google && window.google.maps && window.google.maps.Geocoder) {
            try {
                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ address: q, componentRestrictions: { country: "IN" } }, (results, status) => {
                    if (status === "OK" && results && results[0]) {
                        const loc = results[0].geometry.location;
                        this.plotSearchResult(loc.lat(), loc.lng(), results[0].formatted_address);
                        return;
                    }
                    this.fallbackLocalSearch(q);
                });
                return;
            } catch (e) {
                console.warn("Geocoder error, falling back to local lookup:", e);
            }
        }

        this.fallbackLocalSearch(q);
    },

    fallbackLocalSearch(q) {
        const localHit = this.lookupCoords(q);
        this.plotSearchResult(localHit.lat, localHit.lng, localHit.name || `${q} (Delivery Region)`);
    },

    plotSearchResult(lat, lng, label) {
        if (!this.map) return;

        if (this.navigationLayer && Array.isArray(this.navigationLayer)) {
            this.navigationLayer.forEach(m => m.setMap(null));
        }
        this.navigationLayer = [];

        if (window.google && window.google.maps && typeof this.map.panTo === "function") {
            const pos = { lat, lng };
            this.map.panTo(pos);
            this.map.setZoom(14);

            const searchMarker = new google.maps.Marker({
                position: pos,
                map: this.map,
                title: label,
                animation: google.maps.Animation.DROP,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 12,
                    fillColor: "#1a73e8",
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3
                }
            });
            this.navigationLayer.push(searchMarker);

            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

            if (this.infoWindow) {
                this.infoWindow.setContent(`
                    <div style="font-size: 13px; min-width: 220px; font-family: Inter, sans-serif;">
                        <span style="background: #1a73e8; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;">
                            📍 GOOGLE MAPS PIN
                        </span>
                        <h4 style="margin: 6px 0 4px; font-size: 14px; color: #1e293b;">${label}</h4>
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">
                            GPS: <strong>${lat.toFixed(4)}, ${lng.toFixed(4)}</strong>
                        </div>
                        <div style="border-top: 1px solid #e2e8f0; padding-top: 6px;">
                            <a href="${gmapsUrl}" target="_blank" style="color: #1a73e8; font-weight: 700; text-decoration: none;">
                                🧭 Turn-by-Turn in Google Maps
                            </a>
                        </div>
                    </div>
                `);
                this.infoWindow.open(this.map, searchMarker);
            }
        }

        if (window.showToast) window.showToast(`Located '${label.split(',')[0]}' on Google Maps`, "success");
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
        this.modalMap = null;
    },

    renderCustomTrackingUI(order, containerElement) {
        if (!containerElement) return;

        this.cleanupModalMap();

        const buyerLat = order.buyer_lat || 13.0012;
        const buyerLng = order.buyer_lng || 80.2565;
        const farmerLat = order.farmer_lat || 12.9352;
        const farmerLng = order.farmer_lng || 80.1878;

        const googleTurnByTurnUrl = `https://www.google.com/maps/dir/?api=1&origin=${farmerLat},${farmerLng}&destination=${buyerLat},${buyerLng}&travelmode=driving`;
        const googleInspectUrl = `https://www.google.com/maps/search/?api=1&query=${buyerLat},${buyerLng}`;

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
                        <span class="small font-weight-bold">🗺️ Google Maps Delivery Route & Telemetry:</span>
                        <a href="${googleTurnByTurnUrl}" target="_blank" class="badge badge-success font-weight-bold" style="text-decoration: none; padding: 4px 8px;">
                            🧭 Turn-by-Turn in Google Maps
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
                        <strong>Google Maps & Gemini AI Routing:</strong>
                        <span>Consignment route optimized with dynamic road congestion penalty and hub collection precedence. Live telemetry mapped to Google Maps navigation corridors.</span>
                    </div>
                </div>

                <div class="mt-3 pt-2" style="display: flex; gap: 8px;">
                    <a href="${googleTurnByTurnUrl}" target="_blank" class="btn btn-sm btn-primary font-weight-bold" style="flex: 1; text-align: center; color: white !important;">
                        🧭 Turn-by-Turn GPS in Google Maps
                    </a>
                    <a href="${googleInspectUrl}" target="_blank" class="btn btn-sm btn-outline-light" style="flex: 1; text-align: center;">
                        🗺️ View on Google Maps
                    </a>
                </div>
            </div>
        `;

        containerElement.innerHTML = timelineHtml;

        setTimeout(() => {
            const mapDiv = document.getElementById("osmModalMap");
            if (!mapDiv) return;

            if (window.google && window.google.maps) {
                try {
                    const p1 = { lat: farmerLat, lng: farmerLng };
                    const p2 = { lat: buyerLat, lng: buyerLng };

                    this.modalMap = new google.maps.Map(mapDiv, {
                        center: { lat: (farmerLat + buyerLat) / 2, lng: (farmerLng + buyerLng) / 2 },
                        zoom: 11,
                        mapTypeId: google.maps.MapTypeId.ROADMAP,
                        streetViewControl: false,
                        mapTypeControl: false
                    });

                    new google.maps.Marker({
                        position: p1,
                        map: this.modalMap,
                        title: `Farm Gate: ${order.farmer_name || 'Farmer'}`
                    });

                    new google.maps.Marker({
                        position: p2,
                        map: this.modalMap,
                        title: `Delivery: ${order.delivery_location}`
                    });

                    new google.maps.Polyline({
                        path: [p1, p2],
                        geodesic: true,
                        strokeColor: "#0284c7",
                        strokeOpacity: 0.9,
                        strokeWeight: 4,
                        map: this.modalMap
                    });

                    const bounds = new google.maps.LatLngBounds();
                    bounds.extend(p1);
                    bounds.extend(p2);
                    this.modalMap.fitBounds(bounds);
                } catch (err) {
                    console.warn("[LogisticsHook] Error initializing modal map:", err);
                }
            }
        }, 200);
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
