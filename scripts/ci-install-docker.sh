#!/usr/bin/env bash
# CI only: run the Docker version used in production, because the stack mounts
# several files from one image and the version on the runner rejects that.
set -euo pipefail

readonly DOCKER_VERSION='5:29.9.2-1~ubuntu.24.04~noble'
readonly COMPOSE_VERSION='5.6.1-1~ubuntu.24.04~noble'

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo 'deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable' \
  | sudo tee /etc/apt/sources.list.d/docker-production.list >/dev/null
sudo apt-get update -qq
sudo apt-get install -y -qq --allow-downgrades \
  "docker-ce=$DOCKER_VERSION" "docker-ce-cli=$DOCKER_VERSION" "docker-compose-plugin=$COMPOSE_VERSION"
sudo systemctl restart docker
[[ $(docker version --format '{{.Server.Version}}') == 29.9.2 ]]
