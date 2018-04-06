module.exports = {
  Query: {
    User(root, args, context) {
      return context.broker
        .forwardAndGetReply$('sample', { root, args, jwt: {} })
        .toPromise();
    },
  },
  Mutation: {
    createUser: (root, args) => { return { id: 5, firstName: args.firstName, lastName: args.lastName }; },
  },
}

