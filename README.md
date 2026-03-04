# BillyCord

A full-featured chat application with real-time messaging, voice channels, server management, direct messages, and more. Built with React, Node.js, Socket.IO, PostgreSQL, and WebRTC.

## Features

### Core
- **Real-time messaging** via WebSockets (Socket.IO)
- **Voice channels** with WebRTC peer-to-peer audio
- **Server management** with channels, categories, roles, and permissions
- **Direct messages** and group conversations
- **Friends system** with requests, accept/decline, blocking
- **User presence** (online, idle, DND, offline indicators)
- **Typing indicators** and read receipts

### Messaging
- Markdown support (bold, italics, code, strikethrough)
- Message editing and deletion
- Emoji reactions with real-time updates
- Pinned messages per channel
- File and image attachments
- Message history with infinite scroll

### Server Management
- Create/edit/delete servers
- Invite links with expiration and usage limits
- Channel categories and reordering
- Role-based permissions system (17 permission types)
- Member kick, ban, and unban
- Full audit log for admin actions

### Voice Chat
- Join/leave voice channels
- WebRTC peer-to-peer audio streaming
- Mute/unmute and deafen controls
- Voice channel participant list

### User Features
- Account registration and login (JWT auth)
- Profile editing (username, bio, avatar, custom status)
- Password change
- Theme switching (dark/light)
- Notification and privacy settings
- Keyboard shortcuts reference

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Redux Toolkit, React Router |
| Backend | Node.js, Express, TypeScript |
| Real-time | Socket.IO (messaging), WebRTC (voice) |
| Database | PostgreSQL (data), Redis (caching/sessions) |
| Auth | JWT (access + refresh tokens), bcrypt |
| Build | Vite (client), TSC (server) |
| Deploy | Docker, Docker Compose, Nginx |
| CI/CD | GitHub Actions |

## Project Structure

```
billycord/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── auth/          # Login/Register
│   │   │   ├── chat/          # Chat area, messages, member list
│   │   │   ├── channel/       # Channel sidebar
│   │   │   ├── server/        # Server list, create/join modals
│   │   │   ├── friends/       # Friends page
│   │   │   ├── dm/            # Direct messages
│   │   │   ├── settings/      # Settings overlay
│   │   │   └── common/        # Layout components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Page components
│   │   ├── services/          # API client, Socket service
│   │   ├── store/             # Redux slices
│   │   ├── styles/            # CSS styles
│   │   └── types/             # TypeScript types
│   └── package.json
├── server/                    # Node.js backend
│   ├── src/
│   │   ├── config/            # Database, Redis, migrations
│   │   ├── controllers/       # Route handlers
│   │   ├── middleware/        # Auth, rate limiting, uploads
│   │   ├── routes/            # Express routes
│   │   ├── services/          # Socket.IO service
│   │   ├── types/             # TypeScript types
│   │   └── utils/             # JWT, validation
│   ├── tests/                 # Jest tests
│   └── package.json
├── docker-compose.yml         # Docker orchestration
├── .github/workflows/         # CI/CD pipeline
└── .env.example               # Environment variables template
```

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Quick Start with Docker

```bash
# Clone the repository
git clone <repo-url>
cd billycord

# Copy environment variables
cp .env.example .env

# Start all services
docker-compose up -d

# Run database migrations
docker exec billycord-server npm run db:migrate

# (Optional) Seed demo data
docker exec billycord-server npm run db:seed
```

The app will be available at `http://localhost:5173`.

### Manual Setup

```bash
# Install all dependencies
npm run install:all

# Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# Start PostgreSQL and Redis (ensure they're running)

# Run database migrations
cd server && npm run db:migrate

# (Optional) Seed demo data
npm run db:seed

# Start development servers (from root)
cd .. && npm run dev
```

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`

### Demo Accounts (after seeding)
| Email | Password |
|-------|----------|
| demo@example.com | password123 |
| test@example.com | password123 |

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| POST | /api/auth/refresh | Refresh token |
| GET | /api/auth/me | Get current user |
| PATCH | /api/auth/profile | Update profile |
| POST | /api/auth/change-password | Change password |

### Servers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/servers | List user's servers |
| POST | /api/servers | Create server |
| GET | /api/servers/:id | Get server details |
| PATCH | /api/servers/:id | Update server |
| DELETE | /api/servers/:id | Delete server |
| POST | /api/servers/join/:code | Join via invite |
| POST | /api/servers/:id/leave | Leave server |

### Channels & Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/servers/:id/channels | Create channel |
| GET | /api/channels/:id/messages | Get messages |
| POST | /api/channels/:id/messages | Send message |
| PATCH | /api/messages/:id | Edit message |
| DELETE | /api/messages/:id | Delete message |
| POST | /api/messages/:id/reactions | Add reaction |

### Friends & DMs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/friends | List friends |
| POST | /api/friends/request | Send request |
| GET | /api/dm/conversations | List conversations |
| POST | /api/dm/conversations/:id/messages | Send DM |

## WebSocket Events

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| channel:join | channelId | Join channel room |
| message:send | { channelId, message } | Broadcast message |
| typing:start | { channelId } | Start typing indicator |
| voice:join | { channelId } | Join voice channel |
| voice:offer | { targetSocketId, offer } | WebRTC offer |

### Server → Client
| Event | Payload | Description |
|-------|---------|-------------|
| message:new | message | New message received |
| typing:start | { userId, username } | User started typing |
| user:status | { userId, status } | Status change |
| voice:user-joined | { userId, username } | User joined voice |
| dm:new | { conversationId, message } | New DM received |

## Database Schema

The database includes 14 tables:
- **users** - Accounts with profiles and status
- **servers** - Discord servers
- **channels** - Text and voice channels
- **categories** - Channel groupings
- **messages** - Channel messages with attachments
- **reactions** - Message reactions
- **roles** - Server roles with permission bitmask
- **server_members** - Server membership
- **member_roles** - Role assignments
- **friends** - Friend relationships
- **conversations** - DM conversations
- **direct_messages** - DM messages
- **invites** - Server invite links
- **audit_logs** - Admin action logs
- **bans** - Server bans

## Testing

```bash
# Run all tests
npm test

# Server tests only
npm run test:server

# Client tests only
npm run test:client
```

## Permissions System

Uses a bitmask system with 17 permission types:

| Permission | Bit | Description |
|-----------|-----|-------------|
| VIEW_CHANNELS | 0 | View channels |
| SEND_MESSAGES | 1 | Send messages |
| MANAGE_MESSAGES | 2 | Delete/pin others' messages |
| ATTACH_FILES | 3 | Upload files |
| ADD_REACTIONS | 4 | Add reactions |
| CONNECT_VOICE | 5 | Join voice channels |
| SPEAK | 6 | Speak in voice |
| MUTE_MEMBERS | 7 | Mute others |
| DEAFEN_MEMBERS | 8 | Deafen others |
| MANAGE_CHANNELS | 9 | Create/edit/delete channels |
| MANAGE_SERVER | 10 | Edit server settings |
| MANAGE_ROLES | 11 | Create/edit roles |
| KICK_MEMBERS | 12 | Kick members |
| BAN_MEMBERS | 13 | Ban members |
| CREATE_INVITES | 14 | Create invite links |
| MANAGE_WEBHOOKS | 15 | Manage webhooks |
| ADMINISTRATOR | 16 | Full admin access |

## License

MIT
