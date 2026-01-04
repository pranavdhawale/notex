FROM golang:alpine AS builder

WORKDIR /app

COPY go.mod ./
# COPY go.sum ./ # Will do this after tidying
RUN go mod download

COPY . .

RUN go build -o notex-server ./main.go

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/notex-server .

EXPOSE 8080

CMD ["./notex-server"]
