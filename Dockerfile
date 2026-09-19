FROM node:22.22.3-bookworm-slim
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/studio.sqlite
WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node assets/fonts ./assets/fonts
COPY --chown=node:node assets/images ./assets/images
COPY --chown=node:node scripts/staff.cjs scripts/disable-staff.cjs scripts/backup.cjs scripts/restore.cjs ./scripts/
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.cjs"]
