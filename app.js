(() => {
  "use strict";

  const cfg = window.PINKSASHA_CONFIG;
  const TOKEN_KEY = "pinksasha_session_token";
  const $ = (id) => document.getElementById(id);

  const state = {
    mode: "login",
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    users: [],
    conversations: [],
    activeConversation: null,
    messages: [],
    selectedMessage: null,
    pollTimer: null
  };

  const els = {
    toast: $("toast"),
    authScreen: $("authScreen"),
    appScreen: $("appScreen"),
    loginTab: $("loginTab"),
    registerTab: $("registerTab"),
    authForm: $("authForm"),
    authUsername: $("authUsername"),
    authPassword: $("authPassword"),
    authSubmit: $("authSubmit"),
    authStatus: $("authStatus"),
    currentUsername: $("currentUsername"),
    logoutBtn: $("logoutBtn"),
    newChatBtn: $("newChatBtn"),
    refreshBtn: $("refreshBtn"),
    conversationList: $("conversationList"),
    emptyChat: $("emptyChat"),
    activeChat: $("activeChat"),
    backBtn: $("backBtn"),
    chatAvatar: $("chatAvatar"),
    chatTitle: $("chatTitle"),
    chatSubtitle: $("chatSubtitle"),
    messageList: $("messageList"),
    messageForm: $("messageForm"),
    messageInput: $("messageInput"),
    newChatDialog: $("newChatDialog"),
    userSearch: $("userSearch"),
    userList: $("userList"),
    messageMenuDialog: $("messageMenuDialog"),
    editMessageBtn: $("editMessageBtn"),
    deleteMessageBtn: $("deleteMessageBtn"),
    closeMessageMenuBtn: $("closeMessageMenuBtn")
  };

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function setAuthStatus(message, isError = false) {
    els.authStatus.textContent = message || "";
    els.authStatus.style.color = isError ? "#b42318" : "#a52969";
  }

  async function api(action, payload = {}) {
    const response = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.publishableKey,
        "Authorization": `Bearer ${cfg.publishableKey}`
      },
      body: JSON.stringify({ action, ...payload })
    });

    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Сервер вернул непонятный ответ (${response.status}).`);
    }

    if (!response.ok || data.error) {
      throw new Error(data.error || `Ошибка сервера (${response.status}).`);
    }
    return data;
  }

  function cleanName(value) {
    return value.trim().replace(/\s+/g, " ");
  }

  function formatTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" })
      .format(new Date(value));
  }

  function initial(name) {
    return (name || "P").trim().charAt(0).toUpperCase();
  }

  function switchAuthMode(mode) {
    state.mode = mode;
    els.loginTab.classList.toggle("active", mode === "login");
    els.registerTab.classList.toggle("active", mode === "register");
    els.authSubmit.textContent = mode === "login" ? "Войти" : "Создать аккаунт";
    els.authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
    setAuthStatus("");
  }

  function showAuth() {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
    state.user = null;
    state.activeConversation = null;
    els.appScreen.classList.add("hidden");
    els.authScreen.classList.remove("hidden");
  }

  async function showApp(user) {
    state.user = user;
    els.currentUsername.textContent = user.username;
    els.authScreen.classList.add("hidden");
    els.appScreen.classList.remove("hidden");
    await refreshAll();
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        await loadConversations(false);
        if (state.activeConversation) await loadMessages(false);
      } catch (error) {
        console.warn(error);
      }
    }, cfg.pollIntervalMs);
  }

  async function refreshAll() {
    await Promise.all([loadUsers(), loadConversations()]);
    if (state.activeConversation) await loadMessages();
  }

  async function loadUsers() {
    if (!state.token) return;
    const data = await api("list_users", { token: state.token });
    state.users = data.users || [];
    renderUsers();
  }

  async function loadConversations(render = true) {
    if (!state.token) return;
    const data = await api("list_conversations", { token: state.token });
    state.conversations = data.conversations || [];
    if (state.activeConversation) {
      const updated = state.conversations.find((item) => item.id === state.activeConversation.id);
      if (updated) state.activeConversation = updated;
    }
    if (render) renderConversations();
    else renderConversations();
  }

  function renderConversations() {
    if (!state.conversations.length) {
      els.conversationList.innerHTML = '<div class="empty-small">Чатов пока нет</div>';
      return;
    }

    els.conversationList.innerHTML = state.conversations.map((conversation) => {
      const mine = state.activeConversation?.id === conversation.id ? " active" : "";
      const preview = conversation.last_message?.deleted_at
        ? "Сообщение удалено"
        : (conversation.last_message?.body || "Начните переписку");
      return `
        <button class="conversation${mine}" type="button" data-conversation-id="${conversation.id}">
          <div class="avatar">${escapeHtml(initial(conversation.other_user.username))}</div>
          <div class="conversation-main">
            <div class="conversation-top">
              <span class="conversation-name">${escapeHtml(conversation.other_user.username)}</span>
              <span class="conversation-time">${formatTime(conversation.last_message?.created_at)}</span>
            </div>
            <div class="conversation-preview">${escapeHtml(preview)}</div>
          </div>
        </button>`;
    }).join("");
  }

  function renderUsers() {
    const query = els.userSearch.value.trim().toLocaleLowerCase("ru");
    const filtered = state.users.filter((user) =>
      user.id !== state.user?.id &&
      user.username.toLocaleLowerCase("ru").includes(query)
    );

    els.userList.innerHTML = filtered.length
      ? filtered.map((user) => `
          <div class="user-card">
            <div class="avatar">${escapeHtml(initial(user.username))}</div>
            <strong>${escapeHtml(user.username)}</strong>
            <button type="button" data-user-id="${user.id}">Написать</button>
          </div>`).join("")
      : '<div class="empty-small">Пользователи не найдены</div>';
  }

  async function openConversation(conversationId) {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    state.activeConversation = conversation;
    els.chatTitle.textContent = conversation.other_user.username;
    els.chatAvatar.textContent = initial(conversation.other_user.username);
    els.emptyChat.classList.add("hidden");
    els.activeChat.classList.remove("hidden");
    els.appScreen.classList.add("chat-open");
    renderConversations();
    await loadMessages();
    els.messageInput.focus();
  }

  async function loadMessages(scroll = true) {
    if (!state.activeConversation) return;
    const data = await api("get_messages", {
      token: state.token,
      conversation_id: state.activeConversation.id
    });
    const next = data.messages || [];
    const changed = JSON.stringify(next) !== JSON.stringify(state.messages);
    state.messages = next;
    if (changed) renderMessages(scroll);
  }

  function renderMessages(scroll = true) {
    els.messageList.innerHTML = state.messages.length
      ? state.messages.map((message) => {
          const mine = message.sender_id === state.user.id;
          const deleted = Boolean(message.deleted_at);
          const text = deleted ? "Сообщение удалено" : message.body;
          return `
            <div class="bubble-row${mine ? " mine" : ""}">
              <div class="bubble${deleted ? " deleted" : ""}"
                   data-message-id="${message.id}"
                   data-mine="${mine ? "1" : "0"}">
                <span class="bubble-text">${escapeHtml(text)}</span>
                <span class="bubble-meta">
                  ${message.edited_at && !deleted ? '<span class="edited-mark" title="Изменено">✎</span>' : ""}
                  <span>${formatTime(message.created_at)}</span>
                </span>
              </div>
            </div>`;
        }).join("")
      : '<div class="empty-small">Напиши первое сообщение 💗</div>';

    if (scroll) els.messageList.scrollTop = els.messageList.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  els.loginTab.addEventListener("click", () => switchAuthMode("login"));
  els.registerTab.addEventListener("click", () => switchAuthMode("register"));

  els.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = cleanName(els.authUsername.value);
    const password = els.authPassword.value;

    if (username.length < 3) return setAuthStatus("Имя должно содержать минимум 3 символа.", true);
    if (password.length < 6) return setAuthStatus("Пароль должен содержать минимум 6 символов.", true);

    els.authSubmit.disabled = true;
    setAuthStatus("Подключаемся…");

    try {
      const data = await api(state.mode, { username, password });
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, state.token);
      els.authPassword.value = "";
      setAuthStatus("");
      await showApp(data.user);
    } catch (error) {
      setAuthStatus(error.message, true);
    } finally {
      els.authSubmit.disabled = false;
    }
  });

  els.logoutBtn.addEventListener("click", async () => {
    try {
      if (state.token) await api("logout", { token: state.token });
    } catch {}
    localStorage.removeItem(TOKEN_KEY);
    state.token = "";
    showAuth();
  });

  els.newChatBtn.addEventListener("click", async () => {
    try {
      await loadUsers();
      els.newChatDialog.showModal();
      els.userSearch.focus();
    } catch (error) {
      showToast(error.message);
    }
  });

  els.refreshBtn.addEventListener("click", async () => {
    try {
      await refreshAll();
      showToast("Обновлено");
    } catch (error) {
      showToast(error.message);
    }
  });

  els.userSearch.addEventListener("input", renderUsers);

  els.userList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-id]");
    if (!button) return;
    button.disabled = true;
    try {
      const data = await api("start_chat", {
        token: state.token,
        target_user_id: button.dataset.userId
      });
      els.newChatDialog.close();
      await loadConversations();
      await openConversation(data.conversation_id);
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  els.conversationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-conversation-id]");
    if (button) openConversation(button.dataset.conversationId).catch((error) => showToast(error.message));
  });

  els.backBtn.addEventListener("click", () => els.appScreen.classList.remove("chat-open"));

  els.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = els.messageInput.value.trim();
    if (!body || !state.activeConversation) return;
    els.messageInput.value = "";
    try {
      await api("send_message", {
        token: state.token,
        conversation_id: state.activeConversation.id,
        body
      });
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (error) {
      els.messageInput.value = body;
      showToast(error.message);
    }
  });

  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      els.messageForm.requestSubmit();
    }
  });

  els.messageList.addEventListener("dblclick", (event) => {
    const bubble = event.target.closest("[data-message-id]");
    if (!bubble || bubble.dataset.mine !== "1") return;
    const message = state.messages.find((item) => item.id === bubble.dataset.messageId);
    if (!message || message.deleted_at) return;
    state.selectedMessage = message;
    els.messageMenuDialog.showModal();
  });

  els.editMessageBtn.addEventListener("click", async () => {
    if (!state.selectedMessage) return;
    const next = prompt("Измени сообщение:", state.selectedMessage.body);
    if (next === null) return;
    const body = next.trim();
    if (!body) return showToast("Сообщение не может быть пустым.");
    try {
      await api("edit_message", {
        token: state.token,
        message_id: state.selectedMessage.id,
        body
      });
      els.messageMenuDialog.close();
      await loadMessages();
    } catch (error) {
      showToast(error.message);
    }
  });

  els.deleteMessageBtn.addEventListener("click", async () => {
    if (!state.selectedMessage || !confirm("Удалить сообщение?")) return;
    try {
      await api("delete_message", {
        token: state.token,
        message_id: state.selectedMessage.id
      });
      els.messageMenuDialog.close();
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (error) {
      showToast(error.message);
    }
  });

  els.closeMessageMenuBtn.addEventListener("click", () => els.messageMenuDialog.close());

  async function boot() {
    if (!cfg?.apiUrl || !cfg?.publishableKey) {
      setAuthStatus("Не заполнен config.js.", true);
      return;
    }
    if (!state.token) return showAuth();
    setAuthStatus("Проверяем сессию…");
    try {
      const data = await api("session", { token: state.token });
      await showApp(data.user);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      state.token = "";
      showAuth();
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.warn));
  }

  boot();
})();
