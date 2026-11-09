FROM docker:29-cli@sha256:2357639ad1ea7d0194134bf3292622fd4e562483966ed674e5d7c945b5f3b28d
RUN apk add --no-cache bash coreutils openssl
ARG PILATES_RELEASE=
ENV PILATES_RELEASE=$PILATES_RELEASE
COPY compose.yaml /release/compose.yaml
COPY scripts/prod.sh scripts/backup.sh scripts/restore.sh scripts/operations-common.sh /release/scripts/
WORKDIR /release
ENTRYPOINT ["bash", "/release/scripts/prod.sh"]
