# NoteX Setup Guide (Docker)

This guide provides step-by-step instructions to get NoteX up and running using Docker. Our setup features **multi-stage builds** and **hot-reloading** to provide the best experience for both development and production.

---

## 🏗 Architecture Overview

NoteX consists of four main services:
- **Client**: React (Vite) application.
- **Server**: Go (Gin) backend with WebSocket support.
- **Database**: MongoDB (via Bitnami image).
- **Cache**: Redis for real-time state synchronization.

---

## 📋 Prerequisites

Ensure you have the following installed:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Version 20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (Usually included with Docker Desktop)

---

## 🚀 Development Quick Start

To start developing with live hot-reloading:

1.  **Prepare Environment Variables**:
    Confirm your `docker-compose.yml` has the correct `CLIENT_ORIGIN` (usually `http://localhost:5173`).

2.  **Spin up the environment**:
    ```bash
    docker-compose up --build
    ```
    - The **Client** will be available at `http://localhost:5173`.
    - The **Server** will be available at `http://localhost:8080`.

3.  **Hot-Reloading Features**:
    - **Client**: Changes to React files in `client/src` will reflect instantly via Vite HMR.
    - **Server**: Changes to Go files in `server/` will trigger an automatic re-build and restart inside the container via `air`.

---

## 📦 Production Build

Our Dockerfiles use multi-stage builds to create tiny, optimized images for production.

### Building Production Images

1.  **Build Client (Nginx)**:
    ```bash
    docker build --target production -t notex-client-prod ./client
    ```

2.  **Build Server (Binary)**:
    ```bash
    docker build --target production -t notex-server-prod ./server
    ```

### Why Multi-stage?
- **Security**: Development tools and source code are removed from the final image.
- **Performance**: The production images are significantly smaller (~20MB for server, ~25MB for client).
- **Reliability**: No Node.js or Go runtime is needed in production — just a static binary and Nginx.

---

## 🛠 Troubleshooting

### CORS Errors
If the client cannot talk to the server, ensure `CLIENT_ORIGIN` in `docker-compose.yml` matches exactly what you see in the browser address bar.

### Port Conflicts
If ports 8080 or 5173 are already in use, you can change them in the `ports` mapping section of `docker-compose.yml`.

### MongoDB Permissions
If MongoDB fails to start, verify you are using the `ALLOW_EMPTY_PASSWORD=yes` flag in development.
