/**
 * KisanSetu - Main Application Coordinator & Router
 */

let mapPickerInstance = null;
let currentRole = "farmer"; // 'farmer', 'buyer', 'logistics', 'admin'
let activeFarmerTab = "products";
let activeBuyerTab = "marketplace";

document.addEventListener("DOMContentLoaded", () => {
    initLanguageSelector();
    initOfflineMonitor();
    initEventListeners();
    checkExistingSession();
});

function initOfflineMonitor() {
    const banner = document.getElementById("offlineBanner");
    const bannerText = document.getElementById("offlineBannerText");
    if (!banner) return;

    function updateNetworkStatus() {
        if (!navigator.onLine) {
            banner.classList.add("visible");
            banner.classList.remove("online-recovered");
            if (bannerText) bannerText.innerText = "Offline Mode Active: Browsing preloaded crops, hubs, and data without internet.";
        } else {
            if (banner.classList.contains("visible")) {
                banner.classList.add("online-recovered");
                if (bannerText) bannerText.innerText = "🟢 Back Online: Connected & synchronized with cloud servers.";
                setTimeout(() => {
                    banner.classList.remove("visible", "online-recovered");
                }, 3500);
            }
        }
    }

    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    if (!navigator.onLine) {
        updateNetworkStatus();
    }
}

function initLanguageSelector() {
    const selector = document.getElementById("languageSelector");
    if (!selector) return;

    selector.innerHTML = SUPPORTED_LANGUAGES.map(lang => `
        <option value="${lang.code}">
            ${lang.native} (${lang.name})
        </option>
    `).join('');

    selector.value = window.i18n.currentLang;

    selector.addEventListener("change", (e) => {
        window.i18n.setLanguage(e.target.value);
    });

    window.i18n.applyTranslations();
}

function checkExistingSession() {
    const user = api.currentUser;
    if (user && user.role) {
        setRolePortal(user.role);
    } else {
        showPortalSelectView();
    }
    updateUserDisplay();
}

function updateUserDisplay() {
    const user = api.currentUser;
    const authBox = document.getElementById("headerAuthBox");
    if (!authBox) return;

    if (user) {
        authBox.innerHTML = `
            <div class="user-pill">
                <span class="user-avatar">${user.role === 'farmer' ? '👨‍🌾' : (user.role === 'buyer' ? '🛒' : (user.role === 'admin' ? '🏛️' : '🚛'))}</span>
                <div class="user-details">
                    <strong>${user.name}</strong>
                    <span class="role-badge role-${user.role}">${i18n.t("role_" + user.role).toUpperCase()}</span>
                </div>
            </div>
            <button class="btn btn-sm btn-logout" onclick="handleLogout()" data-i18n="nav_logout" title="Logout from ${user.role.toUpperCase()} panel">
                <span>🚪</span> ${i18n.t("nav_logout")}
            </button>
        `;
    } else {
        authBox.innerHTML = `
            <button class="btn btn-sm btn-outline-light mr-2" onclick="showLoginModal()" data-i18n="login_btn">${i18n.t("login_btn")}</button>
            <button class="btn btn-sm btn-primary-accent" onclick="showRegisterModal()" data-i18n="register_btn">${i18n.t("register_btn")}</button>
        `;
    }
}

function setRolePortal(role) {
    const user = api.currentUser;
    // Security check: If already logged in to a different role, require logout first
    if (user && user.role !== role) {
        showToast(`You are currently logged into the ${user.role.toUpperCase()} panel. To login to another panel, first logout from the already logged in panel.`, "warning");
        return;
    }

    currentRole = role;

    // Hide all role sections and portal selection view
    document.querySelectorAll(".role-section").forEach(sec => sec.classList.remove("active"));

    // Activate the matching section
    const targetSection = document.getElementById(`section_${role}`);
    if (targetSection) {
        targetSection.classList.add("active");
    }

    // Update active portal indicator in header
    updateActivePortalBadge(role);

    // Trigger role-specific controller initialization
    if (role === "farmer") {
        FarmerController.init();
        showFarmerTab(activeFarmerTab);
    } else if (role === "buyer") {
        BuyerController.init();
        showBuyerTab(activeBuyerTab);
    } else if (role === "admin") {
        AdminController.init();
        showAdminTab(activeAdminTab);
    } else if (role === "logistics") {
        initLogisticsView();
        showLogisticsSubTab(activeLogisticsSubTab);
    }

    updateUserDisplay();
}

function showPortalSelectView() {
    currentRole = null;
    document.querySelectorAll(".role-section").forEach(sec => sec.classList.remove("active"));
    const selectSection = document.getElementById("section_portal_select");
    if (selectSection) {
        selectSection.classList.add("active");
    }
    const badge = document.getElementById("activePortalBadge");
    if (badge) {
        badge.style.display = "none";
    }
    updateUserDisplay();
}

function updateActivePortalBadge(role) {
    const badge = document.getElementById("activePortalBadge");
    const iconEl = document.getElementById("activePortalIcon");
    const textEl = document.getElementById("activePortalTitle");
    if (!badge || !iconEl || !textEl) return;

    if (!role) {
        badge.style.display = "none";
        return;
    }

    badge.style.display = "inline-flex";
    const roleMeta = {
        farmer: { icon: "👨‍🌾", title: "Farmer / FPO Portal", cls: "portal-badge-farmer" },
        buyer: { icon: "🛒", title: "Buyer & Marketplace Portal", cls: "portal-badge-buyer" },
        logistics: { icon: "🚛", title: "Logistics & Fleet Network", cls: "portal-badge-logistics" },
        admin: { icon: "🏛️", title: "Ministry of Agriculture Desk", cls: "portal-badge-admin" }
    };

    const meta = roleMeta[role] || { icon: "🌾", title: "Agri Portal", cls: "" };
    iconEl.textContent = meta.icon;
    textEl.textContent = meta.title;
    badge.className = `active-portal-badge ${meta.cls}`;
}

function showFarmerTab(tabName) {
    activeFarmerTab = tabName;
    document.querySelectorAll(".farmer-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".farmer-tab-panel").forEach(panel => {
        panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === tabName);
    });

    if (tabName === "marketplace") {
        loadFarmerMarketplaceBrowse();
    } else if (tabName === "orders") {
        FarmerController.loadOrders();
    } else if (tabName === "support") {
        FarmerController.loadTickets();
    }
}

async function loadFarmerMarketplaceBrowse() {
    const container = document.getElementById("farmerMarketplaceBrowseGrid");
    if (!container) return;

    container.innerHTML = `<div class="loader-spinner">Loading pan-India produce...</div>`;
    try {
        const res = await api.getProducts();
        const prods = res.products || [];
        container.innerHTML = prods.map(p => `
            <div class="produce-card">
                <div class="produce-img-wrap">
                    <img src="${p.image_url}" alt="${p.name}">
                    <span class="grade-tag grade-${p.grade.toLowerCase().replace(' ', '-')}">${p.grade}</span>
                </div>
                <div class="produce-content">
                    <h4>${p.name}</h4>
                    <div class="variety-sub">Farmer: <strong>${p.farmer_name}</strong> (${p.farmer_district}, ${p.farmer_state})</div>
                    <div class="stock-pill">Available: <strong>${p.available_quantity} ${p.unit}</strong></div>
                    <div class="slab-pills-box mt-2">
                        <span class="slab-badge-title">Pricing:</span>
                        <div class="slab-pills-list">
                            ${p.slabs.map(s => `
                                <span class="slab-chip">${s.min_quantity}${s.max_quantity ? '-' + s.max_quantity : '+'} kg: <strong>₹${s.price_per_kg}</strong></span>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<div class="error-box">Failed to load marketplace: ${err.message}</div>`;
    }
}

function showBuyerTab(tabName) {
    activeBuyerTab = tabName;
    document.querySelectorAll(".buyer-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".buyer-tab-panel").forEach(panel => {
        panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === tabName);
    });

    if (tabName === "marketplace") {
        BuyerController.loadMarketplace();
    } else if (tabName === "orders") {
        BuyerController.loadMyOrders();
    } else if (tabName === "support") {
        BuyerController.loadTickets();
    }
}

let activeAdminTab = "directory";
function showAdminTab(tabName) {
    activeAdminTab = tabName;
    document.querySelectorAll(".admin-tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".admin-tab-panel").forEach(panel => {
        panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === tabName);
    });

    if (tabName === "directory") {
        if (window.AdminController && typeof window.AdminController.loadUserDirectory === "function") {
            window.AdminController.loadUserDirectory();
        }
    } else if (tabName === "orders") {
        if (window.AdminController && typeof window.AdminController.loadNationalOrders === "function") {
            window.AdminController.loadNationalOrders();
        }
    } else if (tabName === "grievances") {
        if (window.AdminController && typeof window.AdminController.loadGrievances === "function") {
            window.AdminController.loadGrievances();
        }
    } else if (tabName === "forecast") {
        if (window.AdminController && typeof window.AdminController.loadAIForecasts === "function") {
            window.AdminController.loadAIForecasts();
        }
    }
}

let activeLogisticsSubTab = "operations";
function showLogisticsSubTab(tabName) {
    activeLogisticsSubTab = tabName;
    document.querySelectorAll(".logistics-subnav-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-tab") === tabName);
    });
    document.querySelectorAll(".logistics-subnav-panel").forEach(panel => {
        panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === tabName);
    });

    if (tabName === "pipeline") {
        if (window.LogisticsHook && typeof window.LogisticsHook.renderAuditTable === "function") {
            window.LogisticsHook.renderAuditTable(window.LogisticsHook.allConsignmentsCache);
        }
    }

    if (tabName === "routing") {
        if (window.LogisticsHook) {
            if (!window.LogisticsHook.map || !window.LogisticsHook.isInitialized) {
                window.LogisticsHook.initMap();
            }
            setTimeout(() => {
                if (window.LogisticsHook.map) {
                    window.LogisticsHook.map.invalidateSize();
                }
            }, 100);
            setTimeout(() => {
                if (window.LogisticsHook.map) {
                    window.LogisticsHook.map.invalidateSize();
                }
            }, 300);
        }
    }
}

function toggleFarmerAICard() {
    const stats = document.getElementById("farmerAIStatsGrid");
    const actions = document.querySelector(".farmer-ai-actions-strip");
    const btn = document.getElementById("btnToggleFarmerAI");
    if (!stats || !actions || !btn) return;

    const isHidden = stats.style.display === "none";
    stats.style.display = isHidden ? "grid" : "none";
    actions.style.display = isHidden ? "flex" : "none";
    btn.textContent = isHidden ? "Hide AI Advisor ▲" : "Show AI Advisor ▼";
}

window.showAdminTab = showAdminTab;
window.showLogisticsSubTab = showLogisticsSubTab;
window.toggleFarmerAICard = toggleFarmerAICard;

function initLogisticsView() {
    // Initialize AI Route Optimization Map and Telemetry
    if (window.LogisticsHook && typeof window.LogisticsHook.initMap === "function") {
        window.LogisticsHook.initMap();
    }

    // Load Operating Delivery Hubs, Proximity Pickups & Multi-Hub Route Drops
    if (window.LogisticsHook && typeof window.LogisticsHook.loadHubOperations === "function") {
        window.LogisticsHook.loadHubOperations();
    }
}

async function progressLogisticsOrder(orderId, status, note) {
    try {
        const res = await api.updateOrderStatus(orderId, status, note);
        showToast(res.message, "success");
        initLogisticsView();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// --- Tracking Modal ---
window.showTrackingModal = function(order) {
    const modal = document.getElementById("trackingModal");
    const container = document.getElementById("trackingModalContent");
    if (modal && container) {
        LogisticsHook.renderCustomTrackingUI(order, container);
        modal.classList.add("active");
    }
};

window.closeTrackingModal = function() {
    const modal = document.getElementById("trackingModal");
    if (modal) {
        modal.classList.remove("active");
        if (window.LogisticsHook && typeof window.LogisticsHook.cleanupModalMap === "function") {
            window.LogisticsHook.cleanupModalMap();
        }
    }
};

// --- Auth Modals & Quick Access ---
window.quickDemoLogin = async function(role) {
    if (api.currentUser) {
        showToast(`You are currently logged into the ${api.currentUser.role.toUpperCase()} panel. To login to another panel, first logout from the already logged in panel.`, "warning");
        return;
    }

    const demoUsers = {
        farmer: { mobile: "9840123456", password: "farmer123" },
        buyer: { mobile: "9884123456", password: "buyer123" },
        logistics: { mobile: "9811122233", password: "logistics123" },
        admin: { mobile: "9999999999", password: "admin123" }
    };

    const creds = demoUsers[role];
    if (!creds) return;

    try {
        const res = await api.login(creds.mobile, creds.password, role);
        showToast(res.message || `Welcome to ${role.toUpperCase()} panel`, "success");
        setRolePortal(role);
        if (role === 'farmer' && res.user && res.user.state) {
            i18n.autoDetectFromLocation(res.user.state, res.user.district);
        }
    } catch (err) {
        showToast(err.message || "Sign in failed", "error");
    }
};

window.showLoginModal = function(role) {
    if (api.currentUser) {
        showToast(`You are already logged into the ${api.currentUser.role.toUpperCase()} panel. To login to another panel, first logout from the already logged in panel.`, "warning");
        return;
    }
    const select = document.getElementById("login_role_select");
    if (select && role) {
        select.value = role;
    }
    const modal = document.getElementById("loginModal");
    if (modal) modal.classList.add("active");
};

window.closeLoginModal = function() {
    const modal = document.getElementById("loginModal");
    if (modal) modal.classList.remove("active");
};

window.showRegisterModal = function(role = "farmer") {
    if (api.currentUser) {
        showToast(`You are already logged into the ${api.currentUser.role.toUpperCase()} panel. To register or login to another panel, first logout from the already logged in panel.`, "warning");
        return;
    }
    const select = document.getElementById("reg_role");
    if (select && role) {
        select.value = role;
    }
    toggleRegisterFields(role);

    const modal = document.getElementById("registerModal");
    if (modal) {
        modal.classList.add("active");
        // Initialize interactive Leaflet map after modal becomes visible
        setTimeout(() => {
            if (!mapPickerInstance) {
                mapPickerInstance = new KisanMapPicker("registerMapContainer");
            }
            mapPickerInstance.init();
        }, 200);
    }
};

window.closeRegisterModal = function() {
    const modal = document.getElementById("registerModal");
    if (modal) modal.classList.remove("active");
};

function toggleRegisterFields(role) {
    const isBuyer = role === "buyer";
    const isFarmer = role === "farmer";

    const otpSection = document.getElementById("buyerOtpSection");
    const mapSection = document.getElementById("farmerMapSection");
    const villageGroup = document.getElementById("villageFieldGroup");

    if (otpSection) otpSection.style.display = isBuyer ? "block" : "none";
    if (mapSection) mapSection.style.display = isFarmer ? "block" : "none";
    if (villageGroup) villageGroup.style.display = isFarmer ? "block" : "none";
}

function handleLogout() {
    api.setUser(null);
    showToast("Logged out successfully. Please select a portal to sign in.", "info");
    showPortalSelectView();
}

// --- Event Listeners ---
function initEventListeners() {
    // Farmer Tabs
    document.querySelectorAll(".farmer-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            showFarmerTab(btn.getAttribute("data-tab"));
        });
    });

    // Buyer Tabs
    document.querySelectorAll(".buyer-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            showBuyerTab(btn.getAttribute("data-tab"));
        });
    });

    // Login Form Submit
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const mobile = document.getElementById("login_mobile").value.trim();
            const password = document.getElementById("login_password").value;
            const role = document.getElementById("login_role_select").value;

            try {
                const res = await api.login(mobile, password, role);
                showToast(res.message, "success");
                closeLoginModal();
                setRolePortal(role);
                if (role === 'farmer' && res.user && res.user.state) {
                    i18n.autoDetectFromLocation(res.user.state, res.user.district);
                }
            } catch (err) {
                showToast(err.message, "error");
            }
        });
    }

    // Register Role Selector Change
    const regRoleSelect = document.getElementById("reg_role");
    if (regRoleSelect) {
        regRoleSelect.addEventListener("change", (e) => {
            toggleRegisterFields(e.target.value);
        });
    }

    // Fetch GPS Button
    const btnGps = document.getElementById("btnFetchGps");
    if (btnGps) {
        btnGps.addEventListener("click", () => {
            if (mapPickerInstance) {
                mapPickerInstance.fetchGPS();
            }
        });
    }

    // OTP Send / Verify for Buyer
    const btnSendOtp = document.getElementById("btnSendOtp");
    if (btnSendOtp) {
        btnSendOtp.addEventListener("click", async () => {
            const mobile = document.getElementById("reg_mobile").value.trim();
            if (!mobile || mobile.length < 10) {
                showToast("Please enter a valid 10-digit mobile number.", "error");
                return;
            }
            try {
                const res = await api.sendOtp(mobile);
                showToast(res.message, "success");
                if (res.test_otp) {
                    document.getElementById("reg_otp").value = res.test_otp;
                    showToast(`Demo OTP Auto-Filled: ${res.test_otp}`, "info");
                }
            } catch (err) {
                showToast(err.message, "error");
            }
        });
    }

    // Register Form Submit
    const regForm = document.getElementById("registerForm");
    if (regForm) {
        regForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const role = document.getElementById("reg_role").value;
            const name = document.getElementById("reg_name").value.trim();
            const mobile = document.getElementById("reg_mobile").value.trim();
            const state = document.getElementById("reg_state").value.trim();
            const district = document.getElementById("reg_district").value.trim();
            const village = document.getElementById("reg_village") ? document.getElementById("reg_village").value.trim() : "";
            const pincode = document.getElementById("reg_pincode").value.trim();
            const password = document.getElementById("reg_password").value;
            const confirm_password = document.getElementById("reg_confirm_password").value;
            const lat = document.getElementById("reg_lat") ? parseFloat(document.getElementById("reg_lat").value) : null;
            const lng = document.getElementById("reg_lng") ? parseFloat(document.getElementById("reg_lng").value) : null;

            if (role === "buyer") {
                const enteredOtp = document.getElementById("reg_otp").value.trim();
                if (!enteredOtp) {
                    showToast("Please verify OTP for buyer registration.", "error");
                    return;
                }
            }

            try {
                const res = await api.register({
                    role, name, mobile, state, district, village, pincode,
                    password, confirm_password,
                    latitude: lat, longitude: lng
                });
                showToast(res.message, "success");
                closeRegisterModal();
                setRolePortal(role);
                // Auto-detect regional language only for farmers
                if (role === 'farmer' && state) {
                    i18n.autoDetectFromLocation(state, district);
                }
            } catch (err) {
                showToast(err.message, "error");
            }
        });
    }

    // Farmer Add Product Form
    const addProdForm = document.getElementById("addProductForm");
    if (addProdForm) {
        addProdForm.addEventListener("submit", (e) => FarmerController.handleAddProduct(e));
    }

    // Farmer Support Form
    const farmerSupForm = document.getElementById("farmerSupportForm");
    if (farmerSupForm) {
        farmerSupForm.addEventListener("submit", (e) => FarmerController.handleRaiseTicket(e));
    }

    // Farmer Profile Form
    const farmerProfForm = document.getElementById("farmerProfileForm");
    if (farmerProfForm) {
        farmerProfForm.addEventListener("submit", (e) => FarmerController.handleUpdateProfile(e));
    }

    // Buyer Search & Quantity Filters
    const buyerSearch = document.getElementById("buyerSearchInput");
    const buyerQty = document.getElementById("buyerQtyInput");
    const buyerCat = document.getElementById("buyerCategoryFilter");

    if (buyerSearch) {
        buyerSearch.addEventListener("input", debounce(() => BuyerController.loadMarketplace(), 350));
    }
    if (buyerQty) {
        buyerQty.addEventListener("input", debounce(() => BuyerController.loadMarketplace(), 350));
    }
    if (buyerCat) {
        buyerCat.addEventListener("change", () => BuyerController.loadMarketplace());
    }

    // Buyer Place Order Modal Form
    const directOrderForm = document.getElementById("directOrderForm");
    if (directOrderForm) {
        directOrderForm.addEventListener("submit", (e) => BuyerController.submitDirectOrder(e));
    }
    const modalOrderQty = document.getElementById("modal_order_qty");
    if (modalOrderQty) {
        modalOrderQty.addEventListener("input", () => BuyerController.updateModalOrderCalculations());
    }

    // Buyer Return Form
    const returnForm = document.getElementById("returnOrderForm");
    if (returnForm) {
        returnForm.addEventListener("submit", (e) => BuyerController.submitReturnRequest(e));
    }

    // Buyer Support Form
    const buyerSupForm = document.getElementById("buyerSupportForm");
    if (buyerSupForm) {
        buyerSupForm.addEventListener("submit", (e) => BuyerController.handleRaiseTicket(e));
    }

    // Buyer Profile Form
    const buyerProfForm = document.getElementById("buyerProfileForm");
    if (buyerProfForm) {
        buyerProfForm.addEventListener("submit", (e) => BuyerController.handleUpdateProfile(e));
    }

    // Ministry Resolution Form
    const adminResForm = document.getElementById("adminResolutionForm");
    if (adminResForm) {
        adminResForm.addEventListener("submit", (e) => AdminController.submitResolution(e));
    }
}

// Toast System
window.showToast = function(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast-message toast-${type}`;
    const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <span class="toast-text">${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 400);
    }, 4000);
};

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Listen for language changes and refresh all static and dynamic text
window.addEventListener("languageChanged", () => {
    updateUserDisplay();
    window.i18n.applyTranslations();
    if (currentRole === "logistics") {
        initLogisticsView();
    }
});
