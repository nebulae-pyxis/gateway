FROM node:9.8.0-alpine
USER node
COPY gateway /nebulae/tpm/gateway
WORKDIR /nebulae/tpm/gateway
RUN npm install --prod
RUN npm rebuild
CMD [ "npm","start" ]