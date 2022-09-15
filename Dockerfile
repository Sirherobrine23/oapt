FROM debian
RUN apt update && apt install -y curl wget && wget -qO- https://raw.githubusercontent.com/Sirherobrine23/DebianNodejsFiles/main/debianInstall.sh | bash
WORKDIR /build
COPY ./package*.json ./
RUN npm install --no-save
COPY ./ ./
RUN npm run build


FROM scratch
EXPOSE 80/tcp
COPY --from=0 / /
ENTRYPOINT [ "node", "/build/dist/index.js", "server", "-p", "80" ]