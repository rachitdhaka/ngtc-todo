# ---- build ----
FROM rust:1-slim AS build
WORKDIR /app

# Build dependencies first so they are cached between source changes.
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

# ---- runtime ----
# Distroless: just glibc + the binary, runs as non-root.
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /app/target/release/worker /worker
EXPOSE 8080
ENTRYPOINT ["/worker"]
