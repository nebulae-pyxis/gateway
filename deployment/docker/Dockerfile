FROM node:9.11.1
USER node
COPY gateway /nebulae/pyxis/gateway
WORKDIR /nebulae/pyxis/gateway
RUN npm install --prod
CMD [ "npm","start" ]