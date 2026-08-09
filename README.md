# Zuno Chat

Zuno is a responsive, real-time private chat app. A creator makes a short room ID, shares the generated invite link with one person, and the two members can exchange MongoDB-persisted messages with read receipts and emoji messages.

## Features

- Private rooms limited to two distinct usernames
- Shareable invite links such as `http://localhost:8000/?room=AB12CD34`
- Real-time Socket.IO messaging, including emoji messages
- Left/right message bubbles, timestamps, and **Sent / Seen** receipts
- Chat history stored in MongoDB
- Per-user **Clear my chat** view; it never deletes the other member's history
- Automatic room restoration after refresh on the same browser
- **End room** permanently removes the room, all its messages, and both members' room state
- Responsive desktop and mobile layout

## Requirements

- Node.js 18 or newer
- A MongoDB database (Atlas or local MongoDB)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root:

   ```env
   PORT=8000
   MONGODB_URL=mongodb+srv://USERNAME:PASSWORD@CLUSTER/DATABASE
   ```

3. Start the application:

   ```bash
   npm run dev
   ```

   Or run without Nodemon:

   ```bash
   npm start
   ```

4. Open [http://localhost:8000](http://localhost:8000).

5.  App Monitor - [http://localhost:8000/status].

## Deploy to Railway

1. Push this project to a GitHub repository. The included `.gitignore` prevents your local `.env` file from being uploaded.
2. In the [Railway dashboard](https://railway.app/), choose **New Project** → **Deploy from GitHub repo**, then select the repository.
3. Open the deployed service's **Variables** tab and add:

   ```text
   MONGODB_URL=your-production-mongodb-connection-string
   ```

   Do not add `PORT`; Railway provides it automatically.
4. Deploy the staged change. Railway reads `railway.toml`, uses `npm start`, and checks `/health` before marking the app healthy.
5. In the service **Settings** tab, click **Generate Domain**. Use this `https://…railway.app` URL to open and share Zuno rooms.

The app listens on Railway's injected `PORT` and on `0.0.0.0`, which Railway requires for public traffic. Railway provides the current project/deployment workflow and environment-variable management in its [Quick Start](https://docs.railway.com/quick-start), [Variables guide](https://docs.railway.com/variables), and [configuration reference](https://docs.railway.com/config-as-code/reference).

## How to use it

1. Enter a display name.
2. Click **Create private room**.
3. Click **Copy invite** and send the link to the other person.
4. They open the link, enter a different name, and click **Join**.
5. Send messages or select an emoji from the smiley button beside the composer.

The current room restores automatically after refresh in the same browser. To permanently remove a room for both people, use **End room**; this action cannot be undone.

Each room permits two different display names. Reconnecting with a name already in that room is allowed.

## Project structure

```text
.
├── app.js                       # Express and Socket.IO startup
├── server/
│   ├── config/database.js        # MongoDB connection and index migration
│   ├── models/                   # Room, Message, and ChatState schemas
│   └── socket/chatSocket.js      # Room, message, seen, and clear-chat events
├── public/
│   ├── index.html                # App markup
│   ├── css/styles.css            # Responsive UI styling
│   └── js/chat.js                # Browser UI and Socket.IO client logic
└── README.md
```

## Data flow

```text
Browser → Socket.IO → chatSocket.js → MongoDB
   ↑           │            │
   └───────────┴── room-only events ────────┘
```

- `register-user`: saves the display name for the connected socket.
- `create-room`: creates an eight-character room code and adds its creator.
- `join-room`: validates the code, enforces the two-member limit, joins the Socket.IO room, and returns that room's history.
- `chat-message`: saves a message with its `roomId`, then broadcasts it only with `io.to(roomId)`.
- `mark-seen`: records a recipient's read receipt for messages in the current room.
- `clear-chat`: records a room-specific clear timestamp for the current display name.
- `end-room`: deletes the room, its messages, and its room-specific chat state; all currently connected members are returned to the room screen.

## Important privacy note

Room messages are isolated by room ID, but display names are not authentication. Do not treat this as end-to-end encrypted or production-grade private messaging. For stronger privacy, add account login (for example, JWT/session authentication), authorization checks, rate limits, HTTPS, and end-to-end encryption before deployment.
