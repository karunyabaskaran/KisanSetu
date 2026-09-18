/**
 * KisanSetu - Consumer AI Chatbot Engine (KisanMitra AI)
 * Integrates:
 * 1. Google Gemini AI grounded conversation for consumers
 * 2. Real-time marketplace produce recommendations & instant Add-to-Cart
 * 3. Live order tracking, inspection status, and tax invoice inspection
 * 4. Interactive in-message rich order & produce action cards
 * 5. Speech-to-Text Voice Recognition
 * 6. Multi-lingual support (English, Tamil, Hindi)
 */

const ConsumerChatbot = {
    conversationHistory: [],
    isTyping: false,
    recognition: null,
    isListening: false,

    init() {
        const sendBtn = document.getElementById("btnChatSend");
        const input = document.getElementById("buyerChatInput");
        const clearBtn = document.getElementById("btnChatClear");
        const micBtn = document.getElementById("btnChatMic");

        if (sendBtn) {
            sendBtn.onclick = () => this.handleSend();
        }

        if (input) {
            input.onkeydown = (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            };
        }

        if (clearBtn) {
            clearBtn.onclick = () => this.clearChat();
        }

        if (micBtn) {
            micBtn.onclick = () => this.toggleVoice();
        }

        // Initialize Web Speech Recognition if supported
        this.initSpeech();

        // Render initial greeting if empty
        const msgBox = document.getElementById("buyerChatMessages");
        if (msgBox && msgBox.children.length === 0) {
            this.renderInitialGreeting();
        }
    },

    onTabActivated() {
        const input = document.getElementById("buyerChatInput");
        if (input) {
            setTimeout(() => input.focus(), 150);
        }
        const msgBox = document.getElementById("buyerChatMessages");
        if (msgBox) {
            msgBox.scrollTop = msgBox.scrollHeight;
        }
    },

    openFromFloating() {
        if (window.switchPortal) {
            window.switchPortal("buyer");
        }
        if (window.showBuyerTab) {
            window.showBuyerTab("chatbot");
        }
        this.onTabActivated();
    },

    initSpeech() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            const micBtn = document.getElementById("btnChatMic");
            if (micBtn) micBtn.title = "Voice recognition not supported in this browser";
            return;
        }

        try {
            this.recognition = new SpeechRec();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;

            const lang = localStorage.getItem("kisansetu_lang") || "en";
            this.recognition.lang = lang === "ta" ? "ta-IN" : lang === "hi" ? "hi-IN" : "en-IN";

            this.recognition.onstart = () => {
                this.isListening = true;
                const micBtn = document.getElementById("btnChatMic");
                if (micBtn) {
                    micBtn.classList.add("listening-pulse");
                    micBtn.style.color = "#dc2626";
                }
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                const input = document.getElementById("buyerChatInput");
                if (input) {
                    input.value = transcript;
                    this.handleSend();
                }
            };

            this.recognition.onerror = (_e) => {
                this.stopListeningUI();
            };

            this.recognition.onend = () => {
                this.stopListeningUI();
            };
        } catch (e) {
            console.warn("Speech recognition setup note:", e);
        }
    },

    toggleVoice() {
        if (!this.recognition) {
            if (window.showToast) window.showToast("Voice input is not supported on this browser.", "info");
            return;
        }
        if (this.isListening) {
            this.recognition.stop();
            this.stopListeningUI();
        } else {
            const lang = localStorage.getItem("kisansetu_lang") || "en";
            this.recognition.lang = lang === "ta" ? "ta-IN" : lang === "hi" ? "hi-IN" : "en-IN";
            try {
                this.recognition.start();
            } catch (_err) {
                this.stopListeningUI();
            }
        }
    },

    stopListeningUI() {
        this.isListening = false;
        const micBtn = document.getElementById("btnChatMic");
        if (micBtn) {
            micBtn.classList.remove("listening-pulse");
            micBtn.style.color = "";
        }
    },

    renderInitialGreeting() {
        const user = (window.api && api.currentUser) ? api.currentUser : null;
        const userName = user ? user.name : "there";
        const lang = localStorage.getItem("kisansetu_lang") || "en";

        let welcomeText = "";
        if (lang === "ta") {
            welcomeText = `வணக்கம் **${userName}**! 👋 நான் **KisanMitra AI**, உங்கள் தனிப்பட்ட KisanSetu உதவியாளர்.\n\n` +
                `நான் உங்களுக்கு சந்தையில் கிடைக்கும் புதிய விளைபொருட்களின் விவரங்கள், மொத்த விலை தள்ளுபடிகள் மற்றும் உங்கள் ஆர்டர்களின் நேரலை நிலவரங்களை உடனுக்குடன் தெரிவிப்பேன்.\n\n` +
                `கீழே உள்ள கேள்விகளில் ஒன்றைத் தேர்ந்தெடுக்கலாம் அல்லது நீங்கள் கேட்க விரும்பும் கேள்வியை நேரடியாகத் தட்டச்சு செய்யலாம்!`;
        } else if (lang === "hi") {
            welcomeText = `नमस्ते **${userName}**! 👋 मैं **KisanMitra AI**, आपका व्यक्तिगत किसानसेतु सहायक हूँ।\n\n` +
                `मैं आपको बाज़ार में उपलब्ध ताज़ी फसलों, थोक स्लैब छूट और आपके ऑर्डर की लाइव स्थिति की जानकारी दे सकता हूँ।\n\n` +
                `नीचे दिए गए सुझावों में से किसी एक पर क्लिक करें या अपना प्रश्न सीधे टाइप करें!`;
        } else {
            welcomeText = `Hello **${userName}**! 👋 I am **KisanMitra AI**, your personal shopping & order assistant on KisanSetu.\n\n` +
                `You can ask me about **fresh marketplace crops & prices**, explore **bulk slab discounts**, or get real-time tracking for **your farm orders**.\n\n` +
                `Try asking one of the quick suggestions below or type your question!`;
        }

        this.appendMessage({
            role: "assistant",
            content: welcomeText,
            suggested_actions: [
                { type: "quick_ask", label: "📦 Where is my latest order?", query: "Where is my latest order?" },
                { type: "quick_ask", label: "🍅 What vegetables are available today?", query: "What fresh vegetables are available today?" },
                { type: "quick_ask", label: "💰 Bulk slab discounts", query: "What are the bulk quantity slab discounts on rice and grains?" },
                { type: "navigate_tab", label: "🛒 Browse Marketplace", tab: "marketplace" }
            ],
            source: "KisanMitra AI"
        });
    },

    quickAsk(query) {
        const input = document.getElementById("buyerChatInput");
        if (input) input.value = query;
        this.handleSend();
    },

    handleSend() {
        const input = document.getElementById("buyerChatInput");
        if (!input) return;
        const text = input.value.trim();
        if (!text || this.isTyping) return;

        input.value = "";
        this.sendUserMessage(text);
    },

    async sendUserMessage(text) {
        // 1. Render user bubble
        this.appendMessage({ role: "user", content: text });

        // Save to in-memory conversation history
        this.conversationHistory.push({ role: "user", content: text });

        // 2. Show Typing Indicator
        this.showTypingIndicator();

        try {
            // 3. Call backend endpoint
            const res = await api.sendConsumerChatMessage(text, this.conversationHistory);

            this.hideTypingIndicator();

            if (res && res.reply) {
                this.conversationHistory.push({ role: "assistant", content: res.reply });
                this.appendMessage({
                    role: "assistant",
                    content: res.reply,
                    intent: res.intent,
                    source: res.source || "Google Gemini AI",
                    suggested_actions: res.suggested_actions || [],
                    referenced_orders: res.referenced_orders || [],
                    referenced_products: res.referenced_products || []
                });
            } else {
                throw new Error("No response received from assistant.");
            }
        } catch (err) {
            console.error("Chat error:", err);
            this.hideTypingIndicator();
            this.appendMessage({
                role: "assistant",
                content: "I'm having a brief connection delay reaching the live assistant. However, you can freely browse our **Marketplace** or view your current orders using the buttons below.",
                suggested_actions: [
                    { type: "navigate_tab", label: "🛒 Browse Marketplace", tab: "marketplace" },
                    { type: "navigate_tab", label: "📦 View My Orders", tab: "orders" }
                ],
                source: "System Offline Fallback"
            });
        }
    },

    showTypingIndicator() {
        this.isTyping = true;
        const msgBox = document.getElementById("buyerChatMessages");
        if (!msgBox) return;

        const typingEl = document.createElement("div");
        typingEl.id = "chatTypingIndicator";
        typingEl.className = "chat-msg-row chat-msg-bot";
        typingEl.innerHTML = `
            <div class="chat-avatar-bot">🤖</div>
            <div class="chat-bubble chat-bubble-bot typing-indicator-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-text">Thinking with KisanSetu AI...</span>
            </div>
        `;
        msgBox.appendChild(typingEl);
        msgBox.scrollTop = msgBox.scrollHeight;
    },

    hideTypingIndicator() {
        this.isTyping = false;
        const el = document.getElementById("chatTypingIndicator");
        if (el) el.remove();
    },

    appendMessage(msg) {
        const msgBox = document.getElementById("buyerChatMessages");
        if (!msgBox) return;

        const isUser = msg.role === "user";
        const row = document.createElement("div");
        row.className = `chat-msg-row ${isUser ? 'chat-msg-user' : 'chat-msg-bot'}`;

        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (isUser) {
            row.innerHTML = `
                <div class="chat-bubble chat-bubble-user">
                    <div class="chat-bubble-text">${this.escapeHtml(msg.content)}</div>
                    <div class="chat-bubble-meta">${timeStr}</div>
                </div>
                <div class="chat-avatar-user">👤</div>
            `;
        } else {
            const formattedContent = this.formatMarkdown(msg.content);
            const sourceBadge = msg.source ? `<span class="chat-source-tag">${this.escapeHtml(msg.source)}</span>` : "";

            let actionsHtml = "";
            if (msg.suggested_actions && msg.suggested_actions.length > 0) {
                actionsHtml = `
                    <div class="chat-actions-container">
                        ${msg.suggested_actions.map(a => {
                            if (a.type === "view_order") {
                                return `
                                    <button type="button" class="chat-action-btn chat-action-order" onclick="ConsumerChatbot.handleActionViewOrder('${this.escapeHtml(a.order_number || '')}')">
                                        📄 ${this.escapeHtml(a.label || 'View Order')}
                                    </button>
                                `;
                            } else if (a.type === "add_to_cart") {
                                return `
                                    <button type="button" class="chat-action-btn chat-action-cart" onclick="ConsumerChatbot.handleActionAddToCart(${a.product_id || 0}, '${this.escapeHtml(a.product_name || '')}')">
                                        🛒 ${this.escapeHtml(a.label || 'Add to Cart')}
                                    </button>
                                `;
                            } else if (a.type === "quick_ask") {
                                return `
                                    <button type="button" class="chat-action-btn chat-action-chip" onclick="ConsumerChatbot.quickAsk('${this.escapeHtml(a.query || a.label)}')">
                                        💬 ${this.escapeHtml(a.label)}
                                    </button>
                                `;
                            } else if (a.type === "navigate_tab") {
                                return `
                                    <button type="button" class="chat-action-btn chat-action-nav" onclick="window.showBuyerTab('${this.escapeHtml(a.tab || 'marketplace')}')">
                                        🔗 ${this.escapeHtml(a.label)}
                                    </button>
                                `;
                            }
                            return `
                                <button type="button" class="chat-action-btn" onclick="ConsumerChatbot.quickAsk('${this.escapeHtml(a.label)}')">
                                    ${this.escapeHtml(a.label)}
                                </button>
                            `;
                        }).join('')}
                    </div>
                `;
            }

            row.innerHTML = `
                <div class="chat-avatar-bot">🤖</div>
                <div class="chat-bubble chat-bubble-bot">
                    <div class="chat-bot-header">
                        <span class="chat-bot-name">KisanMitra AI</span>
                        ${sourceBadge}
                    </div>
                    <div class="chat-bubble-text">${formattedContent}</div>
                    ${actionsHtml}
                    <div class="chat-bubble-meta">${timeStr}</div>
                </div>
            `;
        }

        msgBox.appendChild(row);
        msgBox.scrollTop = msgBox.scrollHeight;
    },

    async handleActionViewOrder(orderNumber) {
        if (!orderNumber) {
            window.showBuyerTab("orders");
            return;
        }

        // Switch to orders tab
        window.showBuyerTab("orders");

        // Attempt to fetch and highlight specific invoice
        try {
            const user = api.currentUser;
            const queryParams = {};
            if (user && user.id) queryParams.buyer_id = user.id;
            const res = await api.getOrders(queryParams);
            const orders = res.orders || [];
            const target = orders.find(o => o.order_number === orderNumber || o.order_number === `ORD-${orderNumber}`);

            if (target && window.BuyerController && typeof window.BuyerController.openInvoiceModal === "function") {
                BuyerController.openInvoiceModal(target);
            } else {
                if (window.showToast) window.showToast(`Showing your orders for #${orderNumber}`, "info");
            }
        } catch (_e) {
            window.showBuyerTab("orders");
        }
    },

    async handleActionAddToCart(productId, productName) {
        try {
            // Find product in marketplace catalog
            const res = await api.getProducts();
            const products = res.products || [];
            let targetProduct = null;
            if (productId) {
                targetProduct = products.find(p => p.id === productId);
            }
            if (!targetProduct && productName) {
                targetProduct = products.find(p => p.name.toLowerCase().includes(productName.toLowerCase()));
            }

            if (targetProduct && window.BuyerCart) {
                BuyerCart.addItem(targetProduct, 2.0);
                if (window.showToast) {
                    window.showToast(`Added ${targetProduct.name} (2.0 kg) to your cart!`, "success");
                }
            } else {
                window.showBuyerTab("marketplace");
                if (window.showToast) {
                    window.showToast(`Browsing marketplace for ${productName || 'produce'}...`, "info");
                }
            }
        } catch (err) {
            console.error("Add to cart error:", err);
            window.showBuyerTab("marketplace");
        }
    },

    clearChat() {
        this.conversationHistory = [];
        const msgBox = document.getElementById("buyerChatMessages");
        if (msgBox) {
            msgBox.innerHTML = "";
            this.renderInitialGreeting();
        }
        if (window.showToast) window.showToast("Conversation cleared.", "info");
    },

    formatMarkdown(text) {
        if (!text) return "";
        let out = this.escapeHtml(text);

        // Bold: **text**
        out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Italic: *text*
        out = out.replace(/\*(.*?)\*/g, '<em>$1</em>');

        // Headers: ### text
        out = out.replace(/^### (.*$)/gim, '<h4 class="chat-h4">$1</h4>');
        out = out.replace(/^## (.*$)/gim, '<h3 class="chat-h3">$1</h3>');

        // Bullet lists: * or -
        out = out.replace(/^\s*[\*\-]\s+(.*$)/gim, '<li class="chat-li">$1</li>');
        out = out.replace(/(<li class="chat-li">.*<\/li>)/gims, '<ul class="chat-ul">$1</ul>');

        // Line breaks (convert newlines to <br> unless inside lists)
        out = out.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');

        return out;
    },

    escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

// Expose globally
window.ConsumerChatbot = ConsumerChatbot;

document.addEventListener("DOMContentLoaded", () => {
    ConsumerChatbot.init();
});
