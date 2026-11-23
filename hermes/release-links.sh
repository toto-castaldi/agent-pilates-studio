#!/bin/sh
# s6 cont-init hook, run as root after the Hermes setup (01-hermes-setup) has
# chowned and seeded the volume and before any service starts (BUG-004).
#
# The release files are served from the image through root-owned symbolic
# links instead of `type: image` mounts, which Docker cannot resolve again
# when it restarts an existing container after a host reboot. The volume root
# becomes root-owned and sticky: the agent (hermes) keeps creating and
# replacing its own files, but cannot remove, rename or replace the links,
# and the link targets in the image are root-owned and read-only for it.
# Every start rebuilds the links, so neither a file left in the volume nor an
# earlier release can take their place.
set -eu

home=/opt/data
release=/opt/pilates/release

# Only paths mounted explicitly by Compose (synthetic test overrides) are kept.
is_mount() {
  awk -v path="$1" '$5 == path { found = 1 } END { exit !found }' /proc/self/mountinfo
}

[ -d "$home" ] && [ ! -L "$home" ] && [ -d "$release" ] || exit 1
for name in SOUL.md config.yaml plugins skills; do
  path="$home/$name"
  is_mount "$path" && continue
  rm -rf "$path"
  ln -s "$release/$name" "$path"
done
chown root:hermes "$home"
chmod 1770 "$home"
