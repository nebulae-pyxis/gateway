module.exports = {
  Query: {
    author(_, { firstName, lastName }) {
      return { id: 1, firstName, lastName };
    },
  },
  Mutation: {
    createAuthor: (root, args) => { return { id: 3, firstName: args.firstName, lastName: args.lastName }; },
  },
}

