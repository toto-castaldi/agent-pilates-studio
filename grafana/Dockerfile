# Grafana for the usage metrics (US-020): fixed release, versioned provisioning
# and no volume, so changes made in the interface do not survive recreation.
FROM grafana/grafana:13.3.1@sha256:0615ec4fbd4072004b7d86b46ded63013a74b7d6eb1119273dd89e8fa25c13cf
USER root
RUN rm -rf /etc/grafana/provisioning /etc/grafana/ldap.toml
COPY grafana/grafana.ini /etc/grafana/grafana.ini
COPY grafana/provisioning/ /etc/grafana/provisioning/
COPY grafana/dashboards/ /etc/grafana/dashboards/
COPY grafana/entrypoint.sh /opt/pilates/grafana-entrypoint.sh
# Root-owned and not writable by the grafana user.
RUN chown -R root:root /etc/grafana /opt/pilates \
  && chmod -R u=rwX,go=rX /etc/grafana /opt/pilates
ENTRYPOINT ["/bin/sh", "/opt/pilates/grafana-entrypoint.sh"]
