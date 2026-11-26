FROM nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c
USER root
RUN mv /opt/hermes/libexec/hermes /opt/hermes/libexec/hermes-upstream
COPY --chmod=0755 hermes/gateway-launcher.sh /opt/hermes/libexec/hermes
COPY --chmod=0755 hermes/entrypoint.sh /opt/pilates/entrypoint.sh
COPY --chmod=0755 hermes/broker-entrypoint.sh /opt/pilates/broker-entrypoint.sh
COPY --chmod=0644 hermes/author_broker.py hermes/identity_management.py hermes/identity-flow-runner.mjs hermes/usage-event-runner.mjs /opt/pilates/
COPY --chmod=0644 src/identity-flow.ts src/teacher-identity.ts src/usage-event.ts /opt/pilates/
COPY --chmod=0644 hermes/pilates_trusted.py hermes/pilates_skills.py /opt/hermes/
COPY --chmod=0644 scripts/compaction-policy.mjs /opt/pilates/compaction-policy.mjs
COPY --chmod=0644 hermes/compaction-settings.mjs /opt/pilates/compaction-settings.mjs
# Created first: COPY --chmod would also apply to directories it creates.
RUN mkdir -p /opt/pilates/release
COPY --chmod=0644 hermes/SOUL.md hermes/config.yaml /opt/pilates/release/
COPY hermes/plugins/pilates-postgres /opt/pilates/release/plugins/pilates-postgres
COPY hermes/skills /opt/pilates/release/skills
# Root-owned and read-only for everybody else, whatever the checkout's umask.
RUN chown -R root:root /opt/pilates/release && chmod -R u=rwX,go=rX /opt/pilates/release
# Links the release files into the volume after the Hermes setup (BUG-004).
COPY --chmod=0755 hermes/release-links.sh /etc/cont-init.d/016-pilates-release
ENTRYPOINT ["/opt/pilates/entrypoint.sh"]
CMD ["gateway", "run"]
