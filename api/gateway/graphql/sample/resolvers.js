const withFilter = require('graphql-subscriptions').withFilter;
const PubSub = require('graphql-subscriptions').PubSub;
const pubsub = new PubSub();
const Rx = require('rxjs');

module.exports = {
  Query: {
    author(_, { firstName, lastName }, context, info) {
      return { id: '1233', firstName, lastName };
    },
  },
  Mutation: {
    createAuthor: (root, args, context, info) => {
      const authorAdded = { id: Math.random(), firstName: args.firstName, lastName: args.lastName };
      pubsub.publish('authorAdded', { authorAdded });
      return authorAdded;
    },
  },
  Subscription: {
    authorAddedFiltered: {
      subscribe: withFilter((payload, variables, context, info) => {
        context.webSocket.onUnSubscribe = Rx.Observable.of('ACTION RX STREAM WITH FILTER');
        return pubsub.asyncIterator('authorAdded');
      },
        (payload, variables, context, info) => {
          return payload.authorAdded.lastName === variables.lastName;
        }),
    },
    authorAdded: {
      subscribe(payload, variables, context, info) {
        context.webSocket.onUnSubscribe = Rx.Observable.of('ACTION RX STREAM');
        return pubsub.asyncIterator('authorAdded');
      },
    }
  },
}

