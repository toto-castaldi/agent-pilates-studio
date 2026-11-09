FROM docker:29-cli@sha256:2357639ad1ea7d0194134bf3292622fd4e562483966ed674e5d7c945b5f3b28d
COPY compose.yaml /release/compose.yaml
WORKDIR /release
