FROM postgres:17.10@sha256:5f050f770b427fbd477edee6c3968a72e5c6be97e050a7e368b2b74a9494a285
# Created first: COPY --chmod would also apply to directories it creates.
RUN mkdir -p /etc/pilates /scripts
COPY --chmod=0644 db/pg_hba.conf db/entrypoint.sh /etc/pilates/
COPY --chmod=0644 db/bootstrap/bootstrap.sh db/bootstrap/roles.sql /scripts/
