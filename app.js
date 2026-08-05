(() => {
  "use strict";

  const cfg = window.PINKSASHA_CONFIG;
  const TOKEN_KEY = "pinksasha_session_token";
  const THEME_KEY = "pinksasha_theme";
  const $ = (id) => document.getElementById(id);
  const e = new Proxy({}, { get: (_, prop) => $(String(prop)) });

  const EMOJIS = ["😀","😂","🥰","😍","😘","😊","😉","😭","🥺","😎","🤔","😡","❤️","💗","💕","💖","✨","🔥","👍","🙏","🎉","🌸","💅","🫶"];
  const HEART_PATTERN = /(?:❤️|🩷|💗|💖|💕|💞|💘|💝|💓|💟|♥️|♥|<3)/u;

  const state = {
    mode: "login",
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    users: [],
    conversations: [],
    activeConversation: null,
    messages: [],
    stories: [],
    storyIndex: 0,
    selectedMessage: null,
    selectedPhotoData: "",
    selectedAvatarData: "",
    selectedStoryData: "",
    pollTimer: null,
    storyTimer: null,
    messagesLoadedFor: null,
    adminData: null,
    conversationRenderKey: "",
    keepBottom: true,
    chatBackgroundKey: "",
    loveTimer: null,
    stickerPacks: [],
    activeStickerPackId: "",
    stickerFiles: [],
    replyTo: null,
    pinnedMessage: null,
    chatActivity: null,
    typingTimer: null,
    typingLastSent: 0,
    recordingActivityTimer: null,
    recorder: null,
    mediaStream: null,
    recordingChunks: [],
    recordingKind: "",
    recordingStartedAt: 0,
    recordingInterval: null,
    recordingShouldSend: true,
    calendarCursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calendarSelectedDate: "",
    calendarEvents: [],
    galleryPhotos: [],
  };

  function toast(message) {
    e.toast.textContent = message;
    e.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => e.toast.classList.remove("show"), 3200);
  }

  function authStatus(message, error = false) {
    e.authStatus.textContent = message || "";
    e.authStatus.style.color = error ? "#b42318" : "var(--accent)";
  }

  async function api(action, payload = {}) {
    const response = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${cfg.publishableKey}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`Сервер вернул непонятный ответ (${response.status}).`);
    }
    if (!response.ok || data.error) throw new Error(data.error || `Ошибка сервера (${response.status}).`);
    return data;
  }

  const clean = (value) => value.trim().replace(/\s+/g, " ");
  const initial = (name) => (name || "P").trim().charAt(0).toUpperCase();
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function svg(name, className = "") {
    return `<svg${className ? ` class="${className}"` : ""} aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function fmt(value) {
    return value ? new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
  }

  function ago(value) {
    if (!value) return "";
    const seconds = Math.max(1, Math.floor((Date.now() - new Date(value)) / 1000));
    if (seconds < 60) return "только что";
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`;
    return `${Math.floor(seconds / 86400)} дн. назад`;
  }

  function online(user) {
    return user?.last_seen_at && Date.now() - new Date(user.last_seen_at).getTime() < 90000;
  }

  function avatarHTML(user) {
    return user?.avatar_url ? `<img src="${esc(user.avatar_url)}" alt="">` : esc(initial(user?.username));
  }

  function setAvatar(element, user) {
    if (!element) return;
    const key = user?.avatar_url ? `url:${user.avatar_url}` : `initial:${initial(user?.username)}`;
    if (element.dataset.avatarKey === key) return;
    element.dataset.avatarKey = key;
    if (user?.avatar_url) {
      const image = document.createElement("img");
      image.src = user.avatar_url;
      image.alt = "";
      image.decoding = "async";
      image.loading = "eager";
      element.replaceChildren(image);
    } else element.textContent = initial(user?.username);
  }

  function applyTheme(theme) {
    const selected = ["pink", "purple", "peach", "dark"].includes(theme) ? theme : "pink";
    document.documentElement.dataset.theme = selected;
    localStorage.setItem(THEME_KEY, selected);
  }

  function applyChatBackground(chat) {
    if (!chat || !e.activeChat) return;
    const preset = chat.wallpaper || "rose";
    const url = chat.wallpaper_url || "";
    const key = `${preset}|${url}`;
    if (state.chatBackgroundKey === key) return;
    state.chatBackgroundKey = key;
    e.activeChat.dataset.wallpaper = preset;
    if (url) e.activeChat.style.setProperty("--chat-custom-bg", `url("${url.replaceAll('\"', '%22')}")`);
    else e.activeChat.style.removeProperty("--chat-custom-bg");
    e.wallpaperGrid?.querySelectorAll("[data-wallpaper]").forEach((button) => {
      button.classList.toggle("active", button.dataset.wallpaper === preset);
    });
  }

  function showLoveEvent(event) {
    clearTimeout(state.loveTimer);
    e.loveMessage.textContent = event?.message || "Я тебя люблю <3";
    e.loveSender.textContent = event?.sender?.username ? `От ${event.sender.username}` : "";
    e.loveOverlay.classList.remove("hidden");
    rainHearts();
    state.loveTimer = setTimeout(() => e.loveOverlay.classList.add("hidden"), 5200);
  }

  function handleSpecialEvents(events) {
    for (const event of events || []) if (event.type === "love") showLoveEvent(event);
  }

  async function saveChatBackground(wallpaper, imageData = "") {
    if (!state.activeConversation) return;
    const data = await api("update_chat_background", {
      token: state.token,
      conversation_id: state.activeConversation.id,
      wallpaper,
      image_data_url: imageData || undefined,
    });
    applyChatBackground(data.chat);
    e.wallpaperStatus.textContent = "Фон изменён у обоих участников";
    setTimeout(() => { e.wallpaperStatus.textContent = ""; }, 2300);
  }

  function setMode(mode) {
    state.mode = mode;
    e.loginTab.classList.toggle("active", mode === "login");
    e.registerTab.classList.toggle("active", mode === "register");
    e.authSubmit.textContent = mode === "login" ? "Войти" : "Создать аккаунт";
    e.authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
    authStatus("");
  }

  function showAuth() {
    clearInterval(state.pollTimer);
    clearInterval(state.recordingActivityTimer);
    state.user = null;
    state.activeConversation = null;
    e.appScreen.classList.add("hidden");
    e.authScreen.classList.remove("hidden");
  }

  function profileUI() {
    if (!state.user) return;
    e.currentUsername.textContent = state.user.username;
    setAvatar(e.currentAvatar, state.user);
    applyTheme(state.user.theme || localStorage.getItem(THEME_KEY) || "pink");
    e.adminBtn.classList.toggle("hidden", state.user.role !== "admin");
  }

  async function showApp(user) {
    state.user = user;
    profileUI();
    e.authScreen.classList.add("hidden");
    e.appScreen.classList.remove("hidden");
    await refreshAll();
    await updateNotificationUI();
    try {
      const beat = await api("heartbeat", { token: state.token, conversation_id: state.activeConversation?.id || undefined });
      handleSpecialEvents(beat.events);
      if (Object.prototype.hasOwnProperty.call(beat, "activity")) {
        state.chatActivity = beat.activity || null;
        updateChatHead();
      }
    } catch {}
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      try {
        const [, , beat] = await Promise.all([
          loadConversations(),
          loadStories(),
          api("heartbeat", { token: state.token, conversation_id: state.activeConversation?.id || undefined }),
        ]);
        handleSpecialEvents(beat.events);
        if (Object.prototype.hasOwnProperty.call(beat, "activity")) {
          state.chatActivity = beat.activity || null;
          updateChatHead();
        }
        if (state.activeConversation) await loadMessages(false);
      } catch (error) {
        console.warn(error);
      }
    }, cfg.pollIntervalMs);
  }

  async function refreshAll() {
    await Promise.all([loadUsers(), loadConversations(), loadStories(), loadStickerPacks()]);
    if (state.activeConversation) await loadMessages();
    updateBadge();
  }

  async function loadUsers() {
    if (!state.token) return;
    state.users = (await api("list_users", { token: state.token })).users || [];
    renderUsers();
  }

  function conversationPreview(message) {
    if (!message) return "Начните переписку";
    if (message.deleted_at) return "Сообщение удалено";
    if (message.kind === "sticker") return "Стикер";
    if (message.kind === "voice") return "Голосовое сообщение";
    if (message.kind === "video") return "Видеосообщение";
    if (message.kind === "image" || message.image_url) return message.body || "Фотография";
    return message.body || "Новое сообщение";
  }

  async function loadConversations() {
    if (!state.token) return;
    const next = (await api("list_conversations", { token: state.token })).conversations || [];
    state.conversations = next;
    if (state.activeConversation) {
      const current = next.find((conversation) => conversation.id === state.activeConversation.id);
      if (current) {
        state.activeConversation = current;
        updateChatHead();
      }
    }
    const key = JSON.stringify(next.map((conversation) => [
      conversation.id,
      conversation.other_user?.username,
      conversation.other_user?.avatar_url || "",
      online(conversation.other_user),
      conversation.last_message?.id,
      conversation.last_message?.kind,
      conversation.last_message?.body,
      conversation.last_message?.image_url,
      conversation.last_message?.deleted_at,
      conversation.last_message?.created_at,
      Number(conversation.unread_count || 0),
    ]));
    if (key !== state.conversationRenderKey) {
      state.conversationRenderKey = key;
      renderConversations();
    }
    updateBadge();
  }

  async function loadStories() {
    if (!state.token) return;
    state.stories = (await api("list_stories", { token: state.token })).stories || [];
    renderStories();
  }

  function activityText(activity) {
    if (activity === "typing") return "печатает…";
    if (activity === "recording_voice") return "записывает голосовое…";
    if (activity === "recording_video") return "записывает видеосообщение…";
    return "";
  }

  function updateChatHead() {
    const user = state.activeConversation?.other_user;
    if (!user) return;
    const activeText = activityText(state.chatActivity?.activity);
    const subtitle = activeText || (online(user)
      ? "в сети"
      : user.last_seen_at
        ? `был(а) ${ago(user.last_seen_at)}`
        : (user.bio || "личная переписка"));
    if (e.chatTitle.textContent !== user.username) e.chatTitle.textContent = user.username;
    if (e.chatSubtitle.textContent !== subtitle) e.chatSubtitle.textContent = subtitle;
    e.chatTitle.parentElement.classList.toggle("activity", Boolean(activeText));
    setAvatar(e.chatAvatar, user);
    updateContactPanel(user, activeText || subtitle);
  }

  function updateContactPanel(user, statusText = "") {
    if (!e.contactPanel || !e.contactContent) return;
    const empty = e.contactPanel.querySelector(".contact-empty");
    if (!user) {
      e.contactContent.classList.add("hidden");
      empty?.classList.remove("hidden");
      return;
    }
    empty?.classList.add("hidden");
    e.contactContent.classList.remove("hidden");
    setAvatar(e.contactPanelAvatar, user);
    e.contactPanelName.textContent = user.username || "Пользователь";
    e.contactPanelStatus.textContent = statusText || (online(user) ? "в сети" : "не в сети");
    e.contactPanelStatus.classList.toggle("online", Boolean(activityText(state.chatActivity?.activity) || online(user)));
    e.contactPanelBio.textContent = user.bio?.trim() || "Информация не указана";
    renderContactMedia();
  }

  function renderContactMedia() {
    if (!e.contactMediaPreview) return;
    const photos = state.messages.filter((message) => !message.deleted_at && (message.image_url || message._local_image)).slice(-6).reverse();
    e.contactMediaPreview.innerHTML = photos.length
      ? photos.map((message) => `<button type="button" data-contact-image="${esc(message.image_url || message._local_image)}"><img src="${esc(message.image_url || message._local_image)}" alt=""></button>`).join("")
      : '<div class="contact-media-empty">Фотографий пока нет</div>';
  }

  function renderConversations() {
    const query = (e.chatSearch?.value || "").trim().toLocaleLowerCase("ru");
    const items = query
      ? state.conversations.filter((conversation) =>
          (conversation.other_user?.username || "").toLocaleLowerCase("ru").includes(query) ||
          conversationPreview(conversation.last_message).toLocaleLowerCase("ru").includes(query))
      : state.conversations;
    if (e.chatCountLabel) e.chatCountLabel.textContent = state.conversations.length ? String(state.conversations.length) : "";
    if (!items.length) {
      e.conversationList.innerHTML = `<div class="empty-small">${query ? "Ничего не найдено" : "Чатов пока нет"}</div>`;
      return;
    }
    e.conversationList.innerHTML = items.map((conversation) => {
      const active = state.activeConversation?.id === conversation.id ? " active" : "";
      const last = conversation.last_message;
      const unread = Number(conversation.unread_count || 0);
      return `<button class="conversation${active}" type="button" data-conversation-id="${conversation.id}">
        <span class="avatar-wrap"><span class="avatar">${avatarHTML(conversation.other_user)}</span>${online(conversation.other_user) ? '<span class="online-dot"></span>' : ""}</span>
        <span class="conversation-main"><span class="conversation-top"><span class="conversation-name">${esc(conversation.other_user.username)}</span></span><span class="conversation-preview">${esc(conversationPreview(last))}</span></span>
        <span class="conversation-side"><span class="conversation-time">${fmt(last?.created_at)}</span>${unread ? `<span class="unread-badge">${unread > 99 ? "99+" : unread}</span>` : ""}</span>
      </button>`;
    }).join("");
  }

  function renderUsers() {
    const query = e.userSearch.value.trim().toLocaleLowerCase("ru");
    const users = state.users.filter((user) => user.id !== state.user?.id && user.username.toLocaleLowerCase("ru").includes(query));
    e.userList.innerHTML = users.length
      ? users.map((user) => `<div class="user-card"><div class="avatar">${avatarHTML(user)}</div><div><strong>${esc(user.username)}</strong><div class="conversation-preview">${online(user) ? "в сети" : esc(user.bio || "")}</div></div><button type="button" data-user-id="${user.id}">Написать</button></div>`).join("")
      : '<div class="empty-small">Пользователи не найдены</div>';
  }

  function renderStories() {
    if (!state.stories.length) {
      e.storyList.innerHTML = '<div class="story-empty">Пока нет опубликованных историй</div>';
      return;
    }
    e.storyList.innerHTML = state.stories.map((story, index) => `<button class="story-item${story.viewed_by_me || story.user_id === state.user.id ? " viewed" : ""}" type="button" data-story-index="${index}"><span class="story-ring"><span class="avatar">${avatarHTML(story.user)}</span></span><span class="story-name">${story.user_id === state.user.id ? "Моя" : esc(story.user.username)}</span></button>`).join("");
  }

  function nearBottom() {
    return e.messageList.scrollHeight - e.messageList.scrollTop - e.messageList.clientHeight < 110;
  }

  function scrollToBottom(force = false) {
    const run = () => {
      if (force || state.keepBottom || nearBottom()) e.messageList.scrollTop = e.messageList.scrollHeight;
    };
    requestAnimationFrame(() => { run(); requestAnimationFrame(run); });
    setTimeout(run, 80);
    setTimeout(run, 260);
    e.messageList.querySelectorAll("img,video").forEach((media) => {
      if (media.tagName === "IMG" && !media.complete) media.addEventListener("load", run, { once: true });
      if (media.tagName === "VIDEO") media.addEventListener("loadedmetadata", run, { once: true });
    });
  }

  let viewportFrame = 0;
  function syncViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      const viewport = window.visualViewport;
      const height = Math.max(1, viewport?.height || window.innerHeight);
      const width = Math.max(1, viewport?.width || window.innerWidth);
      const top = viewport?.offsetTop || 0;
      const left = viewport?.offsetLeft || 0;
      const keyboardOpen = width <= 900 && (window.innerHeight - height) > 120;

      document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
      document.documentElement.style.setProperty("--app-width", `${Math.round(width)}px`);
      document.documentElement.style.setProperty("--viewport-top", `${Math.round(top)}px`);
      document.documentElement.style.setProperty("--viewport-left", `${Math.round(left)}px`);
      document.documentElement.classList.toggle("keyboard-open", keyboardOpen);

      if (document.activeElement === e.messageInput && state.activeConversation) {
        setTimeout(() => scrollToBottom(true), 30);
        setTimeout(() => scrollToBottom(true), 180);
      }
    });
  }

  function autoGrowComposer() {
    e.messageInput.style.height = "auto";
    e.messageInput.style.height = `${Math.min(e.messageInput.scrollHeight, 120)}px`;
  }

  async function openConversation(id) {
    const conversation = state.conversations.find((item) => item.id === id);
    if (!conversation) return;
    if (state.activeConversation?.id !== id) {
      state.messages = [];
      state.messagesLoadedFor = null;
      state.chatActivity = null;
      state.typingLastSent = 0;
      clearReply();
    }
    state.activeConversation = conversation;
    state.keepBottom = true;
    updateChatHead();
    e.emptyChat.classList.add("hidden");
    e.activeChat.classList.remove("hidden");
    e.appScreen.classList.add("chat-open");
    renderConversations();
    await loadMessages(true);
    scrollToBottom(true);
    if (matchMedia("(min-width:761px)").matches) e.messageInput.focus({ preventScroll: true });
    history.replaceState(null, "", `${location.pathname}?chat=${encodeURIComponent(id)}`);
  }

  function updatePinnedBanner(chat) {
    state.pinnedMessage = chat?.pinned_message || null;
    if (!state.pinnedMessage) {
      e.pinnedBanner.classList.add("hidden");
      e.pinnedText.textContent = "";
      return;
    }
    e.pinnedText.textContent = state.pinnedMessage.body || "Сообщение";
    e.pinnedBanner.classList.remove("hidden");
  }

  async function loadMessages(scroll = true) {
    if (!state.activeConversation) return;
    const conversationId = state.activeConversation.id;
    const wasReady = state.messagesLoadedFor === conversationId;
    const known = new Set(state.messages.filter((message) => !message._pending && !message._failed).map((message) => message.id));
    const wasPinned = nearBottom();
    const data = await api("get_messages", { token: state.token, conversation_id: conversationId });
    const server = data.messages || [];
    const serverClientIds = new Set(server.map((message) => message.client_id).filter(Boolean));
    const local = state.messages.filter((message) =>
      (message._pending || message._failed) &&
      message.conversation_id === conversationId &&
      !serverClientIds.has(message.client_id));
    const next = [...server, ...local].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const changed = JSON.stringify(next) !== JSON.stringify(state.messages);
    const heart = wasReady && server.some((message) => !known.has(message.id) && !message.deleted_at && HEART_PATTERN.test(message.body || ""));
    applyChatBackground(data.chat);
    updatePinnedBanner(data.chat);
    state.chatActivity = data.activity || null;
    updateChatHead();
    state.messages = next;
    state.messagesLoadedFor = conversationId;
    if (changed) renderMessages(scroll || wasPinned);
    renderContactMedia();
    if (heart) rainHearts();
    loadConversations().catch(console.warn);
  }

  function replyLabel(reply) {
    if (!reply) return "";
    return reply.sender_id === state.user.id ? "Вы" : (state.activeConversation?.other_user?.username || "Сообщение");
  }

  function messageText(message) {
    if (!message) return "Сообщение";
    if (message.deleted_at) return "Сообщение удалено";
    if (message.kind === "sticker") return "Стикер";
    if (message.kind === "voice") return "Голосовое сообщение";
    if (message.kind === "video") return "Видеосообщение";
    if (message.kind === "image") return message.body || "Фотография";
    return message.body || "Сообщение";
  }

  function mediaMarkup(message, deleted) {
    if (deleted) return "";
    const imageUrl = message.image_url || message._local_image || "";
    const stickerUrl = message.sticker_url || message._local_sticker || "";
    const audioUrl = message.audio_url || message._local_audio || "";
    const videoUrl = message.video_url || message._local_video || "";
    if (message.kind === "sticker" && stickerUrl) return `<img class="sticker-image" src="${esc(stickerUrl)}" alt="Стикер">`;
    if (message.kind === "voice" && audioUrl) return `<div class="voice-player"><audio controls preload="metadata" src="${esc(audioUrl)}"></audio><span class="voice-duration">${Math.max(1, Number(message.audio_duration || 1))} сек.</span></div>`;
    if (message.kind === "video" && videoUrl) return `<video class="video-circle" controls playsinline preload="metadata" src="${esc(videoUrl)}"></video>`;
    if (imageUrl) return `<img class="bubble-photo" src="${esc(imageUrl)}" data-full-image="${esc(imageUrl)}" alt="Фотография">`;
    return "";
  }

  function renderMessages(scroll = true) {
    if (!state.messages.length) {
      e.messageList.innerHTML = '<div class="empty-small">Начните переписку</div>';
      if (scroll) scrollToBottom(true);
      return;
    }
    e.messageList.innerHTML = state.messages.map((message) => {
      const mine = message.sender_id === state.user.id;
      const deleted = Boolean(message.deleted_at);
      const content = deleted ? "Сообщение удалено" : (message.body || "");
      const media = mediaMarkup(message, deleted);
      const reply = !deleted && message.reply
        ? `<button class="message-reply" type="button" data-jump-message="${message.reply.id}"><b>${esc(replyLabel(message.reply))}</b><span>${esc(message.reply.body || "Сообщение")}</span></button>`
        : "";
      const menu = !deleted && !message._pending
        ? `<button class="message-menu-button${mine ? "" : " incoming"}" type="button" data-message-menu="${message.id}" aria-label="Меню сообщения">${svg("more")}</button>`
        : "";
      const read = mine && !deleted
        ? message._failed
          ? `<span class="read-mark failed-mark">${svg("alert")}</span>`
          : message._pending
            ? '<span class="read-mark"><span class="sending-spinner"></span></span>'
            : message.read_at
              ? `<span class="read-mark double">${svg("check")}${svg("check")}</span>`
              : `<span class="read-mark">${svg("check")}</span>`
        : "";
      const extra = message._failed ? " failed" : message._pending ? " pending" : "";
      const kindClass = deleted ? "" : message.kind === "sticker" ? " sticker-bubble" : message.kind === "voice" ? " voice-bubble" : message.kind === "video" ? " video-bubble" : "";
      const imageClass = (message.image_url || message._local_image) ? " has-image" : "";
      return `<div class="bubble-row${mine ? " mine" : ""}"><div class="bubble${deleted ? " deleted" : ""}${imageClass}${kindClass}${extra}" data-message-id="${message.id}" data-mine="${mine ? "1" : "0"}">${menu}${reply}${media}${content ? `<span class="bubble-text">${esc(content)}</span>` : ""}<span class="bubble-meta">${message.edited_at && !deleted ? '<span class="edited-mark">✎</span>' : ""}<span>${fmt(message.created_at)}</span>${read}</span></div></div>`;
    }).join("");
    if (scroll) scrollToBottom(true);
  }

  async function updateBadge() {
    const count = state.conversations.reduce((sum, conversation) => sum + Number(conversation.unread_count || 0), 0);
    try {
      if (count && navigator.setAppBadge) await navigator.setAppBadge(count);
      else if (navigator.clearAppBadge) await navigator.clearAppBadge();
    } catch {}
  }

  function rainHearts() {
    e.heartRain.replaceChildren();
    for (let index = 0; index < 30; index++) {
      const heart = document.createElement("span");
      heart.className = "heart-drop";
      heart.innerHTML = svg("heart");
      heart.style.setProperty("--x", `${Math.random() * 100}vw`);
      heart.style.setProperty("--size", `${15 + Math.random() * 23}px`);
      heart.style.setProperty("--delay", `${Math.random() * .55}s`);
      heart.style.setProperty("--duration", `${1.9 + Math.random() * .8}s`);
      heart.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
      heart.style.setProperty("--rotate", `${-120 + Math.random() * 240}deg`);
      e.heartRain.appendChild(heart);
    }
    setTimeout(() => e.heartRain.replaceChildren(), 3300);
  }

  function clearPhoto() {
    state.selectedPhotoData = "";
    e.photoInput.value = "";
    e.mediaPreview.classList.add("hidden");
    e.mediaPreviewImage.removeAttribute("src");
  }

  async function compress(file, max, quality = .82, transparent = false) {
    if (!file.type.startsWith("image/")) throw new Error("Выбери изображение.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Файл слишком большой. Максимум 12 МБ.");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      let width = image.width;
      let height = image.height;
      const scale = Math.min(1, max / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(image, 0, 0, width, height);
      return canvas.toDataURL(transparent ? "image/webp" : "image/jpeg", quality);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function fileToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
      reader.readAsDataURL(blob);
    });
  }

  function clearReply() {
    state.replyTo = null;
    e.replyPreview.classList.add("hidden");
    e.replyName.textContent = "";
    e.replyText.textContent = "";
  }

  function setReply(message) {
    state.replyTo = message;
    e.replyName.textContent = message.sender_id === state.user.id ? "Ответ себе" : `Ответ: ${state.activeConversation?.other_user?.username || ""}`;
    e.replyText.textContent = messageText(message);
    e.replyPreview.classList.remove("hidden");
    e.messageInput.focus({ preventScroll: true });
    scrollToBottom(true);
  }

  function createClientId() {
    return `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(16).slice(2)}`;
  }

  async function sendOptimistic(payload, optimistic = {}) {
    if (!state.activeConversation) return;
    const conversationId = state.activeConversation.id;
    const clientId = createClientId();
    const tempId = `pending-${clientId}`;
    const local = {
      id: tempId,
      client_id: clientId,
      conversation_id: conversationId,
      sender_id: state.user.id,
      kind: payload.kind || "text",
      body: payload.body || null,
      reply_to_id: state.replyTo?.id || null,
      reply: state.replyTo ? {
        id: state.replyTo.id,
        sender_id: state.replyTo.sender_id,
        body: messageText(state.replyTo),
        kind: state.replyTo.kind,
      } : null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      read_at: null,
      _pending: true,
      ...optimistic,
    };
    state.messages.push(local);
    state.keepBottom = true;
    clearReply();
    renderMessages(true);
    try {
      const data = await api("send_message", {
        token: state.token,
        conversation_id: conversationId,
        client_id: clientId,
        reply_to_id: local.reply_to_id || undefined,
        ...payload,
      });
      const index = state.messages.findIndex((message) => message.client_id === clientId || message.id === tempId);
      if (index >= 0) state.messages.splice(index, 1, data.message);
      else if (!state.messages.some((message) => message.id === data.message.id)) state.messages.push(data.message);
      renderMessages(true);
      if (HEART_PATTERN.test(payload.body || "")) rainHearts();
      loadConversations().catch(console.warn);
    } catch (error) {
      const index = state.messages.findIndex((message) => message.client_id === clientId || message.id === tempId);
      if (index >= 0) state.messages[index] = { ...state.messages[index], _pending: false, _failed: true };
      renderMessages(true);
      toast(`${error.message} — сообщение не отправлено`);
    }
  }

  async function loadStickerPacks() {
    if (!state.token) return;
    const data = await api("list_sticker_packs", { token: state.token });
    state.stickerPacks = data.packs || [];
    if (!state.activeStickerPackId || !state.stickerPacks.some((pack) => pack.id === state.activeStickerPackId)) {
      state.activeStickerPackId = state.stickerPacks[0]?.id || "";
    }
    renderStickerPanel();
    renderMyStickerPacks();
  }

  function renderStickerPanel() {
    if (!state.stickerPacks.length) {
      e.stickerPackTabs.innerHTML = "";
      e.stickerGrid.innerHTML = '<div class="empty-small">Пока нет стикерпаков. Создай свой в профиле.</div>';
      return;
    }
    e.stickerPackTabs.innerHTML = state.stickerPacks.map((pack) => `<button class="sticker-pack-tab${pack.id === state.activeStickerPackId ? " active" : ""}" type="button" data-sticker-pack="${pack.id}">${esc(pack.title)}</button>`).join("");
    const pack = state.stickerPacks.find((item) => item.id === state.activeStickerPackId) || state.stickerPacks[0];
    e.stickerGrid.innerHTML = pack?.stickers?.length
      ? pack.stickers.map((sticker) => `<button class="sticker-send" type="button" data-sticker-id="${sticker.id}" data-sticker-url="${esc(sticker.image_url)}"><img src="${esc(sticker.image_url)}" alt="Стикер"></button>`).join("")
      : '<div class="empty-small">В этом наборе пока нет стикеров</div>';
  }

  function renderMyStickerPacks() {
    if (!e.myStickerPacks) return;
    const mine = state.stickerPacks.filter((pack) => pack.is_mine);
    e.myStickerPacks.innerHTML = mine.length
      ? mine.map((pack) => `<div class="my-pack-row">${pack.stickers?.[0] ? `<img class="my-pack-cover" src="${esc(pack.stickers[0].image_url)}" alt="">` : '<div class="my-pack-cover"></div>'}<div class="my-pack-info"><b>${esc(pack.title)}</b><span>${pack.stickers?.length || 0} стикеров</span></div><button class="pack-delete" type="button" data-archive-pack="${pack.id}">Удалить</button></div>`).join("")
      : '<div class="empty-small">Пока нет своих наборов</div>';
  }

  function openProfile() {
    state.selectedAvatarData = "";
    e.profileUsername.value = state.user.username;
    e.profileBio.value = state.user.bio || "";
    e.profileTheme.value = state.user.theme || "pink";
    setAvatar(e.profileAvatarPreview, state.user);
    renderMyStickerPacks();
    e.profileDialog.showModal();
    updateNotificationUI();
  }

  function b64ToU8(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(normalized);
    return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
  }

  function isStandalone() {
    return matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  async function updateNotificationUI() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      e.notificationStatus.textContent = "Не поддерживаются этим браузером";
      e.notificationBtn.disabled = true;
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === "granted") {
      e.notificationStatus.textContent = "Включены";
      e.notificationBtn.innerHTML = `${svg("check")}Включены`;
      e.notificationBtn.disabled = true;
    } else {
      e.notificationStatus.textContent = Notification.permission === "denied" ? "Запрещены в настройках" : "Выключены";
      e.notificationBtn.innerHTML = `${svg("bell")}Включить`;
      e.notificationBtn.disabled = Notification.permission === "denied";
    }
  }

  async function enablePush() {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandalone()) throw new Error("На iPhone сначала добавь PinkSasha на экран «Домой» и открой с иконки.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) throw new Error("Этот браузер не поддерживает уведомления.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Разрешение на уведомления не выдано.");
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(cfg.vapidPublicKey) });
    await api("save_push_subscription", { token: state.token, subscription: subscription.toJSON(), user_agent: navigator.userAgent });
    await updateNotificationUI();
    toast("Уведомления включены");
  }

  function openStory(index) {
    if (!state.stories.length) return;
    state.storyIndex = (index + state.stories.length) % state.stories.length;
    const story = state.stories[state.storyIndex];
    setAvatar(e.storyViewerAvatar, story.user);
    e.storyViewerName.textContent = story.user_id === state.user.id ? "Моя история" : story.user.username;
    e.storyViewerTime.textContent = ago(story.created_at);
    e.storyViewerImage.src = story.image_url;
    e.storyViewerCaption.textContent = story.caption || "";
    e.deleteStoryBtn.classList.toggle("hidden", story.user_id !== state.user.id);
    e.storyViewsBtn.classList.toggle("hidden", story.user_id !== state.user.id);
    e.storyViewsBtn.innerHTML = `${svg("eye")} ${story.views_count || 0}`;
    e.storyViewerDialog.showModal();
    api("view_story", { token: state.token, story_id: story.id }).then(loadStories).catch(console.warn);
    clearTimeout(state.storyTimer);
    e.storyProgressBar.style.transition = "none";
    e.storyProgressBar.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      e.storyProgressBar.style.transition = "width 7s linear";
      e.storyProgressBar.style.width = "100%";
    }));
    state.storyTimer = setTimeout(() => openStory(state.storyIndex + 1), 7000);
  }

  function closeStory() {
    clearTimeout(state.storyTimer);
    e.storyViewerDialog.close();
  }

  async function loadAdmin() {
    const data = await api("admin_overview", { token: state.token });
    state.adminData = data;
    renderAdmin();
  }

  function renderAdmin() {
    const data = state.adminData;
    if (!data) return;
    e.adminStats.innerHTML = `<div class="admin-stat"><b>${data.stats.users}</b><span>пользователей</span></div><div class="admin-stat"><b>${data.stats.chats}</b><span>чатов</span></div><div class="admin-stat"><b>${data.stats.messages}</b><span>сообщений</span></div>`;
    e.adminUserList.innerHTML = data.users.length
      ? data.users.map((user) => `<div class="admin-row"><div class="avatar">${avatarHTML(user)}</div><div class="admin-row-main"><div class="admin-row-title">${esc(user.username)}${user.role === "admin" ? '<span class="admin-role">admin</span>' : ""}</div><div class="admin-row-meta">Создан ${new Date(user.created_at).toLocaleDateString("ru")}</div></div>${user.id !== state.user.id ? `<div class="admin-row-actions"><button class="admin-love" type="button" data-admin-love-user="${user.id}">${svg("heart")}Любовь</button><button class="admin-delete" type="button" data-admin-delete-user="${user.id}">Удалить</button></div>` : '<span class="admin-self">это вы</span>'}</div>`).join("")
      : '<div class="empty-small">Нет пользователей</div>';
    e.adminChatList.innerHTML = data.chats.length
      ? data.chats.map((chat) => `<div class="admin-row"><div class="admin-row-main"><div class="admin-row-title">${esc(chat.participants.join(" — ") || "Чат без участников")}</div><div class="admin-row-meta">${chat.message_count} сообщений · ${new Date(chat.created_at).toLocaleDateString("ru")}</div></div><button class="admin-delete" type="button" data-admin-delete-chat="${chat.id}">Удалить чат</button></div>`).join("")
      : '<div class="empty-small">Нет чатов</div>';
  }

  async function openAdmin() {
    if (state.user?.role !== "admin") return toast("Нет доступа");
    e.adminDialog.showModal();
    e.adminStats.innerHTML = '<div class="empty-small">Загрузка…</div>';
    e.adminUserList.innerHTML = "";
    e.adminChatList.innerHTML = "";
    try { await loadAdmin(); } catch (error) { toast(error.message); e.adminDialog.close(); }
  }

  async function announceActivity(activity = "") {
    if (!state.activeConversation) return;
    try {
      await api("set_activity", { token: state.token, conversation_id: state.activeConversation.id, activity });
    } catch (error) {
      console.warn(error);
    }
  }

  function scheduleTyping() {
    autoGrowComposer();
    clearTimeout(state.typingTimer);
    if (!e.messageInput.value.trim() || !state.activeConversation) {
      announceActivity("");
      return;
    }
    const now = Date.now();
    if (now - state.typingLastSent > 900) {
      state.typingLastSent = now;
      announceActivity("typing");
    }
    state.typingTimer = setTimeout(() => announceActivity(""), 3400);
  }

  function bestMime(kind) {
    const candidates = kind === "voice"
      ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      : ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];
    return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
  }

  function recordingTime() {
    return Math.max(0, Math.floor((Date.now() - state.recordingStartedAt) / 1000));
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const rest = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  async function startRecording(kind) {
    if (!state.activeConversation) return toast("Сначала открой чат.");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Запись не поддерживается этим устройством.");
    if (state.recorder) return;
    try {
      const constraints = kind === "voice"
        ? { audio: true }
        : { audio: true, video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mimeType = bestMime(kind);
      const recorderOptions = kind === "voice" ? { audioBitsPerSecond: 64000 } : { videoBitsPerSecond: 650000, audioBitsPerSecond: 64000 };
      if (mimeType) recorderOptions.mimeType = mimeType;
      const recorder = new MediaRecorder(stream, recorderOptions);
      state.recorder = recorder;
      state.mediaStream = stream;
      state.recordingChunks = [];
      state.recordingKind = kind;
      state.recordingStartedAt = Date.now();
      state.recordingShouldSend = true;
      recorder.ondataavailable = (event) => { if (event.data?.size) state.recordingChunks.push(event.data); };
      recorder.onstop = handleRecordingStopped;
      recorder.start(250);
      if (kind === "voice") {
        e.recordingLabel.textContent = "Запись голоса";
        e.recordingBar.classList.remove("hidden");
        announceActivity("recording_voice");
      } else {
        e.videoCapturePreview.srcObject = stream;
        e.videoCaptureOverlay.classList.remove("hidden");
        announceActivity("recording_video");
      }
      e.attachmentPanel.classList.add("hidden");
      const limit = kind === "voice" ? 120 : 30;
      clearInterval(state.recordingActivityTimer);
      state.recordingActivityTimer = setInterval(() => {
        if (state.recordingKind) announceActivity(state.recordingKind === "voice" ? "recording_voice" : "recording_video");
      }, 2800);
      state.recordingInterval = setInterval(() => {
        const seconds = recordingTime();
        e.recordingTimer.textContent = formatDuration(seconds);
        e.videoRecordingTimer.textContent = formatDuration(seconds);
        if (seconds >= limit) finishRecording(true);
      }, 250);
    } catch (error) {
      stopMediaTracks();
      toast(error.name === "NotAllowedError" ? "Разреши доступ к микрофону и камере." : error.message);
    }
  }

  function stopMediaTracks() {
    state.mediaStream?.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
    if (e.videoCapturePreview) e.videoCapturePreview.srcObject = null;
  }

  function finishRecording(send) {
    if (!state.recorder) return;
    state.recordingShouldSend = send;
    if (state.recorder.state !== "inactive") state.recorder.stop();
  }

  async function handleRecordingStopped() {
    const kind = state.recordingKind;
    const shouldSend = state.recordingShouldSend;
    const seconds = Math.max(1, recordingTime());
    const rawType = state.recorder?.mimeType || (kind === "voice" ? "audio/webm" : "video/webm");
    const simpleType = rawType.split(";")[0];
    const blob = new Blob(state.recordingChunks, { type: simpleType });
    clearInterval(state.recordingInterval);
    clearInterval(state.recordingActivityTimer);
    state.recordingInterval = null;
    state.recordingActivityTimer = null;
    state.recorder = null;
    state.recordingChunks = [];
    state.recordingKind = "";
    e.recordingBar.classList.add("hidden");
    e.videoCaptureOverlay.classList.add("hidden");
    e.recordingTimer.textContent = "00:00";
    e.videoRecordingTimer.textContent = "00:00";
    stopMediaTracks();
    announceActivity("");
    if (!shouldSend || blob.size < 700) return;
    try {
      toast(kind === "voice" ? "Отправляем голосовое…" : "Отправляем видеокружок…");
      const dataUrl = await fileToDataUrl(blob);
      const localUrl = URL.createObjectURL(blob);
      await sendOptimistic(
        { kind, media_data_url: dataUrl, duration: seconds },
        kind === "voice"
          ? { _local_audio: localUrl, audio_duration: seconds }
          : { _local_video: localUrl, video_duration: seconds },
      );
    } catch (error) {
      toast(error.message);
    }
  }

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  async function openCalendar() {
    if (!state.activeConversation) return;
    const today = new Date();
    state.calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    state.calendarSelectedDate = localDateKey(today);
    e.calendarDialog.showModal();
    await loadCalendarMonth();
  }

  async function loadCalendarMonth() {
    if (!state.activeConversation) return;
    e.calendarGrid.innerHTML = '<div class="empty-small">Загрузка…</div>';
    const data = await api("calendar_month", {
      token: state.token,
      conversation_id: state.activeConversation.id,
      month: monthKey(state.calendarCursor),
    });
    state.calendarEvents = data.events || [];
    renderCalendar();
  }

  function renderCalendar() {
    const year = state.calendarCursor.getFullYear();
    const month = state.calendarCursor.getMonth();
    e.calendarTitle.textContent = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric" }).format(state.calendarCursor);
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - offset);
    const today = localDateKey(new Date());
    const cells = [];
    for (let index = 0; index < 42; index++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = localDateKey(date);
      const events = state.calendarEvents.filter((event) => event.event_date === key);
      cells.push(`<button class="calendar-day${date.getMonth() !== month ? " outside" : ""}${key === today ? " today" : ""}${key === state.calendarSelectedDate ? " selected" : ""}" type="button" data-calendar-date="${key}"><span class="day-number">${date.getDate()}</span><span class="calendar-day-events">${events.slice(0, 3).map((event) => `<span class="calendar-event-chip ${event.level}">${esc(event.title)}</span>`).join("")}</span></button>`);
    }
    e.calendarGrid.innerHTML = cells.join("");
    renderCalendarDetails();
  }

  function renderCalendarDetails() {
    const selected = state.calendarSelectedDate;
    if (!selected) {
      e.selectedCalendarDate.textContent = "Выбери дату";
      e.calendarEvents.innerHTML = "";
      return;
    }
    const date = new Date(`${selected}T12:00:00`);
    e.selectedCalendarDate.textContent = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric" }).format(date);
    const events = state.calendarEvents.filter((event) => event.event_date === selected);
    e.calendarEvents.innerHTML = events.length
      ? events.map((event) => `<div class="calendar-event-card ${event.level}"><b>${esc(event.title)}</b>${event.note ? `<span>${esc(event.note)}</span>` : ""}<span>${event.creator?.username ? `Добавил(а): ${esc(event.creator.username)}` : ""}</span><button class="calendar-event-delete" type="button" data-delete-calendar-event="${event.id}" aria-label="Удалить">${svg("trash")}</button></div>`).join("")
      : '<div class="empty-small">На этот день ничего не запланировано</div>';
  }

  async function openGallery() {
    if (!state.activeConversation) return;
    e.galleryTitle.textContent = `Фото: ${state.activeConversation.other_user.username}`;
    e.chatGalleryGrid.innerHTML = '<div class="empty-small">Загрузка…</div>';
    e.chatGalleryDialog.showModal();
    try {
      const data = await api("chat_gallery", { token: state.token, conversation_id: state.activeConversation.id });
      state.galleryPhotos = data.photos || [];
      e.chatGalleryGrid.innerHTML = state.galleryPhotos.length
        ? state.galleryPhotos.map((photo) => `<button class="gallery-photo" type="button" data-gallery-image="${esc(photo.image_url)}"><img src="${esc(photo.image_url)}" alt=""><span>${new Date(photo.created_at).toLocaleDateString("ru")}</span></button>`).join("")
        : '<div class="empty-small">В этом чате пока нет фотографий</div>';
    } catch (error) {
      e.chatGalleryGrid.innerHTML = `<div class="empty-small">${esc(error.message)}</div>`;
    }
  }

  function jumpToMessage(id) {
    const bubble = e.messageList.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);
    if (!bubble) return toast("Это сообщение находится слишком далеко в истории.");
    bubble.scrollIntoView({ behavior: "smooth", block: "center" });
    bubble.classList.add("message-flash");
    setTimeout(() => bubble.classList.remove("message-flash"), 1400);
  }

  function selectMessage(id) {
    const message = state.messages.find((item) => item.id === id);
    if (!message || message.deleted_at || message._pending || message._failed) return;
    state.selectedMessage = message;
    const mine = message.sender_id === state.user.id;
    const editable = mine && ["text", "image"].includes(message.kind || (message.image_url ? "image" : "text"));
    e.editMessageBtn.classList.toggle("hidden", !editable);
    e.deleteMessageBtn.classList.toggle("hidden", !mine);
    const pinLabel = e.pinMessageBtn.querySelector("span");
    if (pinLabel) pinLabel.textContent = state.pinnedMessage?.id === message.id ? "Открепить" : "Закрепить";
    e.messageMenuDialog.showModal();
  }

  e.loginTab.onclick = () => setMode("login");
  e.registerTab.onclick = () => setMode("register");

  e.authForm.onsubmit = async (event) => {
    event.preventDefault();
    const username = clean(e.authUsername.value);
    const password = e.authPassword.value;
    if (username.length < 3) return authStatus("Имя должно содержать минимум 3 символа.", true);
    if (password.length < 6) return authStatus("Пароль должен содержать минимум 6 символов.", true);
    e.authSubmit.disabled = true;
    authStatus("Подключаемся…");
    try {
      const data = await api(state.mode, { username, password });
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, state.token);
      e.authPassword.value = "";
      authStatus("");
      await showApp(data.user);
    } catch (error) {
      authStatus(error.message, true);
    } finally {
      e.authSubmit.disabled = false;
    }
  };

  e.logoutBtn.onclick = async () => {
    try { if (state.token) await api("logout", { token: state.token }); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    state.token = "";
    showAuth();
  };

  e.adminBtn.onclick = openAdmin;
  e.closeAdminBtn.onclick = () => e.adminDialog.close();
  e.adminRefreshBtn.onclick = () => loadAdmin().catch((error) => toast(error.message));
  e.adminUserList.onclick = async (event) => {
    const loveButton = event.target.closest("[data-admin-love-user]");
    if (loveButton) {
      const user = state.adminData?.users.find((item) => item.id === loveButton.dataset.adminLoveUser);
      if (!user) return;
      loveButton.disabled = true;
      try {
        await api("admin_send_love", { token: state.token, target_user_id: user.id });
        toast(`Сообщение отправлено пользователю ${user.username}`);
      } catch (error) { toast(error.message); }
      finally { loveButton.disabled = false; }
      return;
    }
    const button = event.target.closest("[data-admin-delete-user]");
    if (!button) return;
    const user = state.adminData?.users.find((item) => item.id === button.dataset.adminDeleteUser);
    if (!user || !confirm(`Удалить пользователя «${user.username}» вместе со всеми его чатами, сообщениями, фото и сторис?`)) return;
    button.disabled = true;
    try {
      await api("admin_delete_user", { token: state.token, target_user_id: user.id });
      await Promise.all([loadAdmin(), refreshAll()]);
      toast("Пользователь удалён навсегда");
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };

  e.adminChatList.onclick = async (event) => {
    const button = event.target.closest("[data-admin-delete-chat]");
    if (!button) return;
    const chat = state.adminData?.chats.find((item) => item.id === button.dataset.adminDeleteChat);
    if (!chat || !confirm(`Удалить чат «${chat.participants.join(" — ") || "без участников"}» и все сообщения?`)) return;
    button.disabled = true;
    try {
      await api("admin_delete_chat", { token: state.token, conversation_id: chat.id });
      if (state.activeConversation?.id === chat.id) {
        state.activeConversation = null;
        state.messages = [];
        e.activeChat.classList.add("hidden");
        e.emptyChat.classList.remove("hidden");
        e.appScreen.classList.remove("chat-open");
      }
      await Promise.all([loadAdmin(), refreshAll()]);
      toast("Чат удалён навсегда");
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };

  e.profileBtn.onclick = openProfile;
  e.closeProfileBtn.onclick = () => e.profileDialog.close();
  e.chooseAvatarBtn.onclick = () => e.avatarInput.click();
  e.avatarInput.onchange = async () => {
    const file = e.avatarInput.files?.[0];
    if (!file) return;
    try {
      state.selectedAvatarData = await compress(file, 700, .84);
      e.profileAvatarPreview.innerHTML = `<img src="${state.selectedAvatarData}" alt="">`;
    } catch (error) { toast(error.message); }
  };
  e.profileTheme.onchange = () => applyTheme(e.profileTheme.value);
  e.notificationBtn.onclick = () => enablePush().catch((error) => toast(error.message));
  e.saveProfileBtn.onclick = async () => {
    const username = clean(e.profileUsername.value);
    if (username.length < 3) return toast("Имя должно содержать минимум 3 символа.");
    e.saveProfileBtn.disabled = true;
    try {
      const data = await api("update_profile", {
        token: state.token,
        username,
        bio: e.profileBio.value.trim(),
        theme: e.profileTheme.value,
        avatar_data_url: state.selectedAvatarData || undefined,
      });
      state.user = data.user;
      profileUI();
      e.profileDialog.close();
      await refreshAll();
      toast("Профиль сохранён");
    } catch (error) { toast(error.message); }
    finally { e.saveProfileBtn.disabled = false; }
  };

  e.newStickerPackBtn.onclick = () => {
    state.stickerFiles = [];
    e.stickerPackTitle.value = "";
    e.stickerFilesInput.value = "";
    e.stickerCreatePreview.innerHTML = "";
    e.stickerUploadStatus.textContent = "";
    e.stickerPackDialog.showModal();
  };
  e.closeStickerPackBtn.onclick = () => e.stickerPackDialog.close();
  e.chooseStickersBtn.onclick = () => e.stickerFilesInput.click();
  e.stickerFilesInput.onchange = () => {
    state.stickerFiles = [...(e.stickerFilesInput.files || [])].slice(0, 30);
    e.stickerCreatePreview.innerHTML = state.stickerFiles.map((file) => `<img src="${URL.createObjectURL(file)}" alt="">`).join("");
  };
  e.createStickerPackBtn.onclick = async () => {
    const title = e.stickerPackTitle.value.trim();
    if (!title) return toast("Введи название стикерпака.");
    if (!state.stickerFiles.length) return toast("Выбери хотя бы один стикер.");
    e.createStickerPackBtn.disabled = true;
    try {
      const created = await api("create_sticker_pack", { token: state.token, title });
      for (let index = 0; index < state.stickerFiles.length; index++) {
        e.stickerUploadStatus.textContent = `Загружаем ${index + 1} из ${state.stickerFiles.length}…`;
        const dataUrl = await compress(state.stickerFiles[index], 512, .9, true);
        await api("add_sticker", { token: state.token, pack_id: created.pack.id, image_data_url: dataUrl });
      }
      await loadStickerPacks();
      e.stickerPackDialog.close();
      toast("Стикерпак создан");
    } catch (error) { toast(error.message); }
    finally { e.createStickerPackBtn.disabled = false; e.stickerUploadStatus.textContent = ""; }
  };
  e.myStickerPacks.onclick = async (event) => {
    const button = event.target.closest("[data-archive-pack]");
    if (!button) return;
    const pack = state.stickerPacks.find((item) => item.id === button.dataset.archivePack);
    if (!pack || !confirm(`Удалить стикерпак «${pack.title}» из списка? Уже отправленные стикеры останутся в чатах.`)) return;
    try {
      await api("archive_sticker_pack", { token: state.token, pack_id: pack.id });
      await loadStickerPacks();
      toast("Стикерпак удалён");
    } catch (error) { toast(error.message); }
  };

  e.newChatBtn.onclick = async () => {
    try { await loadUsers(); e.newChatDialog.showModal(); e.userSearch.focus(); }
    catch (error) { toast(error.message); }
  };
  e.refreshBtn.onclick = () => refreshAll().then(() => toast("Обновлено")).catch((error) => toast(error.message));
  e.userSearch.oninput = renderUsers;
  e.userList.onclick = async (event) => {
    const button = event.target.closest("[data-user-id]");
    if (!button) return;
    button.disabled = true;
    try {
      const data = await api("start_chat", { token: state.token, target_user_id: button.dataset.userId });
      e.newChatDialog.close();
      await loadConversations();
      await openConversation(data.conversation_id);
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  };

  e.conversationList.onclick = (event) => {
    const button = event.target.closest("[data-conversation-id]");
    if (button) openConversation(button.dataset.conversationId).catch((error) => toast(error.message));
  };
  e.chatSearch.oninput = renderConversations;
  e.railChatsBtn.onclick = () => { e.appScreen.classList.remove("chat-open"); history.replaceState(null, "", location.pathname); };
  e.railStoriesBtn.onclick = () => e.storyList?.scrollIntoView({ behavior: "smooth", block: "center" });
  e.railNewChatBtn.onclick = () => e.newChatBtn.click();
  e.railCalendarBtn.onclick = () => state.activeConversation ? e.calendarBtn.click() : toast("Сначала откройте чат");
  e.emptyNewChatBtn.onclick = () => e.newChatBtn.click();
  e.chatGalleryBtn.onclick = () => openGallery();
  e.contactGalleryBtn.onclick = () => openGallery();
  e.contactAllMediaBtn.onclick = () => openGallery();
  e.contactCalendarBtn.onclick = () => e.calendarBtn.click();
  e.contactWallpaperBtn.onclick = () => e.chatSettingsBtn.click();
  e.contactPinnedBtn.onclick = () => { if (state.pinnedMessage) jumpToMessage(state.pinnedMessage.id); else toast("В чате нет закреплённого сообщения"); };
  e.contactMediaPreview.onclick = (event) => {
    const button = event.target.closest("[data-contact-image]");
    if (!button) return;
    e.imageDialogPhoto.src = button.dataset.contactImage;
    e.imageDialog.showModal();
  };
  e.backBtn.onclick = () => {
    e.appScreen.classList.remove("chat-open");
    history.replaceState(null, "", location.pathname);
  };

  e.emojiPanel.innerHTML = EMOJIS.map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join("");
  e.attachBtn.onclick = () => {
    e.attachmentPanel.classList.toggle("hidden");
    e.emojiPanel.classList.add("hidden");
    e.stickerPanel.classList.add("hidden");
  };
  e.emojiBtn.onclick = () => {
    e.emojiPanel.classList.toggle("hidden");
    e.attachmentPanel.classList.add("hidden");
    e.stickerPanel.classList.add("hidden");
  };
  e.stickerBtn.onclick = () => {
    e.stickerPanel.classList.toggle("hidden");
    e.attachmentPanel.classList.add("hidden");
    e.emojiPanel.classList.add("hidden");
    loadStickerPacks().catch((error) => toast(error.message));
  };
  e.emojiPanel.onclick = (event) => {
    const button = event.target.closest("[data-emoji]");
    if (!button) return;
    const start = e.messageInput.selectionStart;
    const end = e.messageInput.selectionEnd;
    e.messageInput.setRangeText(button.dataset.emoji, start, end, "end");
    e.messageInput.focus();
    scheduleTyping();
  };
  e.stickerPackTabs.onclick = (event) => {
    const button = event.target.closest("[data-sticker-pack]");
    if (!button) return;
    state.activeStickerPackId = button.dataset.stickerPack;
    renderStickerPanel();
  };
  e.stickerGrid.onclick = async (event) => {
    const button = event.target.closest("[data-sticker-id]");
    if (!button || !state.activeConversation) return;
    e.stickerPanel.classList.add("hidden");
    await sendOptimistic(
      { kind: "sticker", sticker_id: button.dataset.stickerId },
      { _local_sticker: button.dataset.stickerUrl, sticker_id: button.dataset.stickerId },
    );
  };

  e.photoBtn.onclick = () => e.photoInput.click();
  e.photoInput.onchange = async () => {
    const file = e.photoInput.files?.[0];
    if (!file) return;
    try {
      toast("Готовим фотографию…");
      state.selectedPhotoData = await compress(file, 1400, .82);
      e.mediaPreviewImage.src = state.selectedPhotoData;
      e.mediaPreview.classList.remove("hidden");
      e.attachmentPanel.classList.add("hidden");
    } catch (error) { clearPhoto(); toast(error.message); }
  };
  e.removeMediaBtn.onclick = clearPhoto;
  e.voiceBtn.onclick = () => startRecording("voice");
  e.videoBtn.onclick = () => startRecording("video");
  e.cancelRecordingBtn.onclick = () => finishRecording(false);
  e.stopRecordingBtn.onclick = () => finishRecording(true);
  e.cancelVideoRecordingBtn.onclick = () => finishRecording(false);
  e.stopVideoRecordingBtn.onclick = () => finishRecording(true);

  e.messageForm.onsubmit = async (event) => {
    event.preventDefault();
    const text = e.messageInput.value.trim();
    if ((!text && !state.selectedPhotoData) || !state.activeConversation) return;
    const photo = state.selectedPhotoData;
    e.messageInput.value = "";
    autoGrowComposer();
    clearPhoto();
    announceActivity("");
    await sendOptimistic(
      { kind: photo ? "image" : "text", body: text, image_data_url: photo || undefined },
      photo ? { _local_image: photo } : {},
    );
    e.messageInput.focus({ preventScroll: true });
    setTimeout(() => scrollToBottom(true), 50);
  };

  e.messageInput.onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      e.messageForm.requestSubmit();
    }
  };
  e.messageInput.oninput = scheduleTyping;
  e.messageInput.onfocus = () => {
    state.keepBottom = true;
    setTimeout(() => scrollToBottom(true), 80);
    setTimeout(() => scrollToBottom(true), 320);
  };
  e.messageInput.onblur = () => announceActivity("");
  e.messageList.onscroll = () => {
    state.keepBottom = nearBottom();
    e.scrollBottomBtn.classList.toggle("hidden", state.keepBottom);
  };
  e.scrollBottomBtn.onclick = () => { state.keepBottom = true; scrollToBottom(true); };
  const sendButton = e.messageForm.querySelector(".send-btn");
  sendButton.onpointerdown = (event) => { event.preventDefault(); e.messageForm.requestSubmit(); };
  sendButton.onclick = (event) => event.preventDefault();
  e.messageList.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".bubble") && !event.target.closest(".scroll-bottom-btn")) {
      e.messageInput.blur();
      e.emojiPanel.classList.add("hidden");
      e.stickerPanel.classList.add("hidden");
      e.attachmentPanel.classList.add("hidden");
    }
  });

  e.chatSettingsBtn.onclick = () => {
    if (!state.activeConversation) return;
    const preset = e.activeChat.dataset.wallpaper || "rose";
    e.wallpaperGrid.querySelectorAll("[data-wallpaper]").forEach((button) => button.classList.toggle("active", button.dataset.wallpaper === preset));
    e.wallpaperStatus.textContent = "";
    e.chatBackgroundDialog.showModal();
  };
  e.closeChatBackgroundBtn.onclick = () => e.chatBackgroundDialog.close();
  e.wallpaperGrid.onclick = async (event) => {
    const button = event.target.closest("[data-wallpaper]");
    if (!button) return;
    e.wallpaperGrid.querySelectorAll("button").forEach((item) => { item.disabled = true; });
    try {
      await saveChatBackground(button.dataset.wallpaper);
      e.wallpaperGrid.querySelectorAll("[data-wallpaper]").forEach((item) => item.classList.toggle("active", item === button));
    } catch (error) { toast(error.message); }
    finally { e.wallpaperGrid.querySelectorAll("button").forEach((item) => { item.disabled = false; }); }
  };
  e.chooseChatWallpaperBtn.onclick = () => e.chatWallpaperInput.click();
  e.chatWallpaperInput.onchange = async () => {
    const file = e.chatWallpaperInput.files?.[0];
    if (!file) return;
    e.chooseChatWallpaperBtn.disabled = true;
    e.wallpaperStatus.textContent = "Готовим и загружаем фотографию…";
    try {
      const data = await compress(file, 1800, .8);
      await saveChatBackground("photo", data);
      e.chatBackgroundDialog.close();
      toast("Общий фон чата изменён");
    } catch (error) { toast(error.message); e.wallpaperStatus.textContent = ""; }
    finally { e.chooseChatWallpaperBtn.disabled = false; e.chatWallpaperInput.value = ""; }
  };
  e.loveOverlay.onclick = () => e.loveOverlay.classList.add("hidden");

  e.messageList.onclick = (event) => {
    const menuButton = event.target.closest("[data-message-menu]");
    if (menuButton) {
      event.stopPropagation();
      selectMessage(menuButton.dataset.messageMenu);
      return;
    }
    const jump = event.target.closest("[data-jump-message]");
    if (jump) { jumpToMessage(jump.dataset.jumpMessage); return; }
    const image = event.target.closest("[data-full-image]");
    if (image) {
      e.imageDialogPhoto.src = image.dataset.fullImage;
      e.imageDialog.showModal();
    }
  };
  e.messageList.oncontextmenu = (event) => {
    const bubble = event.target.closest("[data-message-id]");
    if (!bubble) return;
    event.preventDefault();
    selectMessage(bubble.dataset.messageId);
  };
  e.replyMessageBtn.onclick = () => {
    if (!state.selectedMessage) return;
    e.messageMenuDialog.close();
    setReply(state.selectedMessage);
  };
  e.pinMessageBtn.onclick = async () => {
    if (!state.selectedMessage || !state.activeConversation) return;
    const unpin = state.pinnedMessage?.id === state.selectedMessage.id;
    try {
      const data = await api("pin_message", {
        token: state.token,
        conversation_id: state.activeConversation.id,
        message_id: unpin ? null : state.selectedMessage.id,
      });
      e.messageMenuDialog.close();
      updatePinnedBanner({ pinned_message: data.pinned_message || null });
      toast(unpin ? "Сообщение откреплено" : "Сообщение закреплено");
    } catch (error) { toast(error.message); }
  };
  e.pinnedBanner.onclick = (event) => {
    if (event.target.closest("#unpinBtn")) return;
    if (state.pinnedMessage) jumpToMessage(state.pinnedMessage.id);
  };
  e.unpinBtn.onclick = async (event) => {
    event.stopPropagation();
    if (!state.activeConversation) return;
    try {
      await api("pin_message", { token: state.token, conversation_id: state.activeConversation.id, message_id: null });
      updatePinnedBanner({ pinned_message: null });
      toast("Сообщение откреплено");
    } catch (error) { toast(error.message); }
  };
  e.cancelReplyBtn.onclick = clearReply;
  e.editMessageBtn.onclick = () => {
    if (!state.selectedMessage) return;
    e.messageMenuDialog.close();
    e.editMessageInput.value = state.selectedMessage.body || "";
    e.editMessageDialog.showModal();
    e.editMessageInput.focus();
  };
  e.saveEditedMessageBtn.onclick = async () => {
    if (!state.selectedMessage) return;
    const body = e.editMessageInput.value.trim();
    if (!body && !state.selectedMessage.image_url) return toast("Сообщение не может быть пустым.");
    try {
      await api("edit_message", { token: state.token, message_id: state.selectedMessage.id, body });
      e.editMessageDialog.close();
      await Promise.all([loadMessages(), loadConversations()]);
      toast("Сообщение изменено");
    } catch (error) { toast(error.message); }
  };
  e.cancelEditMessageBtn.onclick = () => e.editMessageDialog.close();
  e.deleteMessageBtn.onclick = async () => {
    if (!state.selectedMessage || !confirm("Удалить сообщение?")) return;
    try {
      await api("delete_message", { token: state.token, message_id: state.selectedMessage.id });
      e.messageMenuDialog.close();
      await Promise.all([loadMessages(), loadConversations()]);
      toast("Сообщение удалено");
    } catch (error) { toast(error.message); }
  };
  e.closeMessageMenuBtn.onclick = () => e.messageMenuDialog.close();
  e.closeImageDialogBtn.onclick = () => e.imageDialog.close();
  e.imageDialog.onclick = (event) => { if (event.target === e.imageDialog) e.imageDialog.close(); };

  e.calendarBtn.onclick = () => openCalendar().catch((error) => toast(error.message));
  e.calendarCloseBtn.onclick = () => e.calendarDialog.close();
  e.calendarPrevBtn.onclick = async () => {
    state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() - 1, 1);
    await loadCalendarMonth().catch((error) => toast(error.message));
  };
  e.calendarNextBtn.onclick = async () => {
    state.calendarCursor = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth() + 1, 1);
    await loadCalendarMonth().catch((error) => toast(error.message));
  };
  e.calendarTodayBtn.onclick = async () => {
    const today = new Date();
    state.calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    state.calendarSelectedDate = localDateKey(today);
    await loadCalendarMonth().catch((error) => toast(error.message));
  };
  e.calendarGrid.onclick = async (event) => {
    const button = event.target.closest("[data-calendar-date]");
    if (!button) return;
    state.calendarSelectedDate = button.dataset.calendarDate;
    const selected = new Date(`${state.calendarSelectedDate}T12:00:00`);
    if (selected.getMonth() !== state.calendarCursor.getMonth() || selected.getFullYear() !== state.calendarCursor.getFullYear()) {
      state.calendarCursor = new Date(selected.getFullYear(), selected.getMonth(), 1);
      await loadCalendarMonth().catch((error) => toast(error.message));
    } else renderCalendar();
  };
  e.calendarEventForm.onsubmit = async (event) => {
    event.preventDefault();
    if (!state.calendarSelectedDate || !state.activeConversation) return toast("Выбери дату.");
    const title = e.calendarEventTitle.value.trim();
    if (!title) return toast("Напиши, что будет в этот день.");
    const submit = e.calendarEventForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await api("add_calendar_event", {
        token: state.token,
        conversation_id: state.activeConversation.id,
        event_date: state.calendarSelectedDate,
        title,
        note: e.calendarEventNote.value.trim(),
        level: e.calendarEventLevel.value,
      });
      e.calendarEventTitle.value = "";
      e.calendarEventNote.value = "";
      await loadCalendarMonth();
      toast("Событие добавлено в общий календарь");
    } catch (error) { toast(error.message); }
    finally { submit.disabled = false; }
  };
  e.calendarEvents.onclick = async (event) => {
    const button = event.target.closest("[data-delete-calendar-event]");
    if (!button || !confirm("Удалить это событие из общего календаря?")) return;
    try {
      await api("delete_calendar_event", { token: state.token, event_id: button.dataset.deleteCalendarEvent });
      await loadCalendarMonth();
      toast("Событие удалено");
    } catch (error) { toast(error.message); }
  };

  e.chatAvatar.onclick = () => openGallery();
  e.closeGalleryBtn.onclick = () => e.chatGalleryDialog.close();
  e.chatGalleryGrid.onclick = (event) => {
    const button = event.target.closest("[data-gallery-image]");
    if (!button) return;
    e.imageDialogPhoto.src = button.dataset.galleryImage;
    e.imageDialog.showModal();
  };

  e.addStoryBtn.onclick = () => {
    state.selectedStoryData = "";
    e.storyPhotoInput.value = "";
    e.storyCaption.value = "";
    e.storyCreatePreview.classList.add("hidden");
    e.storyCreatePlaceholder.classList.remove("hidden");
    e.storyCreateDialog.showModal();
  };
  e.closeStoryCreateBtn.onclick = () => e.storyCreateDialog.close();
  e.chooseStoryPhotoBtn.onclick = () => e.storyPhotoInput.click();
  e.storyPhotoInput.onchange = async () => {
    const file = e.storyPhotoInput.files?.[0];
    if (!file) return;
    try {
      state.selectedStoryData = await compress(file, 1600, .84);
      e.storyCreatePreview.src = state.selectedStoryData;
      e.storyCreatePreview.classList.remove("hidden");
      e.storyCreatePlaceholder.classList.add("hidden");
    } catch (error) { toast(error.message); }
  };
  e.publishStoryBtn.onclick = async () => {
    if (!state.selectedStoryData) return toast("Выбери фотографию.");
    e.publishStoryBtn.disabled = true;
    try {
      await api("create_story", { token: state.token, image_data_url: state.selectedStoryData, caption: e.storyCaption.value.trim() });
      e.storyCreateDialog.close();
      await loadStories();
      toast("История опубликована");
    } catch (error) { toast(error.message); }
    finally { e.publishStoryBtn.disabled = false; }
  };
  e.storyList.onclick = (event) => {
    const button = event.target.closest("[data-story-index]");
    if (button) openStory(Number(button.dataset.storyIndex));
  };
  e.storyPrevBtn.onclick = () => openStory(state.storyIndex - 1);
  e.storyNextBtn.onclick = () => openStory(state.storyIndex + 1);
  e.closeStoryViewerBtn.onclick = closeStory;
  e.deleteStoryBtn.onclick = async () => {
    const story = state.stories[state.storyIndex];
    if (!story || !confirm("Удалить историю?")) return;
    try {
      await api("delete_story", { token: state.token, story_id: story.id });
      closeStory();
      await loadStories();
      toast("История удалена");
    } catch (error) { toast(error.message); }
  };
  e.storyViewsBtn.onclick = async () => {
    const story = state.stories[state.storyIndex];
    if (!story) return;
    try {
      const data = await api("story_viewers", { token: state.token, story_id: story.id });
      e.storyViewersList.innerHTML = data.viewers?.length
        ? data.viewers.map((viewer) => `<div class="user-card"><div class="avatar">${avatarHTML(viewer)}</div><strong>${esc(viewer.username)}</strong><span>${ago(viewer.viewed_at)}</span></div>`).join("")
        : '<div class="empty-small">Пока никто не посмотрел</div>';
      e.storyViewersDialog.showModal();
    } catch (error) { toast(error.message); }
  };
  e.closeStoryViewersBtn.onclick = () => e.storyViewersDialog.close();

  async function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || "pink");
    if (!cfg?.apiUrl || !cfg?.publishableKey) return authStatus("Не заполнен config.js.", true);
    if (!state.token) return showAuth();
    authStatus("Проверяем сессию…");
    try {
      const data = await api("session", { token: state.token });
      await showApp(data.user);
      const wanted = new URLSearchParams(location.search).get("chat");
      if (wanted) await openConversation(wanted);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      state.token = "";
      showAuth();
    }
  }

  syncViewport();
  window.addEventListener("resize", syncViewport, { passive: true });
  window.addEventListener("orientationchange", () => {
    setTimeout(syncViewport, 80);
    setTimeout(() => {
      if (state.activeConversation) scrollToBottom(true);
    }, 260);
  }, { passive: true });
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", syncViewport, { passive: true });
    visualViewport.addEventListener("scroll", syncViewport, { passive: true });
  }
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=8.2.0",{updateViaCache:"none"}).then(r=>r.update()).catch(console.warn));
  boot();
})();
