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

## 🗄️ Database Access

### Connect with MongoDB Compass
To connect visually using a tool like Compass:

- **Connection String**:
    ```
    mongodb://notex:notex_password@localhost:27018/notex?authSource=notex
    ```
- **Details**:
    - **Host**: `localhost`
    - **Port**: `27018` (mapped from container)
    - **Auth DB**: `notex`

### Connect via CLI (Docker Exec)
To access the MongoDB shell directly inside the container:

```bash
docker exec -it notex-mongo mongosh -u notex -p notex_password --authenticationDatabase notex
```

---

## 🛠 Troubleshooting

### CORS Errors
If the client cannot talk to the server, ensure `CLIENT_ORIGIN` in `docker-compose.yml` matches exactly what you see in the browser address bar.

### Port Conflicts
If ports 8080 or 5173 are already in use, you can change them in the `ports` mapping section of `docker-compose.yml`.

### MongoDB Permissions
We enforce authentication. Default credentials:
- **User**: `notex`
- **Password**: `notex_password`
- **Database**: `notex`

If you encounter authentication errors after switching configs, try resetting the volume:
```bash
docker-compose down -v
docker-compose up --build
```
