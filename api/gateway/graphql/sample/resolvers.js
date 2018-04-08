const withFilter = require('graphql-subscriptions').withFilter;
const PubSub = require('graphql-subscriptions').PubSub;
const pubsub = new PubSub();

module.exports = {
  Query: {
    author(_, { firstName, lastName }) {
      return { id: '1233', firstName, lastName };
    },
  },
  Mutation: {
    createAuthor: (root, args, context) => {
      const authorAdded = { id: Math.random(), firstName: args.firstName, lastName: args.lastName };
      pubsub.publish('authorAdded', {authorAdded});
      return authorAdded;
    },
  },
  Subscription: {
    authorAddedFiltered: {
      subscribe: withFilter(() => pubsub.asyncIterator('authorAdded'), (payload, variables) => {
        return payload.authorAdded.lastName === variables.lastName;
      }),
    },
    authorAdded: {
      subscribe: () => pubsub.asyncIterator('authorAdded')
    }
  },
}

