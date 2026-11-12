(() => {
    "use strict";

    // Separate storage key so this frontend's local history does not mix
    // with the other project's chat history in the same browser.
    const STORAGE_KEY = "dzongkha_companion_friend_chats_v1";
    const MAX_CHATS = 30;

    const input = document.getElementById("user-input");
    const sendButton = document.getElementById("send-btn");
    const form = document.getElementById("chat-form");
    const chatBox = document.getElementById("chat-box");
    const welcome = document.getElementById("welcome-screen");
    const historyList = document.getElementById("chat-history");
    const newChatButton = document.getElementById("new-chat-btn");
    const clearHistoryButton = document.getElementById("clear-history-btn");
    const sidebar = document.getElementById("sidebar");
    const menuToggle = document.getElementById("menu-toggle");
    const closeSidebarButton = document.getElementById("close-sidebar");
    const mobileScrim = document.getElementById("mobile-scrim");

    let chats = loadChats();
    let activeChatId = null;
    let isSending = false;

    function loadChats() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(value) ? value : [];
        } catch (error) {
            console.warn("Could not load local chat history:", error);
            return [];
        }
    }

    function persistChats() {
        chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        chats = chats.slice(0, MAX_CHATS);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
        } catch (error) {
            console.warn("Could not save local chat history:", error);
        }
        renderHistory();
    }

    function makeId() {
        return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function activeChat() {
        return chats.find((chat) => chat.id === activeChatId) || null;
    }

    function createChat(firstMessage) {
        const chat = {
            id: makeId(),
            title: firstMessage.length > 38 ? `${firstMessage.slice(0, 38).trim()}…` : firstMessage,
            messages: [],
            updatedAt: Date.now()
        };
        chats.unshift(chat);
        activeChatId = chat.id;
        return chat;
    }

    function renderHistory() {
        historyList.replaceChildren();
        const sorted = [...chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (!sorted.length) {
            const empty = document.createElement("p");
            empty.className = "empty-history";
            empty.textContent = "Your conversations will appear here.";
            historyList.appendChild(empty);
            return;
        }

        sorted.forEach((chat) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "history-item";
            if (chat.id === activeChatId) button.classList.add("active");

            const symbol = document.createElement("span");
            symbol.className = "history-symbol";
            symbol.textContent = "◷";
            const title = document.createElement("span");
            title.className = "history-title";
            title.textContent = chat.title || "New conversation";
            button.append(symbol, title);
            button.addEventListener("click", () => openChat(chat.id));
            historyList.appendChild(button);
        });
    }

    function makeMessage(role, text, options = {}) {
        const row = document.createElement("article");
        row.className = `message-row ${role}`;
        if (options.error) row.classList.add("error");

        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = role === "user" ? "YOU" : "ཀ";
        avatar.setAttribute("aria-hidden", "true");

        const wrap = document.createElement("div");
        wrap.className = "message-content-wrap";
        const author = document.createElement("div");
        author.className = "message-author";
        author.textContent = role === "user" ? "YOU" : "DZONGKHA COMPANION";
        const body = document.createElement("div");
        body.className = "message-text";
        body.textContent = text;
        wrap.append(author, body);
        row.append(avatar, wrap);
        return row;
    }

    function showTyping() {
        const row = document.createElement("article");
        row.className = "message-row assistant";
        row.id = "typing-indicator";
        const avatar = document.createElement("div");
        avatar.className = "message-avatar";
        avatar.textContent = "ཀ";
        const wrap = document.createElement("div");
        wrap.className = "message-content-wrap";
        const author = document.createElement("div");
        author.className = "message-author";
        author.textContent = "DZONGKHA COMPANION";
        const dots = document.createElement("div");
        dots.className = "typing-dots";
        dots.setAttribute("aria-label", "Generating answer");
        dots.innerHTML = "<span></span><span></span><span></span>";
        wrap.append(author, dots);
        row.append(avatar, wrap);
        chatBox.appendChild(row);
        scrollToBottom();
        return row;
    }

    function displayChat(chat) {
        chatBox.replaceChildren();
        const hasMessages = Boolean(chat && chat.messages && chat.messages.length);
        welcome.hidden = hasMessages;
        chatBox.classList.toggle("active", hasMessages);
        if (hasMessages) {
            chat.messages.forEach((message) => {
                chatBox.appendChild(makeMessage(message.role, message.content, { error: message.error }));
            });
        }
        scrollToBottom();
    }

    function openChat(id) {
        const chat = chats.find((item) => item.id === id);
        if (!chat) return;
        activeChatId = id;
        displayChat(chat);
        renderHistory();
        closeSidebar();
    }

    function startNewChat() {
        if (isSending) return;
        activeChatId = null;
        displayChat(null);
        renderHistory();
        input.value = "";
        updateComposer();
        input.focus();
        closeSidebar();
    }

    function scrollToBottom() {
        requestAnimationFrame(() => {
            const workspace = document.getElementById("conversation-area");
            workspace.scrollTop = workspace.scrollHeight;
        });
    }

    function updateComposer() {
        sendButton.disabled = isSending || !input.value.trim();
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
    }

    async function sendMessage(textOverride = null) {
        if (isSending) return;
        const message = (textOverride !== null ? textOverride : input.value).trim();
        if (!message) return;

        let chat = activeChat();
        if (!chat) chat = createChat(message);
        chat.messages.push({ role: "user", content: message });
        chat.updatedAt = Date.now();
        if (chat.messages.length === 1) {
            chat.title = message.length > 38 ? `${message.slice(0, 38).trim()}…` : message;
        }

        welcome.hidden = true;
        chatBox.classList.add("active");
        chatBox.appendChild(makeMessage("user", message));
        input.value = "";
        isSending = true;
        updateComposer();
        persistChats();
        const typing = showTyping();

        try {
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message })
            });

            let data;
            try {
                data = await response.json();
            } catch (error) {
                throw new Error("The server returned an unreadable response.");
            }

            if (!response.ok) {
                throw new Error(data.error || `Request failed (${response.status}).`);
            }

            const answer = data.answer || data.response || data.reply;
            if (typeof answer !== "string" || !answer.trim()) {
                throw new Error(data.error || "The assistant returned an empty answer.");
            }

            typing.replaceWith(makeMessage("assistant", answer));
            chat.messages.push({ role: "assistant", content: answer });
        } catch (error) {
            const errorText = error.message || "Unable to connect to the assistant.";
            typing.replaceWith(makeMessage("assistant", errorText, { error: true }));
            chat.messages.push({ role: "assistant", content: errorText, error: true });
        } finally {
            chat.updatedAt = Date.now();
            isSending = false;
            updateComposer();
            persistChats();
            input.focus();
            scrollToBottom();
        }
    }

    function openSidebar() {
        sidebar.classList.add("open");
        mobileScrim.classList.add("visible");
    }

    function closeSidebar() {
        sidebar.classList.remove("open");
        mobileScrim.classList.remove("visible");
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage();
    });

    input.addEventListener("input", updateComposer);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!sendButton.disabled) sendMessage();
        }
    });

    document.querySelectorAll("[data-prompt]").forEach((button) => {
        button.addEventListener("click", () => sendMessage(button.dataset.prompt || ""));
    });

    newChatButton.addEventListener("click", startNewChat);
    clearHistoryButton.addEventListener("click", () => {
        if (!chats.length || !window.confirm("Clear all saved conversations in this browser?")) return;
        chats = [];
        activeChatId = null;
        try { localStorage.removeItem(STORAGE_KEY); } catch (error) { console.warn(error); }
        displayChat(null);
        renderHistory();
    });

    menuToggle.addEventListener("click", openSidebar);
    closeSidebarButton.addEventListener("click", closeSidebar);
    mobileScrim.addEventListener("click", closeSidebar);

    renderHistory();
    displayChat(null);
    updateComposer();
})();
