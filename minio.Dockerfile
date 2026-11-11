ARG GO_BUILDER_IMAGE=golang:1.27.3-bookworm
ARG MINIO_RUNTIME_IMAGE=debian:13.7-slim

FROM ${GO_BUILDER_IMAGE} AS build

ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z
ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
ARG TARGETOS
ARG TARGETARCH

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /source
RUN git clone --depth 1 --branch "${MINIO_VERSION}" https://github.com/minio/minio.git .
RUN test "$(git rev-parse HEAD)" = "${MINIO_COMMIT}"

RUN mkdir -p /out \
    && RELEASE_DATE="${MINIO_VERSION#RELEASE.}" \
    && LDFLAGS="$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go "${RELEASE_DATE}")" \
    && CGO_ENABLED=0 GOOS="${TARGETOS}" GOARCH="${TARGETARCH}" \
       go build -tags kqueue -trimpath --ldflags "${LDFLAGS}" -o /out/minio .

FROM ${MINIO_RUNTIME_IMAGE} AS runtime

ARG MINIO_VERSION=RELEASE.2025-10-15T17-29-55Z
LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
      org.opencontainers.image.version="${MINIO_VERSION}" \
      org.opencontainers.image.description="MinIO Community binary built from its pinned source release"

ENV HOME=/home/minio

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y ca-certificates \
    && groupadd --gid 10001 minio \
    && useradd --uid 10001 --gid 10001 --create-home --home-dir /home/minio --shell /usr/sbin/nologin minio \
    && mkdir -p /home/minio /data \
    && chown -R 10001:10001 /home/minio /data \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=10001:10001 /out/minio /usr/bin/minio

USER 10001:10001
VOLUME ["/data"]
EXPOSE 9000 9001
ENTRYPOINT ["/usr/bin/minio"]
CMD ["server", "/data", "--console-address", ":9001"]
