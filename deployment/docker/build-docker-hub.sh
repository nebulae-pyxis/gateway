#!/bin/bash
export DOCKERHUB_IMAGE=gateway
export DOCKERHUB_TAG=0.0.16

rm -rf deployment/docker/gateway/
cp -R $API_SHELL_PATH/gateway deployment/docker/gateway

docker build  -t $DOCKERHUB_NAMESPACE/$DOCKERHUB_IMAGE:$DOCKERHUB_TAG -t $DOCKERHUB_NAMESPACE/$DOCKERHUB_IMAGE:latest deployment/docker/
docker login -u $DOCKERHUB_USER -p $DOCKERHUB_PASS
docker push $DOCKERHUB_NAMESPACE/$DOCKERHUB_IMAGE:$DOCKERHUB_TAG
docker push $DOCKERHUB_NAMESPACE/$DOCKERHUB_IMAGE:latest