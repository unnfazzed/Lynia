# The server's own scheduler (replaces the Azure Container Apps cron jobs) and nightly backups.
FROM alpine:3.21
RUN apk add --no-cache curl postgresql16-client openssl rclone tzdata
COPY crontab /etc/crontabs/root
COPY scheduler.sh backup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/scheduler.sh /usr/local/bin/backup.sh
# busybox crond does not hand the container's environment to its jobs, so it is saved (quoted, owner-only)
# at start and each script loads it. Then crond runs in the foreground, logging to stdout.
CMD ["/bin/sh", "-c", "umask 077 && export -p > /etc/cron.env && exec crond -f -l 2"]
