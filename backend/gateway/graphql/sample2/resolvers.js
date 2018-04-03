module.exports = {
  Query: {
    User(_, { firstName, lastName }) {
      return { id: 2, firstName, lastName };
    },
  },
  Mutation: {
    createUser: (root, args) => { return { id: 5, firstName: args.firstName, lastName: args.lastName }; },
  },
}

