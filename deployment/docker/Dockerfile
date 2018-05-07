FROM node:9.11.1
USER node
COPY gateway /nebulae/tpm/gateway
WORKDIR /nebulae/tpm/gateway
RUN npm install --prod
CMD [ "npm","start" ]