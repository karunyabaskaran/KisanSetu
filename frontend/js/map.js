/**
 * KisanSetu - Interactive Map & GPS Geolocation Module
 * Built with Leaflet & OpenStreetMap.
 * Allows Farmers & Buyers to pinpoint farm coordinates or auto-fetch via GPS.
 * Auto-populates State, District, Village, Pincode, and auto-switches regional language!
 */

class KisanMapPicker {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.options = options;
        this.map = null;
        this.marker = null;
        this.currentCoords = { lat: 20.5937, lng: 78.9629 }; // India default center
    }

    init() {
        if (typeof L === "undefined") {
            console.error("Leaflet library not loaded.");
            return;
        }

        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Clean existing map instance if any
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.map = L.map(this.containerId).setView([this.currentCoords.lat, this.currentCoords.lng], 5);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(this.map);

        this.marker = L.marker([this.currentCoords.lat, this.currentCoords.lng], {
            draggable: true
        }).addTo(this.map);

        this.marker.on("dragend", (e) => {
            const pos = e.target.getLatLng();
            this.updatePosition(pos.lat, pos.lng);
        });

        this.map.on("click", (e) => {
            this.updatePosition(e.latlng.lat, e.latlng.lng);
        });

        // Invalidate size once rendered inside modal or container
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 300);
    }

    updatePosition(lat, lng) {
        this.currentCoords = { lat, lng };
        if (this.marker) {
            this.marker.setLatLng([lat, lng]);
        }
        this.reverseGeocode(lat, lng);
    }

    async reverseGeocode(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
            const res = await fetch(url, { headers: { "Accept-Language": "en" } });
            if (!res.ok) throw new Error("Reverse geocode failed");
            const data = await res.json();
            const addr = data.address || {};

            const state = addr.state || "";
            const district = addr.state_district || addr.county || addr.city || addr.town || "";
            const village = addr.village || addr.suburb || addr.neighbourhood || addr.town || "";
            const pincode = addr.postcode || "";

            this.fillFormFields({
                lat, lng, state, district, village, pincode,
                display_name: data.display_name
            });
        } catch (err) {
            console.warn("Reverse geocode API rate limited or offline. Falling back to coordinates:", err);
            this.fillFormFields({ lat, lng });
        }
    }

    fillFormFields(data) {
        const stateEl = document.getElementById("reg_state");
        const distEl = document.getElementById("reg_district");
        const villEl = document.getElementById("reg_village");
        const pinEl = document.getElementById("reg_pincode");
        const latEl = document.getElementById("reg_lat");
        const lngEl = document.getElementById("reg_lng");
        const hintEl = document.getElementById("map_selected_hint");

        if (data.state && stateEl) stateEl.value = data.state;
        if (data.district && distEl) distEl.value = data.district;
        if (data.village && villEl) villEl.value = data.village;
        if (data.pincode && pinEl) pinEl.value = data.pincode;
        if (latEl) latEl.value = data.lat ? data.lat.toFixed(5) : "";
        if (lngEl) lngEl.value = data.lng ? data.lng.toFixed(5) : "";

        if (hintEl) {
            hintEl.innerHTML = `📍 <strong>Selected:</strong> ${data.district || 'Location'} (${data.lat.toFixed(4)}, ${data.lng.toFixed(4)})`;
        }

        // CRITICAL REQUIREMENT:
        // Automatic language change should be applied ONLY for farmers, need not change for other users.
        const regRoleSelect = document.getElementById("reg_role");
        const currentRole = regRoleSelect ? regRoleSelect.value : (window.api && window.api.currentUser ? window.api.currentUser.role : null);
        
        if (currentRole === 'farmer' && (data.state || data.district)) {
            if (window.i18n) {
                const detected = window.i18n.autoDetectFromLocation(data.state, data.district);
                if (window.showToast) {
                    window.showToast(`Farmer location detected (${data.state || data.district}). Language set to ${detected.toUpperCase()}.`, "info");
                }
            }
        }
    }

    fetchGPS() {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser.");
            return;
        }

        const btn = document.getElementById("btnFetchGps");
        if (btn) {
            btn.innerHTML = "⏳ Locating via Satellite...";
            btn.disabled = true;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (this.map) {
                    this.map.setView([lat, lng], 13);
                }
                this.updatePosition(lat, lng);
                if (btn) {
                    btn.innerHTML = "✅ GPS Location Locked!";
                    setTimeout(() => {
                        btn.innerHTML = "📍 Fetch GPS Location";
                        btn.disabled = false;
                    }, 2500);
                }
            },
            (err) => {
                console.warn("GPS error:", err);
                // Demo fallback for Chennai / Tamil Nadu to test auto-language
                const mockChennai = { lat: 13.0827, lng: 80.2707 };
                if (this.map) {
                    this.map.setView([mockChennai.lat, mockChennai.lng], 12);
                }
                this.updatePosition(mockChennai.lat, mockChennai.lng);

                if (btn) {
                    btn.innerHTML = "📍 GPS Auto-Simulated (Chennai Demo)";
                    setTimeout(() => {
                        btn.innerHTML = "📍 Fetch GPS Location";
                        btn.disabled = false;
                    }, 2500);
                }
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }
}

window.KisanMapPicker = KisanMapPicker;
