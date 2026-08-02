(() => {
  "use strict";

  const cfg = window.PINKSASHA_CONFIG;
  const TOKEN_KEY = "pinksasha_session_token";
  const THEME_KEY = "pinksasha_theme";
  const $ = (id) => document.getElementById(id);
  const EMOJIS = ["😀","😂","🥰","😍","😘","😊","😉","😭","🥺","😎","🤔","😡","❤️","💗","💕","💖","✨","🔥","👍","🙏","🎉","🌸","💅","🫶"];

  const state = {
    mode: "login",
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    users: [],
    conversations: [],
    activeConversation: null,
    messages: [],
    selectedMessage: null,
    selectedPhotoData: "",
    selectedAvatarData: "",
    pollTimer: null
  };

  const els = {
    toast: $("toast"), authScreen: $("authScreen"), appScreen: $("appScreen"),
    loginTab: $("loginTab"), registerTab: $("registerTab"), authForm: $("authForm"),
    authUsername: $("authUsername"), authPassword: $("authPassword"), authSubmit: $("authSubmit"),
    authStatus: $("authStatus"), profileBtn: $("profileBtn"), currentAvatar: $("currentAvatar"),
    currentUsername: $("currentUsername"), logoutBtn: $("logoutBtn"), newChatBtn: $("newChatBtn"),
    refreshBtn: $("refreshBtn"), conversationList: $("conversationList"), emptyChat: $("emptyChat"),
    activeChat: $("activeChat"), backBtn: $("backBtn"), chatAvatar: $("chatAvatar"),
    chatTitle: $("chatTitle"), chatSubtitle: $("chatSubtitle"), messageList: $("messageList"),
    mediaPreview: $("mediaPreview"), mediaPreviewImage: $("mediaPreviewImage"),
    removeMediaBtn: $("removeMediaBtn"), emojiPanel: $("emojiPanel"), messageForm: $("messageForm"),
    messageInput: $("messageInput"), photoBtn: $("photoBtn"), emojiBtn: $("emojiBtn"),
    photoInput: $("photoInput"), newChatDialog: $("newChatDialog"), userSearch: $("userSearch"),
    userList: $("userList"), profileDialog: $("profileDialog"), closeProfileBtn: $("closeProfileBtn"),
    profileAvatarPreview: $("profileAvatarPreview"), chooseAvatarBtn: $("chooseAvatarBtn"),
    avatarInput: $("avatarInput"), profileUsername: $("profileUsername"), profileBio: $("profileBio"),
    profileTheme: $("profileTheme"), saveProfileBtn: $("saveProfileBtn"),
    messageMenuDialog: $("messageMenuDialog"), editMessageBtn: $("editMessageBtn"),
    deleteMessageBtn: $("deleteMessageBtn"), closeMessageMenuBtn: $("closeMessageMenuBtn"),
    editMessageDialog: $("editMessageDialog"), editMessageInput: $("editMessageInput"),
    saveEditedMessageBtn: $("saveEditedMessageBtn"), cancelEditMessageBtn: $("cancelEditMessageBtn"),
    imageDialog: $("imageDialog"), imageDialogPhoto: $("imageDialogPhoto"),
    closeImageDialogBtn: $("closeImageDialogBtn")
  };

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function setAuthStatus(message, isError = false) {
    els.authStatus.textContent = message || "";
    els.authStatus.style.color = isError ? "#b42318" : "var(--accent)";
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
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`Сервер вернул непонятный ответ (${response.status}).`); }
    if (!response.ok || data.error) throw new Error(data.error || `Ошибка сервера (${response.status}).`);
    return data;
  }

  function cleanName(value) { return value.trim().replace(/\s+/g, " "); }
  function formatTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }
  function initial(name) { return (name || "P").trim().charAt(0).toUpperCase(); }
  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function avatarContent(user) {
    return user?.avatar_url
      ? `<img src="${escapeHtml(user.avatar_url)}" alt="">`
      : escapeHtml(initial(user?.username));
  }
  function setAvatar(element, user) { element.innerHTML = avatarContent(user); }
  function applyTheme(theme) {
    const allowed = ["pink","purple","peach","dark"];
    const next = allowed.includes(theme) ? theme : "pink";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
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

  function updateCurrentProfileUI() {
    if (!state.user) return;
    els.currentUsername.textContent = state.user.username;
    setAvatar(els.currentAvatar, state.user);
    applyTheme(state.user.theme || localStorage.getItem(THEME_KEY) || "pink");
  }

  async function showApp(user) {
    state.user = user;
    updateCurrentProfileUI();
    els.authScreen.classList.add("hidden");
    els.appScreen.classList.remove("hidden");
    await refreshAll();
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        await loadConversations();
        if (state.activeConversation) await loadMessages(false);
      } catch (error) { console.warn(error); }
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

  async function loadConversations() {
    if (!state.token) return;
    const data = await api("list_conversations", { token: state.token });
    state.conversations = data.conversations || [];
    if (state.activeConversation) {
      const updated = state.conversations.find((item) => item.id === state.activeConversation.id);
      if (updated) {
        state.activeConversation = updated;
        els.chatTitle.textContent = updated.other_user.username;
        els.chatSubtitle.textContent = updated.other_user.bio || "личная переписка";
        setAvatar(els.chatAvatar, updated.other_user);
      }
    }
    renderConversations();
  }

  function renderConversations() {
    if (!state.conversations.length) {
      els.conversationList.innerHTML = '<div class="empty-small">Чатов пока нет</div>';
      return;
    }
    els.conversationList.innerHTML = state.conversations.map((conversation) => {
      const active = state.activeConversation?.id === conversation.id ? " active" : "";
      const last = conversation.last_message;
      const preview = last?.deleted_at ? "Сообщение удалено"
        : last?.image_url ? (last.body ? `📷 ${last.body}` : "📷 Фотография")
        : (last?.body || "Начните переписку");
      return `
        <button class="conversation${active}" type="button" data-conversation-id="${conversation.id}">
          <div class="avatar">${avatarContent(conversation.other_user)}</div>
          <div class="conversation-main">
            <div class="conversation-top">
              <span class="conversation-name">${escapeHtml(conversation.other_user.username)}</span>
              <span class="conversation-time">${formatTime(last?.created_at)}</span>
            </div>
            <div class="conversation-preview">${escapeHtml(preview)}</div>
          </div>
        </button>`;
    }).join("");
  }

  function renderUsers() {
    const query = els.userSearch.value.trim().toLocaleLowerCase("ru");
    const filtered = state.users.filter((user) =>
      user.id !== state.user?.id && user.username.toLocaleLowerCase("ru").includes(query)
    );
    els.userList.innerHTML = filtered.length ? filtered.map((user) => `
      <div class="user-card">
        <div class="avatar">${avatarContent(user)}</div>
        <div><strong>${escapeHtml(user.username)}</strong><div class="conversation-preview">${escapeHtml(user.bio || "")}</div></div>
        <button type="button" data-user-id="${user.id}">Написать</button>
      </div>`).join("") : '<div class="empty-small">Пользователи не найдены</div>';
  }

  async function openConversation(conversationId) {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    state.activeConversation = conversation;
    els.chatTitle.textContent = conversation.other_user.username;
    els.chatSubtitle.textContent = conversation.other_user.bio || "личная переписка";
    setAvatar(els.chatAvatar, conversation.other_user);
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
    els.messageList.innerHTML = state.messages.length ? state.messages.map((message) => {
      const mine = message.sender_id === state.user.id;
      const deleted = Boolean(message.deleted_at);
      const body = deleted ? "Сообщение удалено" : (message.body || "");
      const image = !deleted && message.image_url
        ? `<img class="bubble-photo" src="${escapeHtml(message.image_url)}" data-full-image="${escapeHtml(message.image_url)}" alt="Фотография">`
        : "";
      const menu = mine && !deleted
        ? `<button class="message-menu-button" type="button" data-message-menu="${message.id}" aria-label="Меню сообщения">⋯</button>`
        : "";
      return `
        <div class="bubble-row${mine ? " mine" : ""}">
          <div class="bubble${deleted ? " deleted" : ""}${image ? " has-image" : ""}"
               data-message-id="${message.id}" data-mine="${mine ? "1" : "0"}">
            ${menu}${image}<span class="bubble-text">${escapeHtml(body)}</span>
            <span class="bubble-meta">
              ${message.edited_at && !deleted ? '<span class="edited-mark" title="Изменено">✎</span>' : ""}
              <span>${formatTime(message.created_at)}</span>
            </span>
          </div>
        </div>`;
    }).join("") : '<div class="empty-small">Напиши первое сообщение 💗</div>';
    if (scroll) els.messageList.scrollTop = els.messageList.scrollHeight;
  }

  function clearSelectedPhoto() {
    state.selectedPhotoData = "";
    els.photoInput.value = "";
    els.mediaPreview.classList.add("hidden");
    els.mediaPreviewImage.removeAttribute("src");
  }

  async function compressImage(file, maxDimension, quality = 0.82) {
    if (!file.type.startsWith("image/")) throw new Error("Выбери изображение.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Файл слишком большой. Максимум 12 МБ.");
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      let { width, height } = image;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", quality);
    } finally { URL.revokeObjectURL(objectUrl); }
  }

  function openProfile() {
    state.selectedAvatarData = "";
    els.profileUsername.value = state.user.username;
    els.profileBio.value = state.user.bio || "";
    els.profileTheme.value = state.user.theme || "pink";
    setAvatar(els.profileAvatarPreview, state.user);
    els.profileDialog.showModal();
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
    } catch (error) { setAuthStatus(error.message, true); }
    finally { els.authSubmit.disabled = false; }
  });

  els.logoutBtn.addEventListener("click", async () => {
    try { if (state.token) await api("logout", { token: state.token }); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    state.token = "";
    showAuth();
  });

  els.profileBtn.addEventListener("click", openProfile);
  els.closeProfileBtn.addEventListener("click", () => els.profileDialog.close());
  els.chooseAvatarBtn.addEventListener("click", () => els.avatarInput.click());
  els.avatarInput.addEventListener("change", async () => {
    const file = els.avatarInput.files?.[0];
    if (!file) return;
    try {
      state.selectedAvatarData = await compressImage(file, 700, 0.84);
      els.profileAvatarPreview.innerHTML = `<img src="${state.selectedAvatarData}" alt="">`;
    } catch (error) { showToast(error.message); }
  });
  els.profileTheme.addEventListener("change", () => applyTheme(els.profileTheme.value));
  els.saveProfileBtn.addEventListener("click", async () => {
    const username = cleanName(els.profileUsername.value);
    if (username.length < 3) return showToast("Имя должно содержать минимум 3 символа.");
    els.saveProfileBtn.disabled = true;
    try {
      const data = await api("update_profile", {
        token: state.token,
        username,
        bio: els.profileBio.value.trim(),
        theme: els.profileTheme.value,
        avatar_data_url: state.selectedAvatarData || undefined
      });
      state.user = data.user;
      updateCurrentProfileUI();
      els.profileDialog.close();
      await refreshAll();
      showToast("Профиль сохранён");
    } catch (error) { showToast(error.message); }
    finally { els.saveProfileBtn.disabled = false; }
  });

  els.newChatBtn.addEventListener("click", async () => {
    try { await loadUsers(); els.newChatDialog.showModal(); els.userSearch.focus(); }
    catch (error) { showToast(error.message); }
  });
  els.refreshBtn.addEventListener("click", async () => {
    try { await refreshAll(); showToast("Обновлено"); } catch (error) { showToast(error.message); }
  });
  els.userSearch.addEventListener("input", renderUsers);
  els.userList.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-user-id]");
    if (!button) return;
    button.disabled = true;
    try {
      const data = await api("start_chat", { token: state.token, target_user_id: button.dataset.userId });
      els.newChatDialog.close();
      await loadConversations();
      await openConversation(data.conversation_id);
    } catch (error) { showToast(error.message); }
    finally { button.disabled = false; }
  });
  els.conversationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-conversation-id]");
    if (button) openConversation(button.dataset.conversationId).catch((error) => showToast(error.message));
  });
  els.backBtn.addEventListener("click", () => els.appScreen.classList.remove("chat-open"));

  els.emojiPanel.innerHTML = EMOJIS.map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join("");
  els.emojiBtn.addEventListener("click", () => els.emojiPanel.classList.toggle("hidden"));
  els.emojiPanel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    const start = els.messageInput.selectionStart;
    const end = els.messageInput.selectionEnd;
    els.messageInput.setRangeText(button.dataset.emoji, start, end, "end");
    els.messageInput.focus();
  });
  els.photoBtn.addEventListener("click", () => els.photoInput.click());
  els.photoInput.addEventListener("change", async () => {
    const file = els.photoInput.files?.[0];
    if (!file) return;
    try {
      showToast("Готовим фотографию…");
      state.selectedPhotoData = await compressImage(file, 1400, 0.82);
      els.mediaPreviewImage.src = state.selectedPhotoData;
      els.mediaPreview.classList.remove("hidden");
    } catch (error) { clearSelectedPhoto(); showToast(error.message); }
  });
  els.removeMediaBtn.addEventListener("click", clearSelectedPhoto);

  els.messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = els.messageInput.value.trim();
    if ((!body && !state.selectedPhotoData) || !state.activeConversation) return;
    const photo = state.selectedPhotoData;
    els.messageInput.value = "";
    clearSelectedPhoto();
    try {
      await api("send_message", {
        token: state.token,
        conversation_id: state.activeConversation.id,
        body,
        image_data_url: photo || undefined
      });
      await Promise.all([loadMessages(), loadConversations()]);
    } catch (error) {
      els.messageInput.value = body;
      state.selectedPhotoData = photo;
      if (photo) { els.mediaPreviewImage.src = photo; els.mediaPreview.classList.remove("hidden"); }
      showToast(error.message);
    }
  });
  els.messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      els.messageForm.requestSubmit();
    }
  });

  function selectMessage(messageId) {
    const message = state.messages.find((item) => item.id === messageId);
    if (!message || message.sender_id !== state.user.id || message.deleted_at) return;
    state.selectedMessage = message;
    els.messageMenuDialog.showModal();
  }
  els.messageList.addEventListener("click", (event) => {
    const menuButton = event.target.closest("[data-message-menu]");
    if (menuButton) { event.stopPropagation(); selectMessage(menuButton.dataset.messageMenu); return; }
    const image = event.target.closest("[data-full-image]");
    if (image) {
      els.imageDialogPhoto.src = image.dataset.fullImage;
      els.imageDialog.showModal();
    }
  });
  els.messageList.addEventListener("contextmenu", (event) => {
    const bubble = event.target.closest("[data-message-id]");
    if (!bubble || bubble.dataset.mine !== "1") return;
    event.preventDefault();
    selectMessage(bubble.dataset.messageId);
  });

  els.editMessageBtn.addEventListener("click", () => {
    if (!state.selectedMessage) return;
    els.messageMenuDialog.close();
    els.editMessageInput.value = state.selectedMessage.body || "";
    els.editMessageDialog.showModal();
    els.editMessageInput.focus();
  });
  els.saveEditedMessageBtn.addEventListener("click", async () => {
    if (!state.selectedMessage) return;
    const body = els.editMessageInput.value.trim();
    if (!body && !state.selectedMessage.image_url) return showToast("Сообщение не может быть пустым.");
    try {
      await api("edit_message", { token: state.token, message_id: state.selectedMessage.id, body });
      els.editMessageDialog.close();
      await Promise.all([loadMessages(), loadConversations()]);
      showToast("Сообщение изменено");
    } catch (error) { showToast(error.message); }
  });
  els.cancelEditMessageBtn.addEventListener("click", () => els.editMessageDialog.close());
  els.deleteMessageBtn.addEventListener("click", async () => {
    if (!state.selectedMessage || !confirm("Удалить сообщение?")) return;
    try {
      await api("delete_message", { token: state.token, message_id: state.selectedMessage.id });
      els.messageMenuDialog.close();
      await Promise.all([loadMessages(), loadConversations()]);
      showToast("Сообщение удалено");
    } catch (error) { showToast(error.message); }
  });
  els.closeMessageMenuBtn.addEventListener("click", () => els.messageMenuDialog.close());
  els.closeImageDialogBtn.addEventListener("click", () => els.imageDialog.close());
  els.imageDialog.addEventListener("click", (event) => {
    if (event.target === els.imageDialog) els.imageDialog.close();
  });

  async function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || "pink");
    if (!cfg?.apiUrl || !cfg?.publishableKey) return setAuthStatus("Не заполнен config.js.", true);
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
