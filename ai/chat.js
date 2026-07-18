/* ---------------------------------------------------------
   API providers
   - "custom" providers are simple GET endpoints like the
     original watergpt worker (?q=<message>).
   - "groq" is an OpenAI-compatible chat-completions API
     (Groq-hosted Llama models). List as many keys as you
     want in GROQ_API_KEYS (10+ is fine) — they're tried in
     order as extra failover/rotation targets, e.g. if one
     key is rate-limited or slow.
   Order below = priority order. The first provider/key that
   responds in time wins; slow or failed ones are skipped
   automatically (see fetchWithFailover).

   ⚠️ SECURITY NOTE: this file runs in the browser, so any
   key placed here is visible to anyone who opens dev tools.
   Fine for a demo/prototype; for production, proxy Groq
   calls through your own backend so keys stay server-side.
--------------------------------------------------------- */
const GROQ_API_KEYS = [
  "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",
  // Add more Groq API keys here, e.g.:
  // "gsk_your_second_key_here",
  // "gsk_your_third_key_here",
];
const GROQ_MODEL = "llama-3.3-70b-versatile";

const API_PROVIDERS = [
  { type: "custom", url: "https://wormgpt.freeapihub.workers.dev/chat?q=" },
  // Add more plain GET-style fallback endpoints here, e.g.:
  // { type: "custom", url: "https://backup-api.example.com/chat?q=" },
  { type: "groq", keys: GROQ_API_KEYS, model: GROQ_MODEL },
];
const API_TIMEOUT_MS = 8000; // how long to wait before treating a provider/key as "slow" and shifting to the next one

const UPGRADE_PIN = "5594";
const DEMO_TRIAL_MS = 2 * 60 * 1000; // 2 minutes

/* ---------------------------------------------------------
   State
--------------------------------------------------------- */
let plan = localStorage.getItem("waterai_plan") || "free"; // 'free' | 'paid'
let planSource = localStorage.getItem("waterai_plan_source") || null; // 'pin' | 'demo' | null
let demoExpiresAt = parseInt(localStorage.getItem("waterai_demo_expires") || "0", 10);
let demoUsedDate = localStorage.getItem("waterai_demo_used_day") || null;
let chats = JSON.parse(localStorage.getItem("waterai_chats") || "null");
let activeChatId = localStorage.getItem("waterai_active_chat") || null;
let freeReplyCount = parseInt(localStorage.getItem("waterai_free_reply_count") || "0", 10);
let lastFailedMessage = null;
let pendingDeleteId = null;
let demoCountdownInterval = null;

if (!chats) {
  const firstChat = createChatObject("New chat");
  chats = [firstChat];
  activeChatId = firstChat.id;
}
if (!activeChatId || !chats.find((c) => c.id === activeChatId)) {
  activeChatId = chats[0] ? chats[0].id : null;
  if (!activeChatId) {
    const c = createChatObject("New chat");
    chats = [c];
    activeChatId = c.id;
  }
}

/* ---------------------------------------------------------
   Elements
--------------------------------------------------------- */
const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chat-form");
const inputEl = document.getElementById("chat-input");
const clearBtn = document.getElementById("clear-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const exportBtn = document.getElementById("export-btn");
const shortcutsBtn = document.getElementById("shortcuts-btn");
const chatTitleEl = document.getElementById("chat-title");
const chatListEl = document.getElementById("chat-list");
const chatSearchEl = document.getElementById("chat-search");
const paidSidebarBody = document.getElementById("paid-sidebar-body");
const freeSidebarBody = document.getElementById("free-sidebar-body");
const sidebarUpgradeBtn = document.getElementById("sidebar-upgrade-btn");
const accountStatusBtn = document.getElementById("account-status-btn");
const planBadge = document.getElementById("plan-badge");
const demoToggleBtn = document.getElementById("demo-toggle-btn");
const sidebarEl = document.getElementById("sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const modeBar = document.getElementById("mode-bar");
const modeMenuBtn = document.getElementById("mode-menu-btn");
const modeMenu = document.getElementById("mode-menu");
const toastEl = document.getElementById("toast");
const upgradeModal = document.getElementById("upgrade-modal");
const MODE_MENU_ICONS = { general: "💬", writing: "✍️", code: "⌘" };
const MODE_MENU_LABELS = { general: "General", writing: "Writing", code: "Code" };
const upgradeConfirmBtn = document.getElementById("upgrade-confirm-btn");
const shortcutsModal = document.getElementById("shortcuts-modal");
const confirmModal = document.getElementById("confirm-modal");
const confirmActionBtn = document.getElementById("confirm-action-btn");
const confirmTitle = document.getElementById("confirm-title");
const confirmBody = document.getElementById("confirm-body");

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */
function createChatObject(name) {
  return {
    id: "c" + Date.now() + Math.random().toString(36).slice(2, 7),
    name,
    mode: "general",
    createdAt: Date.now(),
    messages: [],
    demoOnly: plan === "paid" && planSource === "demo",
  };
}

function getActiveChat() {
  return chats.find((c) => c.id === activeChatId);
}

function saveChats() {
  localStorage.setItem("waterai_chats", JSON.stringify(chats));
  localStorage.setItem("waterai_active_chat", activeChatId);
}

function savePlan() {
  localStorage.setItem("waterai_plan", plan);
  if (planSource) localStorage.setItem("waterai_plan_source", planSource);
  else localStorage.removeItem("waterai_plan_source");
  localStorage.setItem("waterai_demo_expires", String(demoExpiresAt));
  if (demoUsedDate) {
    localStorage.setItem("waterai_demo_used_day", demoUsedDate);
  } else {
    localStorage.removeItem("waterai_demo_used_day");
  }
}

function saveFreeReplyCount() {
  localStorage.setItem("waterai_free_reply_count", String(freeReplyCount));
}

function isPaid() {
  return plan === "paid";
}

function uniqueName(base) {
  const names = new Set(chats.map((c) => c.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 1800);
}

function openModal(el) {
  el.classList.add("show");
}
function closeModal(el) {
  el.classList.remove("show");
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal(overlay);
  });
});

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/* ---------------------------------------------------------
   Dynamically injected modals: PIN entry + contact page
   (kept in JS only, reuses existing .modal-overlay/.modal CSS)
--------------------------------------------------------- */
function injectAuthModals() {
  const pinOverlay = document.createElement("div");
  pinOverlay.className = "modal-overlay";
  pinOverlay.id = "pin-modal";
  pinOverlay.innerHTML = `
    <div class="modal" style="max-width:380px;">
      <button class="modal-close" data-close="pin-modal">✕</button>
      <span class="eyebrow">Water AI Pro</span>
      <h2 style="font-size:20px;">Enter your upgrade PIN</h2>
      <p class="sub">Enter the 4-digit PIN to unlock Pro.</p>
      <input id="pin-input" type="password" inputmode="numeric" maxlength="4"
        placeholder="••••"
        style="width:100%; font-size:20px; letter-spacing:8px; text-align:center; padding:12px; border:1px solid var(--border); border-radius:8px; font-family:'JetBrains Mono',monospace; margin-bottom:16px;">
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="pin-modal">Cancel</button>
        <button class="btn btn-primary" id="pin-submit-btn">Unlock Pro</button>
      </div>
    </div>`;
  document.body.appendChild(pinOverlay);

  const contactOverlay = document.createElement("div");
  contactOverlay.className = "modal-overlay";
  contactOverlay.id = "contact-modal";
  contactOverlay.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <button class="modal-close" data-close="contact-modal">✕</button>
      <span class="eyebrow">Water AI Pro</span>
      <h2 style="font-size:20px;">That PIN wasn't right</h2>
      <p class="sub">We couldn't verify that PIN, so we couldn't unlock Pro on this account. Contact our team and we'll help you get access.</p>
      <p style="font-size:14px; margin-bottom:22px;">
        📧 <a href="mailto:support@waterai.app" style="color:var(--primary); font-weight:500;">support@waterai.app</a>
      </p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close="contact-modal">Close</button>
        <button class="btn btn-primary" id="contact-try-again-btn">Try another PIN</button>
      </div>
    </div>`;
  document.body.appendChild(contactOverlay);

  pinOverlay.querySelectorAll("[data-close]").forEach((btn) =>
    btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)))
  );
  contactOverlay.querySelectorAll("[data-close]").forEach((btn) =>
    btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)))
  );
  pinOverlay.addEventListener("click", (e) => { if (e.target === pinOverlay) closeModal(pinOverlay); });
  contactOverlay.addEventListener("click", (e) => { if (e.target === contactOverlay) closeModal(contactOverlay); });

  const pinInput = document.getElementById("pin-input");
  const pinSubmitBtn = document.getElementById("pin-submit-btn");

  function submitPin() {
    const val = pinInput.value.trim();
    if (val === UPGRADE_PIN) {
      plan = "paid";
      planSource = "pin";
      demoExpiresAt = 0;
      savePlan();
      stopDemoCountdown();
      renderPlanChrome();
      renderActiveChat();
      pinInput.value = "";
      closeModal(pinOverlay);
      showToast("Welcome to Water AI Pro 🎉");
    } else {
      pinInput.value = "";
      closeModal(pinOverlay);
      openModal(contactOverlay);
    }
  }

  pinSubmitBtn.addEventListener("click", submitPin);
  pinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPin();
  });

  document.getElementById("contact-try-again-btn").addEventListener("click", () => {
    closeModal(contactOverlay);
    document.getElementById("pin-input").value = "";
    openModal(pinOverlay);
    setTimeout(() => document.getElementById("pin-input").focus(), 50);
  });
}

function openPinModal() {
  const overlay = document.getElementById("pin-modal");
  openModal(overlay);
  const input = document.getElementById("pin-input");
  input.value = "";
  setTimeout(() => input.focus(), 50);
}

function openAccountHistoryModal() {
  let overlay = document.getElementById("account-history-modal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "account-history-modal";
    overlay.innerHTML = `
      <div class="modal" style="max-width:440px;">
        <button class="modal-close" data-close="account-history-modal">✕</button>
        <span class="eyebrow">Pro User</span>
        <h2 style="font-size:20px; margin-bottom:4px;">Account history</h2>
        <p class="sub">Your usage, saved chat counts, and quick cleanup tools.</p>
        <div class="account-history" id="account-history-content"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll("[data-close]").forEach((btn) =>
      btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)))
    );
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay); });
  }
  renderAccountHistory();
  openModal(overlay);
}

function renderAccountHistory() {
  const content = document.getElementById("account-history-content");
  if (!content) return;
  const chatCount = chats.length;
  const totalMessages = chats.reduce((sum, chat) => sum + chat.messages.length, 0);
  const createdAtValues = chats.map((c) => c.createdAt).filter(Boolean);
  const firstCreatedAt = createdAtValues.length ? Math.min(...createdAtValues) : Date.now();
  const historyDays = Math.max(1, Math.round((Date.now() - firstCreatedAt) / 86400000));

  content.innerHTML = `
    <div class="history-summary">
      <div class="history-card"><h4>Chats saved</h4><strong>${chatCount}</strong></div>
      <div class="history-card"><h4>Messages saved</h4><strong>${totalMessages}</strong></div>
      <div class="history-card"><h4>Days active</h4><strong>${historyDays}</strong></div>
    </div>
    <div class="history-list" id="history-list"></div>
  `;

  const historyList = document.getElementById("history-list");
  historyList.innerHTML = "";

  const sorted = [...chats].sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) {
    historyList.innerHTML = `<div class="history-item"><p class="history-item-title">No chat history yet.</p></div>`;
    return;
  }

  sorted.forEach((chat) => {
    const item = document.createElement("div");
    item.className = "history-item";
    const info = document.createElement("div");
    info.className = "history-item-info";
    const title = document.createElement("p");
    title.className = "history-item-title";
    title.textContent = chat.name;
    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    const messageCount = document.createElement("span");
    messageCount.textContent = `${chat.messages.length} msgs`;
    const created = document.createElement("span");
    created.textContent = new Date(chat.createdAt).toLocaleDateString();
    meta.append(messageCount, created);
    info.append(title, meta);
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-ghost";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      if (!confirm(`Delete chat ‘${chat.name}’? This removes the history item.`)) return;
      chats = chats.filter((c) => c.id !== chat.id);
      if (activeChatId === chat.id) activeChatId = chats[0] ? chats[0].id : null;
      saveChats();
      renderChatList(chatSearchEl.value);
      renderAccountHistory();
    });
    item.append(info, removeBtn);
    historyList.appendChild(item);
  });
}

/* ---------------------------------------------------------
   Demo trial (10 minute Pro preview) + cleanup
--------------------------------------------------------- */
function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function canStartDemoTrialToday() {
  return demoUsedDate !== getTodayDateKey();
}

function startDemoTrial() {
  if (!canStartDemoTrialToday()) {
    showToast("Demo is available once per day for 2 minutes.");
    return;
  }
  plan = "paid";
  planSource = "demo";
  demoExpiresAt = Date.now() + DEMO_TRIAL_MS;
  demoUsedDate = getTodayDateKey();
  savePlan();
  renderPlanChrome();
  renderActiveChat();
  startDemoCountdown();
  showToast("Demo: 2-minute Pro preview started");
}

function purgeDemoChats(silent) {
  const before = chats.length;
  chats = chats.filter((c) => !c.demoOnly);
  if (chats.length === 0) {
    chats.push(createChatObject("New chat"));
  }
  if (!chats.find((c) => c.id === activeChatId)) {
    activeChatId = chats[0].id;
  }
  saveChats();
  if (!silent && chats.length !== before) {
    showToast("Pro preview chats were removed");
  }
}

function endDemoTrial(reason) {
  plan = "free";
  planSource = null;
  demoExpiresAt = 0;
  savePlan();
  stopDemoCountdown();
  purgeDemoChats(reason === "manual");
  renderPlanChrome();
  renderActiveChat();
  if (reason === "expired") showToast("Your 10-minute Pro preview ended");
}

function startDemoCountdown() {
  stopDemoCountdown();
  updateDemoCountdownLabel();
  demoCountdownInterval = setInterval(() => {
    if (Date.now() >= demoExpiresAt) {
      endDemoTrial("expired");
    } else {
      updateDemoCountdownLabel();
    }
  }, 1000);
}

function stopDemoCountdown() {
  if (demoCountdownInterval) {
    clearInterval(demoCountdownInterval);
    demoCountdownInterval = null;
  }
}

function updateDemoCountdownLabel() {
  if (!(isPaid() && planSource === "demo")) return;
  const remainingMs = Math.max(0, demoExpiresAt - Date.now());
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  planBadge.textContent = `Pro preview · ${mins}:${String(secs).padStart(2, "0")}`;
}

/* ---------------------------------------------------------
   Rendering: plan chrome (sidebar, badge, mode bar)
--------------------------------------------------------- */
function renderPlanChrome() {
  if (isPaid() && planSource === "demo") {
    updateDemoCountdownLabel();
    planBadge.className = "plan-badge paid";
  } else {
    planBadge.textContent = isPaid() ? "Pro plan" : "Free plan";
    planBadge.className = "plan-badge " + (isPaid() ? "paid" : "free");
  }
  demoToggleBtn.textContent = isPaid() ? "Switch to free (demo)" : "Switch to Pro (demo)";

  paidSidebarBody.style.display = isPaid() ? "flex" : "none";
  freeSidebarBody.style.display = isPaid() ? "none" : "block";
  modeBar.style.display = isPaid() ? "flex" : "none";
  exportBtn.disabled = !isPaid();
  exportBtn.title = isPaid() ? "Download this chat as a text file" : "Upgrade to export chats";
  demoToggleBtn.textContent = isPaid()
    ? "Switch to free"
    : canStartDemoTrialToday()
    ? "Demo Pro"
    : "Demo used today";
  demoToggleBtn.disabled = !isPaid() && !canStartDemoTrialToday();
  if (accountStatusBtn) {
    accountStatusBtn.textContent = isPaid() ? "Pro User" : "Get Plus";
    accountStatusBtn.classList.toggle("pro", isPaid());
    accountStatusBtn.disabled = false;
  }
  renderModeMenu();
  if (isPaid()) renderChatList();
}

function renderChatList(filter = "") {
  chatListEl.innerHTML = "";
  const q = filter.trim().toLowerCase();
  const sorted = [...chats].sort((a, b) => b.createdAt - a.createdAt);
  const visible = q ? sorted.filter((c) => c.name.toLowerCase().includes(q)) : sorted;

  if (visible.length === 0) {
    chatListEl.innerHTML = `<div class="chat-list-empty">No chats found.</div>`;
    return;
  }

  visible.forEach((chat) => {
    const item = document.createElement("div");
    item.className = "chat-list-item" + (chat.id === activeChatId ? " active" : "");
    item.dataset.id = chat.id;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = chat.name + (chat.demoOnly ? " (preview)" : "");
    item.appendChild(name);

    const rowActions = document.createElement("div");
    rowActions.className = "row-actions";

    const renameBtn = document.createElement("button");
    renameBtn.textContent = "✎";
    renameBtn.title = "Rename";
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      startRename(item, chat);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Delete";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      requestDeleteChat(chat.id);
    };

    rowActions.appendChild(renameBtn);
    rowActions.appendChild(deleteBtn);
    item.appendChild(rowActions);

    item.addEventListener("click", () => switchChat(chat.id));
    chatListEl.appendChild(item);
  });
}

function startRename(item, chat) {
  const nameSpan = item.querySelector(".name");
  const input = document.createElement("input");
  input.className = "name-input";
  input.value = chat.name;
  item.replaceChild(input, nameSpan);
  input.focus();
  input.select();

  const commit = () => {
    const val = input.value.trim();
    if (val && val !== chat.name) {
      chat.name = uniqueName(val);
      saveChats();
    }
    renderChatList(chatSearchEl.value);
    if (chat.id === activeChatId) chatTitleEl.textContent = chat.name;
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      renderChatList(chatSearchEl.value);
    }
  });
  input.addEventListener("blur", commit);
}

function requestDeleteChat(id) {
  pendingDeleteId = id;
  const chat = chats.find((c) => c.id === id);
  confirmTitle.textContent = `Delete "${chat ? chat.name : "this chat"}"?`;
  confirmBody.textContent = "This will permanently remove the conversation.";
  openModal(confirmModal);
}

confirmActionBtn.addEventListener("click", () => {
  if (!pendingDeleteId) return;
  chats = chats.filter((c) => c.id !== pendingDeleteId);
  if (chats.length === 0) {
    const c = createChatObject(uniqueName("New chat"));
    chats.push(c);
  }
  if (activeChatId === pendingDeleteId) {
    activeChatId = chats[0].id;
  }
  pendingDeleteId = null;
  saveChats();
  renderChatList(chatSearchEl.value);
  renderActiveChat();
  closeModal(confirmModal);
  showToast("Chat deleted");
});

chatSearchEl && chatSearchEl.addEventListener("input", () => renderChatList(chatSearchEl.value));

/* ---------------------------------------------------------
   Rendering: messages
--------------------------------------------------------- */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(text) {
  let out = escapeHtml(text);
  // inline code `code`
  out = out.replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`);
  // bold **text** or __text__
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  // strikethrough ~~text~~
  out = out.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  // italic *text* or _text_ (after bold, so single markers left)
  out = out.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  // bare autolinks
  out = out.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, (m, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  return out;
}

/** Minimal, dependency-free Markdown renderer for AI replies.
 *  Escapes HTML first, so it's safe even if the model echoes tags. */
function renderMarkdown(raw) {
  // 1) Pull out fenced code blocks first so nothing inside them gets touched
  const codeBlocks = [];
  let text = raw.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const cleanCode = code.replace(/\n$/, "");
    codeBlocks.push(
      `<pre><code${lang ? ` class="lang-${lang}"` : ""}>${escapeHtml(cleanCode)}</code></pre>`
    );
    return `\u0000CODEBLOCK${idx}\u0000`;
  });

  const lines = text.split("\n");
  const htmlParts = [];
  let listBuffer = [];
  let listType = null; // 'ul' | 'ol'
  let tableBuffer = [];
  let paraBuffer = [];

  function flushParagraph() {
    if (paraBuffer.length) {
      htmlParts.push(`<p>${paraBuffer.map(inlineMarkdown).join("<br>")}</p>`);
      paraBuffer = [];
    }
  }
  function flushList() {
    if (listBuffer.length) {
      const items = listBuffer.map((li) => `<li>${inlineMarkdown(li)}</li>`).join("");
      htmlParts.push(`<${listType}>${items}</${listType}>`);
      listBuffer = [];
      listType = null;
    }
  }
  function flushTable() {
    if (tableBuffer.length >= 2) {
      const header = tableBuffer[0].split("|").map((c) => c.trim()).filter(Boolean);
      const rows = tableBuffer.slice(2).map((r) => r.split("|").map((c) => c.trim()).filter(Boolean));
      let html = "<table><thead><tr>";
      header.forEach((h) => (html += `<th>${inlineMarkdown(h)}</th>`));
      html += "</tr></thead><tbody>";
      rows.forEach((row) => {
        html += "<tr>";
        row.forEach((c) => (html += `<td>${inlineMarkdown(c)}</td>`));
        html += "</tr>";
      });
      html += "</tbody></table>";
      htmlParts.push(html);
    }
    tableBuffer = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\u0000CODEBLOCK\d+\u0000$/.test(trimmed)) {
      flushParagraph(); flushList(); flushTable();
      const idx = parseInt(trimmed.replace(/\D/g, ""), 10);
      htmlParts.push(codeBlocks[idx]);
      continue;
    }

    // table rows: "| a | b |" followed by "| --- | --- |"
    if (/^\|.*\|$/.test(trimmed) || (trimmed.includes("|") && /^[\s:|-]+$/.test(trimmed))) {
      flushParagraph(); flushList();
      tableBuffer.push(trimmed);
      continue;
    } else {
      flushTable();
    }

    if (trimmed === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length + 2; // h1 markdown -> h3 in bubble (keeps bubble compact)
      htmlParts.push(`<h${level} class="md-h">${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph(); flushList();
      htmlParts.push("<hr>");
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph(); flushList();
      htmlParts.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listBuffer.push(ol[1]);
      continue;
    }
    if (ul) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listBuffer.push(ul[1]);
      continue;
    }

    flushList();
    paraBuffer.push(line);
  }
  flushParagraph();
  flushList();
  flushTable();

  return htmlParts.join("");
}

function renderMessage(msg) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${msg.role}` + (msg.isError ? " error" : "") + (msg.pinned ? " pinned" : "");

  if (msg.pinned) {
    const flag = document.createElement("div");
    flag.className = "pin-flag";
    flag.textContent = "📌 PINNED";
    wrap.appendChild(flag);
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (msg.role === "assistant" && !msg.isError) {
    bubble.classList.add("md-content");
    bubble.innerHTML = renderMarkdown(msg.content);
  } else {
    bubble.textContent = msg.content;
  }
  wrap.appendChild(bubble);

  if (msg.role === "assistant" && !msg.isError) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "icon-btn";
    copyBtn.textContent = "Copy";
    copyBtn.onclick = () => copyMessage(msg.content, copyBtn);
    actions.appendChild(copyBtn);

    const shareBtn = document.createElement("button");
    shareBtn.className = "icon-btn";
    shareBtn.textContent = "Share";
    shareBtn.onclick = () => shareMessage(msg.content);
    if (!isPaid()) {
      shareBtn.disabled = true;
      shareBtn.title = "Upgrade to share messages";
    }
    actions.appendChild(shareBtn);

    const pinBtn = document.createElement("button");
    pinBtn.className = "icon-btn";
    pinBtn.textContent = msg.pinned ? "Unpin" : "Pin";
    pinBtn.onclick = () => togglePin(msg);
    if (!isPaid()) {
      pinBtn.disabled = true;
      pinBtn.title = "Upgrade to pin messages";
    }
    actions.appendChild(pinBtn);

    wrap.appendChild(actions);
  }

  if (msg.isError) {
    const retryBtn = document.createElement("button");
    retryBtn.className = "icon-btn retry";
    retryBtn.textContent = "Retry";
    retryBtn.onclick = () => {
      wrap.remove();
      if (lastFailedMessage) sendMessage(lastFailedMessage, true);
    };
    wrap.appendChild(retryBtn);
  }

  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function copyMessage(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    if (btnEl) {
      const original = btnEl.textContent;
      btnEl.textContent = "Copied";
      setTimeout(() => (btnEl.textContent = original), 1500);
    }
    showToast("Copied to clipboard");
  });
}

function shareMessage(text) {
  if (!isPaid()) {
    openModal(upgradeModal);
    return;
  }
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text);
    showToast("Message copied — paste it anywhere to share");
  }
}

function togglePin(msg) {
  if (!isPaid()) {
    openModal(upgradeModal);
    return;
  }
  msg.pinned = !msg.pinned;
  saveChats();
  renderActiveChat();
  showToast(msg.pinned ? "Message pinned" : "Message unpinned");
}

function renderLoading() {
  const wrap = document.createElement("div");
  wrap.className = "msg assistant loading";
  wrap.id = "loading-msg";
  wrap.innerHTML = `<div class="bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function removeLoading() {
  const el = document.getElementById("loading-msg");
  if (el) el.remove();
}

function renderEmptyState() {
  messagesEl.innerHTML = `
    <div class="empty-state">
      <h2>Start a conversation</h2>
      <p>Ask Water AI, your single male assistant, to write, explain, or help you think something through.</p>
    </div>`;
}

function renderActiveChat() {
  const chat = getActiveChat();
  if (!chat) return;
  chatTitleEl.textContent = chat.name;
  messagesEl.innerHTML = "";
  if (chat.messages.length === 0) {
    renderEmptyState();
  } else {
    chat.messages.forEach(renderMessage);
  }
  renderModeBar(chat);
  if (isPaid()) renderChatList(chatSearchEl.value);
}

function renderModeBar(chat) {
  document.querySelectorAll(".mode-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.mode === chat.mode);
  });
}

function renderModeMenu() {
  const chat = getActiveChat();
  const activeMode = chat?.mode || "general";
  document.querySelectorAll(".mode-menu-item").forEach((item) => {
    const isActive = item.dataset.mode === activeMode;
    item.disabled = false;
    item.classList.toggle("selected", isActive);
    item.title = "";
    item.setAttribute("aria-disabled", "false");
  });
  if (modeMenuBtn) {
    modeMenuBtn.setAttribute("aria-expanded", String(!modeMenu?.hidden));
    modeMenuBtn.innerHTML = `<span class="menu-button-icon">${MODE_MENU_ICONS[activeMode]}</span> ${MODE_MENU_LABELS[activeMode]}`;
  }
}

function closeModeMenu() {
  if (modeMenu && !modeMenu.hidden) {
    modeMenu.hidden = true;
    modeMenuBtn?.setAttribute("aria-expanded", "false");
  }
}

function toggleModeMenu() {
  if (!modeMenu) return;
  const open = !modeMenu.hidden;
  modeMenu.hidden = open;
  modeMenuBtn?.setAttribute("aria-expanded", String(!open));
}

modeMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleModeMenu();
});

modeMenu?.addEventListener("click", (e) => {
  const item = e.target.closest(".mode-menu-item");
  if (!item) return;
  const chat = getActiveChat();
  if (!chat) return;
  chat.mode = item.dataset.mode;
  saveChats();
  renderModeBar(chat);
  renderModeMenu();
  closeModeMenu();
  const labels = {
    general: "General mode",
    writing: "Writing mode — drafts that sound like you",
    code: "Code mode — built for debugging & building",
  };
  showToast(labels[chat.mode]);
});

document.addEventListener("click", (e) => {
  if (!modeMenu || !modeMenuBtn) return;
  if (modeMenu.contains(e.target) || modeMenuBtn.contains(e.target)) return;
  closeModeMenu();
});

modeBar.addEventListener("click", (e) => {
  const pill = e.target.closest(".mode-pill");
  if (!pill) return;
  const chat = getActiveChat();
  chat.mode = pill.dataset.mode;
  saveChats();
  renderModeBar(chat);
  const labels = { general: "General mode", writing: "Writing mode — drafts that sound like you", code: "Code mode — built for debugging & building" };
  showToast(labels[chat.mode]);
});

/* ---------------------------------------------------------
   Sending messages
--------------------------------------------------------- */
const MODE_PREFIX = {
  general: "You are a single male assistant named Water AI. Speak in a confident, natural male voice that is helpful, straightforward, and real. Message: ",
  writing: "You are a single male assistant named Water AI in Writing Assistant mode. Help the user write, edit, and refine text so it sounds authentic, confident, and natural. Message: ",
  code: "You are a single male assistant named Water AI in Code Assistant mode. Help the user generate code, debug problems, and automate repetitive work with clear working examples and a direct, practical tone. Message: ",
};

/* ---------------------------------------------------------
   Multi-provider fetch with automatic failover
   Tries each provider in API_PROVIDERS in order (and, for the
   Groq provider, each key in turn). If one is slow (exceeds
   API_TIMEOUT_MS) or errors/rate-limits, it shifts to the next
   provider/key automatically. Returns a normalized string reply.
--------------------------------------------------------- */
async function callWithTimeout(doFetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await doFetch(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithFailover(queryText) {
  let lastError = null;

  for (const provider of API_PROVIDERS) {
    if (provider.type === "custom") {
      try {
        const res = await callWithTimeout((signal) =>
          fetch(provider.url + encodeURIComponent(queryText), { signal })
        );
        if (!res.ok) throw new Error("Request failed with status " + res.status);
        const data = await res.json().catch(async () => ({ response: await res.text() }));
        const replyText = data.response || data.reply || data.answer || data.result || JSON.stringify(data);
        return replyText;
      } catch (err) {
        lastError = err;
        continue; // shift to next provider
      }
    }

    if (provider.type === "groq") {
      for (const apiKey of provider.keys) {
        try {
          const res = await callWithTimeout((signal) =>
            fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              signal,
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + apiKey,
              },
              body: JSON.stringify({
                model: provider.model,
                messages: [{ role: "user", content: queryText }],
              }),
            })
          );
          if (!res.ok) throw new Error("Groq request failed with status " + res.status);
          const data = await res.json();
          const replyText = data?.choices?.[0]?.message?.content;
          if (!replyText) throw new Error("Groq returned an empty response");
          return replyText;
        } catch (err) {
          lastError = err;
          continue; // shift to next Groq key (rate-limited/slow/failed)
        }
      }
    }
  }

  throw lastError || new Error("All API providers failed");
}

async function sendMessage(text, isRetry = false) {
  const chat = getActiveChat();

  if (!isRetry) {
    const userMsg = { role: "user", content: text };
    chat.messages.push(userMsg);
    if (chat.messages.filter((m) => m.role === "user").length === 1 && chat.name.startsWith("New chat")) {
      chat.name = uniqueName(text.length > 40 ? text.slice(0, 40).trim() + "…" : text);
      chatTitleEl.textContent = chat.name;
    }
    saveChats();
    if (messagesEl.querySelector(".empty-state")) messagesEl.innerHTML = "";
    renderMessage(userMsg);
    if (isPaid()) renderChatList(chatSearchEl.value);
  }

  renderLoading();

  const prefix = isPaid() ? MODE_PREFIX[chat.mode] || "" : "";
  const queryText = prefix + text;

  try {
    const replyText = await fetchWithFailover(queryText);

    removeLoading();
    const aiMsg = { role: "assistant", content: replyText };
    chat.messages.push(aiMsg);
    saveChats();
    renderMessage(aiMsg);
    lastFailedMessage = null;

    if (!isPaid()) {
      freeReplyCount++;
      saveFreeReplyCount();
      if (freeReplyCount % 2 === 0) {
        setTimeout(() => openModal(upgradeModal), 500);
      }
    }
  } catch (err) {
    removeLoading();
    lastFailedMessage = text;
    renderMessage({
      role: "assistant",
      content: "Something went wrong reaching Water AI. Please try again.",
      isError: true,
    });
  }
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  autoGrow();
  sendMessage(text);
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    formEl.requestSubmit();
  }
});

function autoGrow() {
  inputEl.style.height = "48px";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}
inputEl.addEventListener("input", autoGrow);

/* ---------------------------------------------------------
   Chat management
--------------------------------------------------------- */
function switchChat(id) {
  if (!chats.find((c) => c.id === id)) return;
  activeChatId = id;
  saveChats();
  renderActiveChat();
  if (window.innerWidth <= 860) sidebarEl.classList.remove("open");
}

function startNewChat() {
  if (isPaid()) {
    const chat = createChatObject(uniqueName("New chat"));
    chats.push(chat);
    activeChatId = chat.id;
    saveChats();
    renderActiveChat();
    renderChatList(chatSearchEl.value);
  } else {
    const chat = getActiveChat();
    chat.messages = [];
    chat.name = "New chat";
    saveChats();
    renderActiveChat();
  }
  inputEl.focus();
}

newChatBtn.addEventListener("click", startNewChat);
sidebarUpgradeBtn.addEventListener("click", () => openModal(upgradeModal));
if (accountStatusBtn) {
  accountStatusBtn.addEventListener("click", () => {
    if (isPaid()) {
      openAccountHistoryModal();
    } else {
      openPinModal();
    }
  });
}

clearBtn.addEventListener("click", () => {
  if (!confirm("Clear this conversation?")) return;
  const chat = getActiveChat();
  chat.messages = [];
  saveChats();
  renderActiveChat();
});

exportBtn.addEventListener("click", () => {
  if (!isPaid()) {
    openModal(upgradeModal);
    return;
  }
  const chat = getActiveChat();
  const lines = chat.messages.map((m) => `${m.role === "user" ? "You" : "Water AI"}: ${m.content}`);
  const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${chat.name.replace(/[^a-z0-9\-_ ]/gi, "").trim() || "chat"}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Chat exported");
});

shortcutsBtn.addEventListener("click", () => openModal(shortcutsModal));

sidebarToggleBtn.addEventListener("click", () => {
  const isOpen = sidebarEl.classList.toggle("open");
  sidebarEl.classList.toggle("collapsed", !isOpen);
  sidebarToggleBtn.setAttribute("aria-expanded", isOpen);
  sidebarToggleBtn.setAttribute("title", isOpen ? "Close sidebar" : "Open sidebar");
});

const sidebarCloseBtn = document.getElementById("sidebar-close-btn");
sidebarCloseBtn.addEventListener("click", () => {
  sidebarEl.classList.remove("open");
  sidebarEl.classList.add("collapsed");
  sidebarToggleBtn.setAttribute("aria-expanded", false);
  sidebarToggleBtn.setAttribute("title", "Open sidebar");
});

/* ---------------------------------------------------------
   Upgrade flow (PIN-gated) + Demo plan toggle (10 min trial)
--------------------------------------------------------- */
upgradeConfirmBtn.addEventListener("click", () => {
  closeModal(upgradeModal);
  openPinModal();
});

demoToggleBtn.addEventListener("click", () => {
  if (isPaid()) {
    const wasDemo = planSource === "demo";
    plan = "free";
    planSource = null;
    demoExpiresAt = 0;
    savePlan();
    stopDemoCountdown();
    if (wasDemo) purgeDemoChats(true);
    renderPlanChrome();
    renderActiveChat();
    showToast("Demo: switched to Free plan");
  } else {
    startDemoTrial();
  }
});

/* ---------------------------------------------------------
   Global keyboard shortcuts
--------------------------------------------------------- */
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const inField = ["TEXTAREA", "INPUT"].includes(document.activeElement.tagName);

  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    startNewChat();
  } else if (mod && e.key.toLowerCase() === "b") {
    e.preventDefault();
    sidebarEl.classList.toggle("open");
    sidebarEl.classList.toggle("collapsed");
  } else if (mod && e.key.toLowerCase() === "f" && isPaid()) {
    e.preventDefault();
    chatSearchEl.focus();
  } else if (e.key === "/" && !inField) {
    e.preventDefault();
    inputEl.focus();
  } else if (e.key === "?" && !inField) {
    e.preventDefault();
    openModal(shortcutsModal);
  } else if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.show").forEach(closeModal);
  }
});

/* ---------------------------------------------------------
   Init
--------------------------------------------------------- */
injectAuthModals();

if (isPaid() && planSource === "demo") {
  if (Date.now() >= demoExpiresAt) {
    endDemoTrial("expired");
  } else {
    startDemoCountdown();
  }
}

renderPlanChrome();
renderActiveChat();
