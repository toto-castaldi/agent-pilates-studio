FROM nousresearch/hermes-agent:v0.22.7@sha256:e6d81ae52ebf6a43efa529701405509f20054ba818f179ddd748bed4f8af584c
USER root
RUN mv /opt/hermes/libexec/hermes /opt/hermes/libexec/hermes-upstream
COPY --chmod=0755 hermes/gateway-launcher.sh /opt/hermes/libexec/hermes
COPY --chmod=0755 hermes/entrypoint.sh /opt/pilates/entrypoint.sh
ENTRYPOINT ["/opt/pilates/entrypoint.sh"]
CMD ["gateway", "run"]
