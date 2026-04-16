# NoteX 📝✨

**NoteX** is an open and collaborative notes platform designed for everyone 🌍.

With a focus on simplicity and teamwork 🤝, NoteX allows users to write notes 🗒️, track tasks ✅, and collaborate in real time ⚡. The platform encourages idea sharing 💡 and transparent workflows 🔍, making it ideal for personal productivity 👤 as well as team collaboration 👥.

At its core, NoteX stands for **Notes Open To Everyone, eXchange** 🔄 — a space where ideas flow freely 🌊 and work gets done together 🚀.

## 🚀 Why Notex?

We built Notex on the principle of **Zero-Friction Collaboration**.

- **Speed First 🏎️**: Create a room and start typing in seconds. No sign-ups, no onboarding wizard, no nonsense.
- **Human-Friendly URLs 🎯**: Share memorable room links like `notex.pranavdhawale.in/my-project` or `notex.pranavdhawale.in/cosmic-whale`.
- **Real-Time Magic ✨**: See cursors fly and text appear instantly with CRDT-backed concurrency.
- **Ephemeral & Private 🔐**: Rooms auto-expire (24h empty, 7d with content) but you can save snapshots when needed.
- **Room Locking 🔒**: Password-protect rooms for restricted access with single-use auth tokens.
- **Mobile-First �**: Designed for seamless use on phones with a dedicated mobile UI and files modal.
- **Engineering Excellence 🛠️**: A simple UI powers a robust, high-performance engine utilizing Go and modern web technologies.

## ✨ Features

### 🎨 Rich Text Editing

- **Full-Featured Editor**: Powered by Tiptap v3 (ProseMirror)
- **Text Formatting**: Bold, italic, underline, strikethrough, highlight
- **Subscript & Superscript**: Scientific and mathematical notation
- **Text Color**: Apply colors to selected text
- **Headings**: H1, H2, H3 with paragraph support
- **Lists**: Bullet, ordered, and task lists with indentation
- **Code Blocks**: Syntax-highlighted code blocks
- **Blockquotes**: Quote blocks for citations
- **Tables**: Create and edit tables inline with context menu
- **Links**: Add and manage hyperlinks
- **Text Alignment**: Left, center, right, justify
- **Indentation**: Tab/Shift+Tab for indent/outdent
- **Inline Images**: Drag-drop or paste images directly into the document

### 🤝 Real-Time Collaboration

- **Live Cursors**: See where others are typing
- **Conflict-Free Editing**: CRDT technology (Yjs) ensures smooth collaboration
- **User Awareness**: See who's in the room
- **Instant Sync**: Changes appear in real-time across all clients

### 🏷️ Smart Room Management

- **Custom Slugs**: Create rooms with memorable names (`my-project`, `team-alpha`)
- **Auto-Generated Names**: Get creative 2-word combinations (`cosmic-whale`, `daring-airedale`)
- **Validation**: 1-2 word slugs, lowercase, alphanumeric + hyphens
- **TTL Management**: Rooms auto-expire based on activity
  - Empty rooms: 24 hours
  - Rooms with content: 7 days
- **Room Locking**: Password-protect rooms for restricted access
  - Lock rooms with a password
  - Unlock rooms by verifying password
  - Single-use auth tokens for secure access

### 📁 File Sharing

- **Upload Files**: Share files within rooms
- **Download Files**: Access uploaded files anytime
- **Inline Images**: Paste or drag images into the editor — they upload automatically and embed inline for all collaborators
- **File Management**: View all files in a room
- **Image Gallery**: Browse, insert, delete, and manage images with a dedicated gallery popup (Ctrl+Shift+/)
- **File-Image Interop**: Insert files as inline images, or save inline images back to the files collection

### ⚡ Performance & Caching

- **Session Persistence**: Content cached in browser for resilience
- **Auto-Recovery**: Recover work after page refresh
- **Compression**: Efficient storage using pako compression
- **Optimized Particles**: High-performance background effects powered by OGL, optimized for low resource usage.

### ⌨️ Keyboard Shortcuts

- **Quick Actions**: Comprehensive keyboard shortcuts for all editor operations
- **Text Formatting**:
  - Bold (Ctrl+B), Italic (Ctrl+I), Underline (Ctrl+U)
  - Strikethrough (Ctrl+Shift+X), Highlight (Ctrl+Shift+H)
  - Subscript (Ctrl+,), Superscript (Ctrl+.)
- **Headings**: Ctrl+Alt+1/2/3 for H1/H2/H3, Ctrl+Alt+0 for Paragraph
- **Lists**: Bullet list (Ctrl+Shift+8), Ordered list (Ctrl+Shift+7)
- **Blocks**: Blockquote (Ctrl+Shift+B), Code block (Ctrl+Alt+C), Horizontal rule (Ctrl+Alt+-)
- **Indentation**: Indent (Tab), Outdent (Shift+Tab)
- **Other**: Link (Ctrl+K), Hard break (Shift+Enter)
- **Navigation**: Save snapshot (Ctrl+S), Lock/Unlock (Ctrl+L), Shortcuts help (Ctrl+/), Image gallery (Ctrl+Shift+/)

### 🖱️ Table Editing

- **Context Menu**: Right-click on tables for quick actions
- **Column Operations**: Add before/after, delete columns
- **Row Operations**: Add before/after, delete rows
- **Table Management**: Delete entire tables

## 🛠️ The Tech Stack

Notex isn't just a toy; it's an architectural showcase.

### **Frontend** (The Beauty) 🎨

- **React 19 + Vite**: Blazing fast builds and HMR
- **TypeScript**: Type-safe development
- **Tiptap v3**: Headless wrapper for ProseMirror, full editor control with reactive state
- **Tiptap Image + FileHandler**: Inline image drag-drop-paste with authenticated rendering
- **Yjs**: CRDT library for conflict-free real-time collaboration
- **Framer Motion**: Animation library for startup animation
- **OGL**: Ultra-lightweight WebGL library for the particle system
- **Lucide React**: Beautiful icon library
- **Sonner**: Toast notifications

### **Backend** (The Beast) 🦍

- **Go (Golang) 1.25+**: Raw performance and first-class concurrency
- **Gin**: High-performance HTTP web framework
- **Gorilla WebSocket**: Real-time communication with ping/pong keepalive
- **MongoDB**: Stores rooms, content, files, and images with TTL auto-expiry
- **MinIO**: S3-compatible object storage for files and images with thumbnail generation
- **golang-petname**: Human-friendly slug generation
- **Argon2id**: Password hashing for room locking

### **Infrastructure** 🏗️

- **Docker & Docker Compose**: Containerized development and deployment
- **Air**: Live reload for Go development
- **Nginx**: Production reverse proxy (API, WebSocket, and uploads proxying)
- **pako**: Client-side compression for session cache persistence

## ⚡ Quick Start

Want to see it in action? You only need [Docker](https://www.docker.com/).

```bash
# Clone the repository
git clone https://github.com/pranavdhawale/notex.git
cd notex

# Start development environment 🚀
docker-compose -f docker-compose.dev.yml up --build
```

That's it!

- 🎨 **Frontend**: [http://localhost:5173](http://localhost:5173)
- ⚙️ **Backend**: [http://localhost:8080](http://localhost:8080)
- 🍃 **MongoDB**: `mongodb://localhost:27017`

## 🏗️ Architecture

NoteX follows a **Client-Server** architecture with real-time WebSocket communication.

```mermaid
graph TD
    User[👤 User] -->|HTTP/WS| Client[⚛️ React Client]
    Client -->|REST API| Server[🦍 Go Server]
    Client <-->|WebSocket| Server

    Server -->|Metadata & Content| Mongo[(🍃 MongoDB)]
    Server -->|File Storage| MinIO[(🪣 MinIO Object Storage)]

    Client -->|Yjs CRDT| YjsDoc[📄 Y.Doc]
    YjsDoc -->|Sync| Server
    Server -->|Broadcast| YjsDoc
```

### Key Components

- **Client**: React SPA with Tiptap v3 editor and Yjs CRDT integration
- **Server**: Go API server with WebSocket hub, secured by centralized rate limiters and auth middleware
- **MongoDB**: Persistent storage for rooms, content, files, and images (with TTL indexes for auto-expiry)
- **MinIO**: S3-compatible service for file and image object storage with thumbnail generation
- **WebSocket Hub**: Manages active connections, broadcasts Yjs updates, and caches awareness state
- **Smart Cache**: Browser-based session caching with pako compression for resilience
- **Token Store**: In-memory auth token management for locked room access (1-hour expiry)
- **Room Cache**: In-memory room metadata cache to reduce DB lookups on WebSocket connections
- **Cleanup Service**: Background jobs that clean orphaned files, unreferenced images, and expired tokens

## 📁 Project Structure

```
notex/
├── client/                 # React frontend
│   ├── src/
│   │   ├── editor/        # Editor components
│   │   │   ├── Editor.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── FilesSidebar.tsx
│   │   │   ├── FilesModal.tsx
│   │   │   ├── TableContextMenu.tsx
│   │   │   └── extensions/  # Custom Tiptap extensions
│   │   │       ├── Image.ts
│   │   │       ├── ImageNodeView.tsx
│   │   │       ├── Indent.ts
│   │   │       └── SlashCommand.ts
│   │   ├── components/    # Shared components
│   │   │   ├── ActiveUsersAvatars.tsx
│   │   │   ├── ConfirmationModal.tsx
│   │   │   ├── ImageGalleryPopup.tsx
│   │   │   ├── KeyboardShortcutsPopup.tsx
│   │   │   ├── LockUnlockModal.tsx
│   │   │   ├── NotFoundView.tsx
│   │   │   ├── Particles.tsx
│   │   │   ├── PasswordPrompt.tsx
│   │   │   ├── StartupAnimation.tsx
│   │   │   ├── ThemeContext.tsx
│   │   │   └── Toaster.tsx
│   │   ├── utils/         # Utilities
│   │   │   ├── api.ts
│   │   │   ├── constants.ts
│   │   │   ├── fileIcons.tsx
│   │   │   ├── platform.ts
│   │   │   ├── session.ts
│   │   │   └── SmartCacheManager.ts
│   │   ├── App.tsx
│   │   └── LandingPage.tsx
│   └── Dockerfile
│
├── server/                # Go backend
│   ├── main.go
│   ├── internal/
│   │   ├── api/          # HTTP handlers
│   │   │   ├── handlers.go     # Room CRUD, save
│   │   │   ├── upload.go       # File upload/download/delete
│   │   │   ├── image.go        # Inline image serving
│   │   │   ├── images.go       # Image CRUD, thumbnails, reconcile, cleanup
│   │   │   └── roomlock.go    # Lock/unlock, password auth
│   │   ├── cleanup/      # Background orphan cleanup jobs
│   │   ├── middleware/    # Auth & rate limiting
│   │   ├── models/       # Data models (room, file, image)
│   │   ├── state/       # DB connections & in-memory state
│   │   │   ├── mongo.go        # MongoDB init, indexes, TTL
│   │   │   ├── storage.go      # MinIO init
│   │   │   ├── authtoken.go    # In-memory token store for locked rooms
│   │   │   └── roomcache.go    # In-memory room metadata cache
│   │   ├── storage/      # MinIO client wrapper
│   │   ├── utils/        # Slug generation, password hashing
│   │   └── ws/           # WebSocket hub, client, handler
│   └── Dockerfile
│
├── docker-compose.dev.yml
└── docker-compose.prod.yml
```

## 👩‍💻 Development

We use a modern dockerized workflow with hot-reloading for both backend and frontend.

### Commands

```bash
# Start development environment
docker-compose -f docker-compose.dev.yml up

# Rebuild containers
docker-compose -f docker-compose.dev.yml up --build

# Stop all services
docker-compose -f docker-compose.dev.yml down

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# View specific service logs
docker-compose -f docker-compose.dev.yml logs -f server
docker-compose -f docker-compose.dev.yml logs -f client
```

### Development Features

- **Hot Reload**: Both client (Vite) and server (Air) support live reloading
- **TypeScript**: Full type safety on the frontend
- **Go Modules**: Dependency management with go.mod
- **Docker Volumes**: Code changes reflected immediately

## 🎯 Room Slug Examples

### Auto-Generated (2-word combinations)

- `cosmic-whale`
- `daring-airedale`
- `mighty-frog`
- `perfect-sunbeam`

### Custom Slugs (user-defined)

- `my-project` ✅
- `team-alpha` ✅
- `design-review` ✅
- `hackathon` ✅

### Invalid Slugs

- `My-Project` ❌ (uppercase)
- `my-team-room` ❌ (3 words)
- `a-b` ❌ (too short)
- `my_project` ❌ (underscore)

## 🔒 Privacy & Data

- **No Sign-Up Required**: Start collaborating immediately
- **Ephemeral by Default**: Rooms auto-expire based on activity
- **Secure File Storage**: Files are safely isolated using S3-compatible object storage (MinIO)
- **Built-in Rate Limiting**: Abuse prevention across API & file upload routes
- **No Tracking**: We don't track user behavior
- **Open Source**: Full transparency

## 🤝 Contributing

We ❤️ open source! If you have ideas, suggestions, or bug fixes, feel free to contribute.

1. Fork the repo 🍴
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request 📩

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the community.**
