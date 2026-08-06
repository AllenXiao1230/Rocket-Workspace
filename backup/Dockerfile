FROM minio/mc:latest AS minio-client

FROM postgres:16-alpine
RUN apk add --no-cache tar gzip tzdata
COPY --from=minio-client /usr/bin/mc /usr/local/bin/mc
COPY backup/backup.sh /usr/local/bin/backup
COPY backup/verify-backup.sh /usr/local/bin/verify-backup
RUN chmod 755 /usr/local/bin/backup /usr/local/bin/verify-backup
ENTRYPOINT ["/usr/local/bin/backup"]
