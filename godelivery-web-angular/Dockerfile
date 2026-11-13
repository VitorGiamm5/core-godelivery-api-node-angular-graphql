FROM node:26.13.0-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.29.3-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY select-api-slot.sh /usr/local/bin/select-api-slot
COPY gateway-entrypoint.sh /usr/local/bin/gateway-entrypoint
COPY --from=build /app/dist/godelivery-web-angular/browser /usr/share/nginx/html
ENTRYPOINT ["/bin/sh", "/usr/local/bin/gateway-entrypoint"]
EXPOSE 80
