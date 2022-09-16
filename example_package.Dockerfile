FROM debian
RUN apt update && apt install -y curl wget && wget -qO- https://raw.githubusercontent.com/Sirherobrine23/DebianNodejsFiles/main/debianInstall.sh | bash
WORKDIR /build
COPY ./package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build

FROM scratch
COPY --from=0 /build /
LABEL org.oapt.version="1.0.0"
LABEL org.oapt.depencies="ghcr.io/sirherobrine23/nodesshserver:next, ghcr.io/sirherobrine23/mydockerimage:latest, debian"