# syntax=docker/dockerfile:1

FROM rust:bookworm AS builder

WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        perl \
        pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# The server image also contains the codegpt CLI so server-side pairing and
# administration can be run with `docker compose exec codegpt codegpt ...`.
# codegpt-runner is intentionally not built into this image. Git metadata is
# supplied as build args because .git is intentionally outside the build context.
ARG CODEGPT_GIT_COMMIT
ARG CODEGPT_GIT_DIRTY
ARG CODEGPT_BUILT_AT
RUN CODEGPT_GIT_COMMIT="$CODEGPT_GIT_COMMIT" \
    CODEGPT_GIT_DIRTY="$CODEGPT_GIT_DIRTY" \
    CODEGPT_BUILT_AT="$CODEGPT_BUILT_AT" \
    cargo build --locked --release --bins -p codegpt -p codegpt-cli

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        libgcc-s1 \
        libstdc++6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 codegpt \
    && useradd --system --uid 10001 --gid codegpt \
        --home-dir /var/lib/codegpt codegpt \
    && install -d -o codegpt -g codegpt -m 0700 /var/lib/codegpt

COPY --from=builder /src/target/release/codegpt-server /usr/local/bin/codegpt-server
COPY --from=builder /src/target/release/codegpt /usr/local/bin/codegpt

ENV CODEGPT_ADDR=0.0.0.0:8080 \
    CODEGPT_DATA=/var/lib/codegpt \
    RUST_LOG=info

USER codegpt:codegpt
WORKDIR /var/lib/codegpt

EXPOSE 8080
VOLUME ["/var/lib/codegpt"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8080/openapi.json >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/codegpt-server"]
