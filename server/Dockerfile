# Multi-stage Dockerfile para Servidor MMORPG Dotin (Rust)
FROM rust:1.84-bookworm AS builder

WORKDIR /usr/src/server

# Copiar manifiestos y código fuente
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

# Compilar binario optimizado para producción
RUN cargo build --release

# Imagen final ligera de Debian
FROM debian:bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libsqlite3-0 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/server/target/release/server /app/server

EXPOSE 8080
ENV PORT=8080
ENV RUST_LOG=info

CMD ["/app/server"]
