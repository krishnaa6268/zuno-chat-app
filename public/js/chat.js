const socket = io({
  path: "/socket.io",
  transports: ["polling", "websocket"],
  reconnectionAttempts: 5,
  timeout: 10000,
});
const $ = (id) => document.getElementById(id);
const messageInput = $("messageInput"),
  messageForm = $("messageForm"),
  messagesList = $("messages"),
  sendButton = $("sendButton"),
  identityScreen = $("identityScreen"),
  identityForm = $("identityForm"),
  usernameInput = $("usernameInput"),
  identityError = $("identityError"),
  roomScreen = $("roomScreen"),
  roomForm = $("roomForm"),
  roomInput = $("roomInput"),
  roomError = $("roomError"),
  createRoomButton = $("createRoomButton"),
  roomCodeElement = $("roomCode"),
  clearButton = $("clearButton"),
  endRoomButton = $("endRoomButton"),
  leaveRoomButton = $("leaveRoomButton"),
  shareRoomButton = $("shareRoomButton"),
  emojiButton = $("emojiButton"),
  emojiPicker = $("emojiPicker");
let username = "",
  currentRoomCode = "";
let restoreAttempted = false;
const messageElements = new Map();
const emojis = [
  "😀",
  "😂",
  "😍",
  "🥳",
  "😊",
  "👍",
  "👎",
  "❤️",
  "🔥",
  "🎉",
  "🙏",
  "👀",
  "😢",
  "😡",
  "🤔",
  "💯",
  "✅",
  "🚀",
  "✨",
  "💬",
];
usernameInput.value = localStorage.getItem("zuno-username") || "";
roomInput.value = new URLSearchParams(location.search).get("room") || "";
emojiPicker.replaceChildren(
  ...emojis.map((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = emoji;
    button.addEventListener("click", () => insertEmoji(emoji));
    return button;
  }),
);
function insertEmoji(emoji) {
  const start = messageInput.selectionStart ?? messageInput.value.length;
  const end = messageInput.selectionEnd ?? start;
  messageInput.value = `${messageInput.value.slice(0, start)}${emoji}${messageInput.value.slice(end)}`;
  messageInput.focus();
  messageInput.setSelectionRange(start + emoji.length, start + emoji.length);
  emojiPicker.hidden = true;
  emojiButton.setAttribute("aria-expanded", "false");
}
function timeLabel(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function showEmptyState() {
  if (!messagesList.children.length)
    messagesList.innerHTML =
      '<li class="empty-state">No messages yet. Say hello! 👋</li>';
}
function receiptText(message) {
  const readers = (message.seenBy || []).filter(
    (entry) => entry.username !== username,
  );
  console.log("readers", readers);
  return `${timeLabel(message.createdAt)} · ${readers.length ? "Total Seen: " + readers.length : "Sent"}`;
}
function addMessage(message) {
  document.querySelector(".empty-state")?.remove();
  if (messageElements.has(message.id)) return;
  const mine = message.senderName === username,
    item = document.createElement("li"),
    bubble = document.createElement("div"),
    content = document.createElement("span"),
    meta = document.createElement("time");
  item.className = `message-row ${mine ? "sent" : "received"}`;
  bubble.className = "message-bubble";
  if (!mine) {
    const sender = document.createElement("span");
    sender.className = "sender-name";
    sender.textContent = message.senderName;
    bubble.append(sender);
  }
  content.textContent = message.text;
  meta.className = "message-meta";
  meta.dataset.meta = "true";
  meta.textContent = mine ? receiptText(message) : timeLabel(message.createdAt);
  bubble.append(content, meta);
  item.append(bubble);
  messagesList.append(item);
  messageElements.set(message.id, { item, message });
  messagesList.scrollTop = messagesList.scrollHeight;
  if (!mine) socket.emit("mark-seen", [message.id]);
}
function clearRenderedMessages() {
  messagesList.replaceChildren();
  messageElements.clear();
  showEmptyState();
}
function showRoom(result, created) {
  currentRoomCode = result.roomCode;
  localStorage.setItem("zuno-room-code", currentRoomCode);
  roomCodeElement.textContent = currentRoomCode;
  clearRenderedMessages();
  result.messages.forEach(addMessage);
  roomScreen.hidden = true;
  messageInput.disabled = false;
  sendButton.disabled = false;
  shareRoomButton.hidden = !created;
  endRoomButton.hidden = false;
  leaveRoomButton.hidden = false;
  messageInput.focus();
}
function roomRequest(eventName, code, created = false) {
  roomError.textContent = "";
  const done = (result) =>
    result?.ok
      ? showRoom(result, created)
      : (() => {
          roomError.textContent = result?.error || "Unable to enter this room.";
          roomScreen.hidden = false;
        })();
  eventName === "create-room"
    ? socket.emit(eventName, done)
    : socket.emit(eventName, code, done);
}
identityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  identityError.textContent = "";
  if (!socket.connected)
    return (identityError.textContent =
      "Connecting to the chat server… try again shortly.");
  socket.emit("register-user", usernameInput.value.trim(), (result) => {
    if (!result?.ok)
      return (identityError.textContent =
        result?.error || "Unable to continue.");
    username = result.username;
    localStorage.setItem("zuno-username", username);
    identityScreen.hidden = true;
    const savedRoomCode =
      new URLSearchParams(location.search).get("room") ||
      localStorage.getItem("zuno-room-code");
    if (savedRoomCode) {
      roomScreen.hidden = false;
      roomError.textContent = "Rejoining your room...";
      roomRequest("join-room", savedRoomCode);
    } else {
      roomScreen.hidden = false;
      roomInput.focus();
    }
  });
});
createRoomButton.addEventListener("click", () =>
  roomRequest("create-room", undefined, true),
);
roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  roomRequest("join-room", roomInput.value);
});
leaveRoomButton.addEventListener("click", () => {
  if (
    !confirm(
      "Leave this private room? You can rejoin later with the same room ID if not full",
    )
  )
    return;
  socket.emit("leave-room", (result) => {
    if (!result?.ok) return alert(result?.error || "Could not leave the room.");
    currentRoomCode = "";
    localStorage.removeItem("zuno-room-code");
    history.replaceState({}, "", location.pathname);
    clearRenderedMessages();
    roomCodeElement.textContent = "—";
    messageInput.disabled = true;
    sendButton.disabled = true;
    shareRoomButton.hidden = true;
    endRoomButton.hidden = true;
    leaveRoomButton.hidden = true;
    roomError.textContent = "You left the room. Create or join another room.";
    roomScreen.hidden = false;
  });
});
emojiButton.addEventListener("click", () => {
  emojiPicker.hidden = !emojiPicker.hidden;
  emojiButton.setAttribute("aria-expanded", String(!emojiPicker.hidden));
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".emoji-wrap")) {
    emojiPicker.hidden = true;
    emojiButton.setAttribute("aria-expanded", "false");
  }
});
messageInput.addEventListener("focus", () => {
  emojiPicker.hidden = true;
  emojiButton.setAttribute("aria-expanded", "false");
});
socket.on("message", addMessage);
socket.on("messages-seen", ({ messageIds, username: reader }) =>
  messageIds.forEach((id) => {
    const stored = messageElements.get(id);
    if (
      !stored ||
      stored.message.seenBy.some((entry) => entry.username === reader)
    )
      return;
    stored.message.seenBy.push({ username: reader });
    if (stored.message.senderName === username)
      stored.item.querySelector("[data-meta]").textContent = receiptText(
        stored.message,
      );
  }),
);
messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = messageInput.value.trim();
  if (!message) return;
  emojiPicker.hidden = true;
  emojiButton.setAttribute("aria-expanded", "false");
  sendButton.disabled = true;
  socket.emit("chat-message", message, (result) => {
    sendButton.disabled = false;
    if (result?.ok) {
      messageInput.value = "";
      messageInput.focus();
    }
  });
});
clearButton.addEventListener("click", () => {
  if (
    !username ||
    !confirm(
      "Clear this room from your view? The other member keeps their messages.",
    )
  )
    return;
  socket.emit("clear-chat", (result) =>
    result?.ok
      ? clearRenderedMessages()
      : alert(result?.error || "Could not clear chat."),
  );
});
endRoomButton.addEventListener("click", () => {
  if (
    !confirm(
      "End this private room permanently? It will delete all messages and chat data for both members.",
    )
  )
    return;
  socket.emit("end-room", (result) => {
    if (!result?.ok) alert(result?.error || "Could not end this room.");
  });
});
socket.on("room-ended", () => {
  currentRoomCode = "";
  localStorage.removeItem("zuno-room-code");
  history.replaceState({}, "", location.pathname);
  clearRenderedMessages();
  roomCodeElement.textContent = "—";
  messageInput.disabled = true;
  sendButton.disabled = true;
  shareRoomButton.hidden = true;
  endRoomButton.hidden = true;
  leaveRoomButton.hidden = true;
  roomError.textContent = "This room has ended. Create or join another room.";
  roomScreen.hidden = false;
});
socket.on("member-left", ({ username: leftUsername, memberCount }) => {
  if (leftUsername === username) return;
  roomError.textContent = `${leftUsername} left the room. ${memberCount} participant remains.`;
});
socket.on("connect", () => {
  if (restoreAttempted) return;
  restoreAttempted = true;
  const savedUsername = localStorage.getItem("zuno-username");
  const savedRoomCode =
    new URLSearchParams(location.search).get("room") ||
    localStorage.getItem("zuno-room-code");
  if (!savedUsername || !savedRoomCode) return;
  socket.emit("register-user", savedUsername, (result) => {
    if (!result?.ok) return;
    username = result.username;
    identityScreen.hidden = true;
    roomScreen.hidden = false;
    roomError.textContent = "Rejoining your room...";
    roomRequest("join-room", savedRoomCode);
  });
});
socket.on("connect_error", (error) => {
  console.error("Socket connect error:", error);
  if (!identityScreen.hidden) {
    identityError.textContent =
      "Unable to reach the chat server. Refresh and try again.";
  } else {
    roomError.textContent =
      "Unable to reach the chat server. Refresh and try again.";
  }
});
socket.on("reconnect_failed", () => {
  if (!identityScreen.hidden) {
    identityError.textContent =
      "Could not reconnect to the chat server. Refresh and try again.";
  } else {
    roomError.textContent =
      "Could not reconnect to the chat server. Refresh and try again.";
  }
});
shareRoomButton.addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}?room=${currentRoomCode}`;
  try {
    await navigator.clipboard.writeText(url);
    shareRoomButton.textContent = "Copied!";
    setTimeout(() => (shareRoomButton.textContent = "Copy invite"), 1500);
  } catch {
    prompt("Copy this invite link:", url);
  }
});
