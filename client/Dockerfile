FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM httpd:2.4-alpine
# Copy built static site into Apache htdocs
COPY --from=build /app/dist /usr/local/apache2/htdocs/
# Use a custom Apache config that enables proxying for API, WebSocket and uploads
COPY httpd.conf /usr/local/apache2/conf/httpd.conf
EXPOSE 80
CMD ["httpd-foreground"]
