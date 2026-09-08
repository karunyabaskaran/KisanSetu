/**
 * KisanSetu - Buyer / Bulk Buyer Controller & Cart Engine
 * Handles:
 * 1. Location-Prioritized Marketplace with Chennai/Nearby Clustering
 * 2. Dynamic Slab Price Calculator based on user-entered quantity
 * 3. Multi-Vendor Buyer Cart (Min 4 distinct crops & Min 2kg per crop)
 * 4. Interactive Demo Payment Gateway (COD, UPI Simulator, Card Simulator)
 * 5. Official Commercial Tax Invoice view & printable format
 * 6. My Orders with Tracking, Invoice, and 7-Day Return Request
 * 7. Support & Grievances to Ministry
 * 8. Profile Management
 */

const BuyerCart = {
    items: JSON.parse(localStorage.getItem("kisansetu_buyer_cart") || "[]"),
    anchorLocation: JSON.parse(localStorage.getItem("kisansetu_cart_anchor") || "null"),

    save() {
        try {
            localStorage.setItem("kisansetu_buyer_cart", JSON.stringify(this.items));
            if (this.anchorLocation) {
                localStorage.setItem("kisansetu_cart_anchor", JSON.stringify(this.anchorLocation));
            } else {
                localStorage.removeItem("kisansetu_cart_anchor");
            }
        } catch (_e) {}
        this.updateBadge();
        this.renderLocationOptimizationBanner();
    },

    updateBadge() {
        const badge = document.getElementById("buyerCartCountBadge");
        if (badge) {
            badge.textContent = this.items.length;
            badge.style.display = this.items.length > 0 ? "inline-block" : "none";
        }
    },

    calculateItemUnitPrice(slabs, qty) {
        if (!slabs || slabs.length === 0) return 40.0;
        const q = parseFloat(qty) || 2.0;
        let price = parseFloat(slabs[0].price_per_kg) || 40.0;
        for (const s of slabs) {
            const minQ = parseFloat(s.min_quantity) || 0.0;
            const maxQ = (s.max_quantity !== null && s.max_quantity !== undefined && s.max_quantity !== "") ? parseFloat(s.max_quantity) : null;
            if (q >= minQ && (maxQ === null || q <= maxQ)) {
                price = parseFloat(s.price_per_kg);
                break;
            } else if (q >= minQ) {
                price = parseFloat(s.price_per_kg);
            }
        }
        return price;
    },

    addItem(product, qty = 2.0) {
        const validQty = Math.max(2.0, parseFloat(qty) || 2.0);
        const existingIndex = this.items.findIndex(i => i.id === product.id);

        if (existingIndex >= 0) {
            this.items[existingIndex].quantity = parseFloat((this.items[existingIndex].quantity + validQty).toFixed(1));
            this.items[existingIndex].unit_price = this.calculateItemUnitPrice(this.items[existingIndex].slabs, this.items[existingIndex].quantity);
            this.items[existingIndex].total = parseFloat((this.items[existingIndex].unit_price * this.items[existingIndex].quantity).toFixed(2));
        } else {
            const unitPrice = this.calculateItemUnitPrice(product.slabs, validQty);
            const newItem = {
                id: product.id,
                name: product.name,
                category: product.category,
                variety: product.variety,
                grade: product.grade,
                image_url: product.image_url,
                farmer_id: product.farmer_id,
                farmer_name: product.farmer_name,
                farmer_district: product.farmer_district,
                farmer_state: product.farmer_state,
                slabs: product.slabs,
                quantity: validQty,
                unit_price: unitPrice,
                total: parseFloat((unitPrice * validQty).toFixed(2))
            };
            this.items.push(newItem);

            // Set anchor location if first product added
            if (this.items.length === 1) {
                this.anchorLocation = {
                    district: product.farmer_district,
                    state: product.farmer_state,
                    name: product.name
                };
            }
        }

        this.save();
        window.showToast(`Added ${product.name} (${validQty} kg) to cart!`, "success");
    },

    updateQuantity(productId, newQty) {
        const item = this.items.find(i => i.id === productId);
        if (!item) return;
        const q = Math.max(0.5, parseFloat(newQty) || 2.0);
        item.quantity = q;
        item.unit_price = this.calculateItemUnitPrice(item.slabs, q);
        item.total = parseFloat((item.unit_price * q).toFixed(2));
        this.save();
    },

    removeItem(productId) {
        this.items = this.items.filter(i => i.id !== productId);
        if (this.items.length === 0) {
            this.anchorLocation = null;
        }
        this.save();
        window.showToast("Item removed from cart.", "info");
    },

    clear() {
        this.items = [];
        this.anchorLocation = null;
        this.save();
    },

    getSummary() {
        const distinctCount = this.items.length;
        const allMeetMinWeight = distinctCount > 0 && this.items.every(i => parseFloat(i.quantity) >= 2.0);
        const canCheckout = distinctCount >= 4 && allMeetMinWeight;

        const productCost = this.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);
        const totalWeight = this.items.reduce((sum, i) => sum + i.quantity, 0);
        const transportCost = distinctCount > 0 ? (60.0 + (totalWeight * 1.5)) : 0;
        const packagingCost = distinctCount > 0 ? (30.0 + (distinctCount * 10)) : 0;
        const taxAmount = (productCost + transportCost + packagingCost) * 0.05;
        const totalPayable = productCost + transportCost + packagingCost + taxAmount;

        return {
            distinctCount,
            allMeetMinWeight,
            canCheckout,
            productCost: parseFloat(productCost.toFixed(2)),
            transportCost: parseFloat(transportCost.toFixed(2)),
            packagingCost: parseFloat(packagingCost.toFixed(2)),
            taxAmount: parseFloat(taxAmount.toFixed(2)),
            totalPayable: parseFloat(totalPayable.toFixed(2)),
            totalWeight: parseFloat(totalWeight.toFixed(1))
        };
    },

    renderLocationOptimizationBanner() {
        const banner = document.getElementById("cartLocationBanner");
        const bannerText = document.getElementById("cartLocationBannerText");
        if (!banner) return;

        if (this.anchorLocation && this.items.length > 0) {
            banner.style.display = "flex";
            if (bannerText) {
                const isChennaiArea = (this.anchorLocation.district && this.anchorLocation.district.toLowerCase().includes("chennai")) ||
                                      (this.anchorLocation.state && this.anchorLocation.state.toLowerCase().includes("tamil nadu"));
                bannerText.innerHTML = `First crop added: <strong>${this.anchorLocation.name}</strong> from <strong>${this.anchorLocation.district || ''}, ${this.anchorLocation.state || ''}</strong>. Showing and prioritizing farm produce from ${isChennaiArea ? 'Chennai / Tamil Nadu cluster' : this.anchorLocation.district + ' corridor'} for single-carrier consolidated delivery!`;
            }
        } else {
            banner.style.display = "none";
        }
    }
};

const BuyerController = {
    selectedProductForOrder: null,
    selectedOrderForReturn: null,
    currentPaymentMode: "upi",

    init() {
        BuyerCart.updateBadge();
        BuyerCart.renderLocationOptimizationBanner();
        this.loadMarketplace();
        this.loadMyOrders();
        this.loadTickets();
        this.loadProfile();

        // Listen for quantity / filter changes
        const qtyInput = document.getElementById("buyerQtyInput");
        if (qtyInput && !qtyInput.dataset.bound) {
            qtyInput.dataset.bound = "true";
            qtyInput.addEventListener("input", () => this.loadMarketplace());
        }

        const searchInput = document.getElementById("buyerSearchInput");
        if (searchInput && !searchInput.dataset.bound) {
            searchInput.dataset.bound = "true";
            searchInput.addEventListener("input", () => this.loadMarketplace());
        }

        const catFilter = document.getElementById("buyerCategoryFilter");
        if (catFilter && !catFilter.dataset.bound) {
            catFilter.dataset.bound = "true";
            catFilter.addEventListener("change", () => this.loadMarketplace());
        }
    },

    // --- Marketplace ---
    async loadMarketplace() {
        const user = api.currentUser;
        const buyerState = user ? user.state : "";
        const searchInput = document.getElementById("buyerSearchInput");
        const qtyInput = document.getElementById("buyerQtyInput");
        const categoryFilter = document.getElementById("buyerCategoryFilter");

        const search = searchInput ? searchInput.value.trim() : "";
        const quantity = qtyInput ? parseFloat(qtyInput.value) || 2 : 2;
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

            let prods = res.products || [];
            if (prods.length === 0) {
                container.innerHTML = `
                    <div class="empty-state-card col-12">
                        <div class="empty-icon">🌾</div>
                        <h3>${i18n.t("empty_no_marketplace")}</h3>
                        <p class="small text-muted">No produce listed by registered farmers yet. Farmers can list crops from their portal.</p>
                    </div>
                `;
                return;
            }

            // Proximity Sorting Optimization: If anchor location exists, prioritize matching district/state
            const anchor = BuyerCart.anchorLocation;
            if (anchor && prods.length > 0) {
                prods = [...prods].sort((a, b) => {
                    const aDistMatch = (a.farmer_district && anchor.district && a.farmer_district.toLowerCase() === anchor.district.toLowerCase()) ? 2 :
                                      (a.farmer_state && anchor.state && a.farmer_state.toLowerCase() === anchor.state.toLowerCase()) ? 1 : 0;
                    const bDistMatch = (b.farmer_district && anchor.district && b.farmer_district.toLowerCase() === anchor.district.toLowerCase()) ? 2 :
                                      (b.farmer_state && anchor.state && b.farmer_state.toLowerCase() === anchor.state.toLowerCase()) ? 1 : 0;
                    return bDistMatch - aDistMatch;
                });
            }

            container.innerHTML = prods.map(p => {
                let proximityClass = "prox-national";
                if (p.proximity_tier === 0) proximityClass = "prox-local";
                else if (p.proximity_tier === 1) proximityClass = "prox-neighbor";

                const isAnchorNearby = anchor && ((p.farmer_district && anchor.district && p.farmer_district.toLowerCase() === anchor.district.toLowerCase()) ||
                                                  (p.farmer_state && anchor.state && p.farmer_state.toLowerCase() === anchor.state.toLowerCase()));

                const effectiveUnitPrice = BuyerCart.calculateItemUnitPrice(p.slabs, quantity);
                const effectiveTotal = (effectiveUnitPrice * quantity).toFixed(2);

                return `
                    <div class="buyer-product-card ${proximityClass} ${isAnchorNearby ? 'anchor-matched-card' : ''}">
                        <div class="buyer-img-box">
                            <img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600'">
                            <span class="proximity-badge ${proximityClass}">📍 ${p.proximity_label}</span>
                            <span class="grade-badge">${p.grade}</span>
                            ${isAnchorNearby ? '<span class="anchor-cluster-tag" style="position: absolute; bottom: 8px; left: 8px; background: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">⚡ Nearby Hub Corridor</span>' : ''}
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
                                        <span class="slab-price-val">₹${effectiveUnitPrice}</span> <span class="unit-text">/ kg</span>
                                        <div class="active-slab-note">${i18n.t("lbl_applicable_slab")} (${quantity} kg)</div>
                                    </div>
                                    <div class="total-calc-box text-right">
                                        <div class="small text-muted">${i18n.t("th_total")}</div>
                                        <strong class="total-amount">₹${effectiveTotal}</strong>
                                    </div>
                                </div>

                                <!-- Slab breakdown pills with active highlight -->
                                <div class="slab-chips-summary">
                                    ${p.slabs.map(s => {
                                        const minQ = parseFloat(s.min_quantity) || 0;
                                        const maxQ = (s.max_quantity !== null && s.max_quantity !== undefined && s.max_quantity !== "") ? parseFloat(s.max_quantity) : null;
                                        const isMatching = quantity >= minQ && (maxQ === null || quantity <= maxQ);
                                        return `
                                            <span class="mini-slab-chip ${isMatching ? 'chip-active' : ''}">
                                                ${minQ}${maxQ ? '-' + maxQ : '+'} kg: ₹${s.price_per_kg}
                                            </span>
                                        `;
                                    }).join('')}
                                </div>
                            </div>

                            <div style="display: flex; gap: 8px; margin-top: 10px;">
                                <button class="btn btn-outline-primary" style="flex: 1; font-weight: 700;" onclick="BuyerController.addToCart(${JSON.stringify(p).replace(/"/g, '&quot;')}, ${quantity})">
                                    🛒 Add to Cart
                                </button>
                                <button class="btn btn-primary" style="flex: 1; font-weight: 700;" onclick="BuyerController.quickBuy(${JSON.stringify(p).replace(/"/g, '&quot;')}, ${quantity})">
                                    ⚡ Order
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<div class="error-box col-12">Failed to load marketplace: ${err.message}</div>`;
        }
    },

    addToCart(product, quantity = 2.0) {
        const user = api.currentUser;
        if (!user || user.role !== "buyer") {
            window.showToast("Please log in as a Buyer to add items to cart.", "warning");
            window.showLoginModal("buyer");
            return;
        }
        BuyerCart.addItem(product, quantity);
        this.loadMarketplace();
    },

    quickBuy(product, quantity = 2.0) {
        const user = api.currentUser;
        if (!user || user.role !== "buyer") {
            window.showToast("Please log in as a Buyer to place orders.", "warning");
            window.showLoginModal("buyer");
            return;
        }
        // Add item to cart and immediately open cart drawer to check multi-item constraints
        BuyerCart.addItem(product, quantity);
        this.openCartModal();
    },

    // --- Buyer Cart Drawer & Checkout ---
    openCartModal() {
        const user = api.currentUser;
        if (!user || user.role !== "buyer") {
            window.showToast("Please log in as a Buyer to view your cart.", "warning");
            window.showLoginModal("buyer");
            return;
        }

        const modal = document.getElementById("buyerCartModal");
        if (!modal) return;

        // Prefill delivery address from profile if empty
        const addrField = document.getElementById("cart_delivery_address");
        if (addrField && !addrField.value.trim()) {
            const addrParts = [user.address, user.village, user.district, user.state, user.pincode].filter(Boolean);
            addrField.value = addrParts.join(", ");
        }

        this.renderCartItems();
        modal.classList.add("active");
    },

    closeCartModal() {
        const modal = document.getElementById("buyerCartModal");
        if (modal) modal.classList.remove("active");
    },

    clearCart() {
        if (confirm("Are you sure you want to remove all items from your cart?")) {
            BuyerCart.clear();
            this.renderCartItems();
            this.loadMarketplace();
            window.showToast("Cart cleared.", "info");
        }
    },

    renderCartItems() {
        const container = document.getElementById("buyerCartItemsList");
        if (!container) return;

        const summary = BuyerCart.getSummary();
        const items = BuyerCart.items;

        // Update Validation Badges
        const countText = document.getElementById("cartRuleCountText");
        const countIcon = document.getElementById("cartRuleCountIcon");
        const countRule = document.getElementById("cartRuleCount");
        if (countText && countRule) {
            countText.textContent = `${summary.distinctCount} / 4 minimum distinct produce added`;
            if (summary.distinctCount >= 4) {
                countIcon.textContent = "✅";
                countRule.style.color = "#15803d";
            } else {
                countIcon.textContent = "⚠️";
                countRule.style.color = "#b45309";
            }
        }

        const weightText = document.getElementById("cartRuleWeightText");
        const weightIcon = document.getElementById("cartRuleWeightIcon");
        const weightRule = document.getElementById("cartRuleWeight");
        if (weightText && weightRule) {
            if (summary.allMeetMinWeight) {
                weightText.textContent = "All produce varieties meet min 2.0 kg requirement";
                weightIcon.textContent = "✅";
                weightRule.style.color = "#15803d";
            } else {
                weightText.textContent = "Every produce type must be at least 2.0 kg";
                weightIcon.textContent = "⚠️";
                weightRule.style.color = "#b45309";
            }
        }

        // Render Summary Breakdown
        const produceEl = document.getElementById("cartSummaryProduceCost");
        const transportEl = document.getElementById("cartSummaryTransportCost");
        const packEl = document.getElementById("cartSummaryPackagingCost");
        const taxEl = document.getElementById("cartSummaryTaxCost");
        const totalEl = document.getElementById("cartSummaryTotalPayable");
        const checkoutBtn = document.getElementById("btnProceedToPayment");

        if (produceEl) produceEl.textContent = `₹${summary.productCost.toFixed(2)}`;
        if (transportEl) transportEl.textContent = `₹${summary.transportCost.toFixed(2)}`;
        if (packEl) packEl.textContent = `₹${summary.packagingCost.toFixed(2)}`;
        if (taxEl) taxEl.textContent = `₹${summary.taxAmount.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `₹${summary.totalPayable.toFixed(2)}`;

        // Enable / Disable checkout button based on both rules
        if (checkoutBtn) {
            checkoutBtn.disabled = !summary.canCheckout;
            if (!summary.canCheckout) {
                checkoutBtn.title = "Consolidated delivery requires at least 4 distinct crops and min 2kg each.";
            } else {
                checkoutBtn.title = "Proceed to select payment method";
            }
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <div style="font-size: 2rem;">🛒</div>
                    <h4 style="margin: 6px 0;">Your Cart is Empty</h4>
                    <p class="small">Add at least 4 farm-fresh produce types (min 2 kg each) from the marketplace to checkout.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(item => {
            const isWeightValid = item.quantity >= 2.0;
            return `
                <div class="cart-item-row">
                    <img src="${item.image_url}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600'">
                    <div class="cart-item-details">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-meta">👨‍🌾 ${item.farmer_name} • 📍 ${item.farmer_district}, ${item.farmer_state}</div>
                        <span class="cart-item-slab-chip">Slab: ₹${item.unit_price} / kg</span>
                        ${!isWeightValid ? '<span style="color: #dc2626; font-size: 0.75rem; font-weight: 700; margin-left: 6px;">(Min 2 kg required)</span>' : ''}
                    </div>
                    <div class="cart-qty-stepper">
                        <button type="button" class="cart-stepper-btn" onclick="BuyerController.updateCartQty(${item.id}, ${item.quantity - 0.5})">-</button>
                        <input type="number" step="0.5" min="0.5" class="cart-qty-input" value="${item.quantity}" onchange="BuyerController.updateCartQty(${item.id}, this.value)">
                        <button type="button" class="cart-stepper-btn" onclick="BuyerController.updateCartQty(${item.id}, ${item.quantity + 0.5})">+</button>
                    </div>
                    <div class="cart-item-price-box">
                        <div class="small text-muted">Subtotal</div>
                        <div class="cart-item-total">₹${item.total.toFixed(2)}</div>
                    </div>
                    <button type="button" class="btn btn-xs btn-outline-danger" onclick="BuyerController.removeCartItem(${item.id})" title="Remove item">✕</button>
                </div>
            `;
        }).join('');
    },

    updateCartQty(productId, qty) {
        BuyerCart.updateQuantity(productId, qty);
        this.renderCartItems();
    },

    removeCartItem(productId) {
        BuyerCart.removeItem(productId);
        this.renderCartItems();
        this.loadMarketplace();
    },

    // --- Interactive Demo Payment Gateway ---
    openPaymentGatewayModal() {
        const summary = BuyerCart.getSummary();
        if (!summary.canCheckout) {
            window.showToast("Checkout requires minimum 4 distinct crop varieties and min 2 kg per crop.", "warning");
            return;
        }

        const addr = document.getElementById("cart_delivery_address") ? document.getElementById("cart_delivery_address").value.trim() : "";
        if (!addr) {
            window.showToast("Please enter your complete delivery destination address.", "error");
            return;
        }

        this.closeCartModal();
        const modal = document.getElementById("paymentGatewayModal");
        if (!modal) return;

        const payableAmountEl = document.getElementById("paymentModalPayableAmount");
        const itemsCountEl = document.getElementById("paymentModalItemsCount");

        if (payableAmountEl) payableAmountEl.textContent = `₹${summary.totalPayable.toFixed(2)}`;
        if (itemsCountEl) itemsCountEl.textContent = `${summary.distinctCount} varieties (${summary.totalWeight} kg consignment)`;

        this.selectPaymentMode("upi");
        modal.classList.add("active");
    },

    closePaymentModal() {
        const modal = document.getElementById("paymentGatewayModal");
        if (modal) modal.classList.remove("active");
        const overlay = document.getElementById("paymentProcessingOverlay");
        if (overlay) overlay.style.display = "none";
    },

    selectPaymentMode(mode) {
        this.currentPaymentMode = mode;
        const modes = ["upi", "card", "cod"];
        modes.forEach(m => {
            const btn = document.getElementById(`payTab_${m}`);
            const view = document.getElementById(`payView_${m}`);
            if (btn) btn.classList.toggle("active", m === mode);
            if (view) view.style.display = m === mode ? "block" : "none";
        });
    },

    async processPayment(mode) {
        const user = api.currentUser;
        if (!user) return;

        const summary = BuyerCart.getSummary();
        const address = document.getElementById("cart_delivery_address") ? document.getElementById("cart_delivery_address").value.trim() : "Farm Direct Delivery";

        const overlay = document.getElementById("paymentProcessingOverlay");
        const titleEl = document.getElementById("paymentProcessingTitle");
        const subEl = document.getElementById("paymentProcessingSubtitle");

        if (overlay) {
            overlay.style.display = "flex";
            if (mode === "upi") {
                if (titleEl) titleEl.textContent = "Verifying UPI Payment...";
                if (subEl) subEl.textContent = "Connecting to NPCI UPI switch & validating test VPA...";
            } else if (mode === "card") {
                if (titleEl) titleEl.textContent = "Processing 3D Secure Authorization...";
                if (subEl) subEl.textContent = "Simulating encrypted card tokenization & OTP approval...";
            } else {
                if (titleEl) titleEl.textContent = "Confirming COD Consignment...";
                if (subEl) subEl.textContent = "Reserving delivery slot with logistics fleet...";
            }
        }

        // Simulate 1.2s realistic gateway handshake
        await new Promise(resolve => setTimeout(resolve, 1200));

        try {
            const txnId = mode === "cod" ? `COD-${Date.now()}` : `${mode.toUpperCase()}-TXN-${Math.floor(100000 + Math.random() * 900000)}`;
            const payStatus = mode === "cod" ? "pending_cod" : "paid_verified";

            const payload = {
                buyer_id: user.id,
                delivery_location: address,
                payment_mode: mode,
                payment_status: payStatus,
                transaction_id: txnId,
                items: BuyerCart.items.map(i => ({
                    product_id: i.id,
                    quantity: i.quantity
                }))
            };

            const res = await api.createCartOrder(payload);

            if (overlay) overlay.style.display = "none";
            this.closePaymentModal();
            BuyerCart.clear();

            window.showToast(`🎉 Order Placed Successfully! ${res.orders ? res.orders.length : 4} orders generated.`, "success");

            // Open My Orders tab and show invoice for the first created order
            window.showBuyerTab("orders");
            await this.loadMyOrders();

            if (res.orders && res.orders[0]) {
                this.openInvoiceModal(res.orders[0]);
            }

            // Trigger cross-panel live propagation
            window.dispatchEvent(new CustomEvent("kisansetu:order_placed", { detail: res }));
            if (window.LogisticsHook && typeof window.LogisticsHook.loadHubOperations === "function") {
                window.LogisticsHook.loadHubOperations();
            }
            if (window.FarmerController && typeof window.FarmerController.loadOrders === "function") {
                window.FarmerController.loadOrders();
            }
        } catch (err) {
            if (overlay) overlay.style.display = "none";
            window.showToast(`Payment processing error: ${err.message}`, "error");
        }
    },

    // --- Official Tax Invoice Modal ---
    openInvoiceModal(order) {
        const modal = document.getElementById("orderInvoiceModal");
        const container = document.getElementById("printableInvoiceContent");
        if (!modal || !container) return;

        const prodCost = order.product_cost || (order.price_per_kg * order.quantity) || 0;
        const transportCost = order.transport_cost || 60.0;
        const packagingCost = order.packaging_cost || 30.0;
        const taxCost = order.tax_amount || ((prodCost + transportCost + packagingCost) * 0.05);
        const totalAmount = order.total_amount || (prodCost + transportCost + packagingCost + taxCost);

        const paymentMode = (order.payment_mode || "upi").toUpperCase();
        const txnId = order.transaction_id || `TXN-DEMO-${order.id}`;
        const isPaid = order.payment_status === "paid_verified" || order.status === "completed";

        container.innerHTML = `
            <div class="tax-invoice-container">
                <!-- Government & Platform Header -->
                <div class="invoice-gov-header">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <img src="images/emblem_india.svg" alt="Emblem" style="height: 38px;">
                            <div>
                                <h3 style="margin: 0; font-size: 1.15rem; color: #0f172a;">KisanSetu Agri-Commerce Federation</h3>
                                <div style="font-size: 0.75rem; color: #475569;">Department of Agriculture & Farmers Welfare, Govt of India</div>
                            </div>
                        </div>
                        <div style="font-size: 0.78rem; color: #64748b;">GSTIN: <strong>33AAAGK9921M1Z5</strong> • Mandi Cess Reg: <strong>TN-MND-8829</strong></div>
                    </div>
                    <div style="text-align: right;">
                        <h4 style="margin: 0 0 4px 0; color: #166534; font-size: 1.2rem;">TAX INVOICE</h4>
                        <div style="font-size: 0.85rem;"><strong>Invoice #:</strong> INV-${order.order_number || ('ORD-' + order.id)}</div>
                        <div style="font-size: 0.82rem; color: #64748b;">Date: ${order.created_at ? order.created_at.split(' ')[0] : new Date().toISOString().split('T')[0]}</div>
                        <div class="mt-1">
                            <span class="invoice-stamp-badge ${isPaid ? 'invoice-stamp-paid' : 'invoice-stamp-cod'}">
                                ${isPaid ? '✓ PAID & VERIFIED' : '💵 CASH ON DELIVERY'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Parties & Consignment Meta Grid -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 18px;">
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Billed & Delivered To (Buyer):</div>
                        <div style="font-weight: 700; color: #0f172a; font-size: 1rem;">${order.buyer_name || 'Registered Buyer'}</div>
                        <div style="font-size: 0.85rem; color: #334155; margin-top: 2px;">📍 ${order.delivery_location || (order.b_address || 'Registered Address')}</div>
                        <div style="font-size: 0.82rem; color: #64748b;">📞 ${order.buyer_mobile || order.b_mobile || 'Registered'}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Origin Farm Gate (Supplier):</div>
                        <div style="font-weight: 700; color: #0f172a; font-size: 1rem;">👨‍🌾 ${order.farmer_name || 'Registered Farmer'}</div>
                        <div style="font-size: 0.85rem; color: #334155; margin-top: 2px;">📍 ${order.f_address || (order.farmer_district + ', ' + order.farmer_state)}</div>
                        <div style="font-size: 0.82rem; color: #64748b;">Consignment Group: <strong>${order.batch_group_id || 'STANDALONE-DIRECT'}</strong></div>
                    </div>
                </div>

                <!-- Line Item Details Table -->
                <table class="kisansetu-table mb-3" style="width: 100%; border: 1px solid #e2e8f0;">
                    <thead style="background: #f1f5f9;">
                        <tr>
                            <th>Commodity Produce</th>
                            <th>HSN Code</th>
                            <th>Variety / Grade</th>
                            <th>Quantity</th>
                            <th>Slab Rate</th>
                            <th style="text-align: right;">Amount (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>${order.product_name}</strong></td>
                            <td>0709</td>
                            <td>${order.grade || 'Grade A Standard'}</td>
                            <td><strong>${order.quantity} kg</strong></td>
                            <td>₹${order.price_per_kg} / kg</td>
                            <td style="text-align: right; font-weight: 700;">₹${prodCost.toFixed(2)}</td>
                        </tr>
                    </tbody>
                </table>

                <!-- Detailed 4-Point Cost Split & Tax Calculation (Requirement 7) -->
                <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
                    <div style="width: 100%; max-width: 380px; background: #fafafa; border: 1px solid #cbd5e1; border-radius: var(--radius-sm); padding: 12px 16px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 4px;">
                            <span class="text-muted">1. Farm Gate Produce Cost:</span>
                            <strong>₹${prodCost.toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 4px;">
                            <span class="text-muted">2. Transportation / Logistics Cost:</span>
                            <strong>₹${transportCost.toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 4px;">
                            <span class="text-muted">3. Food-Grade Packaging & Crating:</span>
                            <strong>₹${packagingCost.toFixed(2)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 6px;">
                            <span class="text-muted">4. Applicable Tax (GST / Mandi Cess 5%):</span>
                            <strong>₹${taxCost.toFixed(2)}</strong>
                        </div>
                        <hr style="margin: 6px 0; border-top: 1px solid #cbd5e1;">
                        <div style="display: flex; justify-content: space-between; font-size: 1.15rem; color: #166534;">
                            <strong>Total Commercial Value:</strong>
                            <strong>₹${totalAmount.toFixed(2)}</strong>
                        </div>
                    </div>
                </div>

                <!-- Payment & Authentication Footer -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 0.82rem; color: #64748b;">
                    <div>
                        <div>Payment Method: <strong>${paymentMode}</strong></div>
                        <div>Payment Status: <strong style="color: ${isPaid ? '#15803d' : '#854d0e'};">${isPaid ? 'PAID & SETTLED' : 'DUE ON PHYSICAL DELIVERY'}</strong></div>
                        <div>Transaction Ref: <code>${txnId}</code></div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: 700; color: #0f172a;">Digitally Signed & Validated</div>
                        <div class="small">KisanSetu National Agri-Commerce Gateway</div>
                    </div>
                </div>
            </div>
        `;

        modal.classList.add("active");
    },

    closeInvoiceModal() {
        const modal = document.getElementById("orderInvoiceModal");
        if (modal) modal.classList.remove("active");
    },

    printInvoice() {
        window.print();
    },

    // --- My Orders & 7-Day Returns ---
    async loadMyOrders() {
        const user = api.currentUser;
        if (!user) return;

        const container = document.getElementById("buyerOrdersTableBody");
        if (!container) return;

        container.innerHTML = `<tr><td colspan="9" class="text-center py-4">Loading your orders...</td></tr>`;

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

                const paymentBadge = o.payment_status === "paid_verified"
                    ? `<span class="badge badge-success" style="font-size: 0.72rem;">PAID (${(o.payment_mode || 'UPI').toUpperCase()})</span>`
                    : `<span class="badge badge-warning" style="font-size: 0.72rem;">COD</span>`;

                return `
                    <tr>
                        <td>
                            <strong>#${o.order_number}</strong>
                            <div class="mt-1">${paymentBadge}</div>
                        </td>
                        <td>${o.created_at ? o.created_at.split(' ')[0] : 'Today'}</td>
                        <td>
                            <strong>${o.product_name}</strong>
                            ${o.batch_group_id ? `<div class="small text-muted" style="font-size: 0.74rem;">Bundle: ${o.batch_group_id.slice(-6)}</div>` : ''}
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
                            <div class="btn-group-actions" style="display: flex; flex-direction: column; gap: 4px;">
                                <button class="btn btn-xs btn-outline-success font-weight-bold" onclick="BuyerController.openInvoiceModal(${JSON.stringify(o).replace(/"/g, '&quot;')})">
                                    🧾 Tax Invoice
                                </button>
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
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const uploadRes = await api.uploadFile(fileInput.files[0]);
                proofUrl = uploadRes.file_url;
            } catch (err) {
                console.warn("Proof upload failed:", err);
            }
        }

        try {
            const res = await api.requestReturn(this.selectedOrderForReturn.id, user.id, reason, proofUrl);
            window.showToast(res.message, "success");
            this.closeReturnModal();
            this.loadMyOrders();

            // Notify farmer
            window.dispatchEvent(new CustomEvent("kisansetu:order_returned", { detail: { order_id: this.selectedOrderForReturn.id } }));
        } catch (err) {
            window.showToast(err.message, "error");
        }
    },

    // --- Support & Grievances ---
    async handleRaiseTicket(e) {
        e.preventDefault();
        const user = api.currentUser;
        if (!user) return;

        const target_entity = document.getElementById("buyer_target_entity").value;
        const subject = document.getElementById("buyer_ticket_subject").value.trim();
        const description = document.getElementById("buyer_ticket_desc").value.trim();
        const expected_resolution = document.getElementById("buyer_ticket_resolution").value.trim();
        const fileInput = document.getElementById("buyer_ticket_file");

        let attachment_url = "";
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const uploadRes = await api.uploadFile(fileInput.files[0]);
                attachment_url = uploadRes.file_url;
            } catch (err) {
                console.warn("Ticket attachment failed:", err);
            }
        }

        try {
            const res = await api.raiseTicket({
                user_id: user.id,
                target_entity,
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

// Global bindings & Event Listeners
window.addEventListener("languageChanged", () => {
    BuyerController.loadMarketplace();
    BuyerController.loadMyOrders();
    BuyerController.loadTickets();
});

window.BuyerCart = BuyerCart;
window.BuyerController = BuyerController;
