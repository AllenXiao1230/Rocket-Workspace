FROM minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727 AS minio-client

FROM postgres:16-alpine
RUN apk add --no-cache tar gzip tzdata
COPY --from=minio-client /usr/bin/mc /usr/local/bin/mc
COPY backup/backup.sh /usr/local/bin/backup
COPY backup/verify-backup.sh /usr/local/bin/verify-backup
COPY backup/restore-drill.sh /usr/local/bin/restore-drill
RUN chmod 755 /usr/local/bin/backup /usr/local/bin/verify-backup /usr/local/bin/restore-drill
ENTRYPOINT ["/usr/local/bin/backup"]
