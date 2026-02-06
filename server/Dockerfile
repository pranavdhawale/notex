# Stage 1: Base
FROM golang:alpine AS base
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download

# Stage 2: Development
FROM base AS development
RUN go install github.com/air-verse/air@latest
COPY . .
EXPOSE 8080
CMD ["air", "-c", ".air.toml"]

# Stage 3: Builder
FROM base AS builder
COPY . .
RUN go build -o notex-server ./main.go

# Stage 4: Production
FROM alpine:latest AS production
RUN apk add --no-cache tzdata
WORKDIR /app
COPY --from=builder /app/notex-server .
EXPOSE 8080
CMD ["./notex-server"]
