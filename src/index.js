const { ApolloServer, gql } = require('apollo-server');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();

const {DB_URI, DB_NAME, JWT_Secret} = process.env;

const getToken = (user) => jwt.sign({id: user._id}, JWT_Secret, {expiresIn: '14 days'})

const getUserFromToken = async (token, db) =>{
  if(!token){
    return null;
  }
  tokenData = jwt.verify(token, JWT_Secret);
  if(!tokenData?.id){
    return null;
  }

  return (await db.collection("Users").findOne({_id: ObjectId(tokenData.id)}));
}

const typeDefs = gql`
  type Query {
    myPlayLists: [PlayList]
    searchSongByName(name: String!): [Song]
  }

  type Mutation {
    signUp(input: signUpInput!): AuthUser!
    signIn(input: signInInput!): AuthUser!
    createPlayList(name: String!): PlayList!
    addSong(input: songInput!): Song!
    
  }
# createSong(input: songInput!): [Song!]!: Should add song manually to db. Not through Graphql

  input signInInput {
    email: String!
    password: String!
  }

  input signUpInput {
    email: String!
    password: String!
    name: String!
    avatar: String
  }

  input songInput {
    name: String!
    author: String!
    URI: String!
    imageURL: String
  }

  type AuthUser {
    user: User!
    token: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
  }

# Music App DB schema
# Should add type: SongCategory
  type Song {
    id: ID!
    name: String!
    author: String!
    URI: String!
    imageURL: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
  }

  type PlayList {
    id: ID!
    author: User!
    name: String!
    songArr: [Song]
    imageURL: String
    description: String
  }
  
`;

const resolvers = {
  Query: {
    searchSongByName: async (root, {name}, {db}) =>  await db.collection("Songs").find({name: name}).toArray() //Can add authorization by token
  },
  Mutation: {
    signUp: async (root, {input}, {db}) => {
      userEmail = await db.collection("Users").findOne({email: input.email});
      if (userEmail){
        throw new Error("Email already existed");
      }
      const hashedPassword = bcryptjs.hashSync(input.password);
      const user = {
        ...input,
        password: hashedPassword
      }
      const result = await db.collection("Users").insertOne(user);
      return({
        user,
        token: getToken(user)
      });

    },
    signIn: async (root, {input}, {db}) => {
      userEmail = input.email;
      user = await db.collection("Users").findOne({email: userEmail});
      //Check if email is already existed
      if (!user) {
        throw new Error("Invalid email or password!");
      }
      const checkPassword = bcryptjs.compareSync(input.password, user.password);
      if (!checkPassword) {
        throw new Error("Invalid email or password!");
      }
      return ({
        token: getToken(user),
        user,
      });
    },

    addSong: async (root, {input}, {db}) => {
      const newSong = {
        name: input.name,
        author: input.author,
        imageURL: input.imageURL,
        URI: input.URI
      }
      await db.collection("Songs").insertOne(newSong);
      // console.log(newSong);
      return({
        ...newSong
      })
    }
    
  },
  //Custom resolver here
  Song: {
    id: ({_id, id}) => {
      objId = JSON.stringify(_id);
      objId = objId.slice(1); //Remove quote at the beginning of string
      objId = objId.slice(0, 24);//Remove quote at the end of string
      return (objId || id);
    }
  }

};




//Connect to MongoDB remote database (Mongo Atlas)

start = async () => {
  try {
    const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
    await client.connect();
    const db = client.db(DB_NAME);
    // const collection = client.db(DB_NAME).collection("Collection_1");

    //To access to the data in Mongo Atlas database and send it to
    //resolver create. There are 2 ways: 1: Global variable
    //2: Send db in the context and send context to ApolloServer by doing
    // this way Appolo server will include context variable in every query
    // and mutation


    // The ApolloServer constructor requires two parameters: your schema
    // definition and your set of resolvers.
    const server = new ApolloServer({ typeDefs, resolvers, 
      context: async ({req}) => {
      const user = await getUserFromToken(req.headers.authorization, db)
      // console.log(user);
      // console.log(req.headers.authorization);
      return {
        db,
        user
      }
    }});

    // The `listen` method launches a web server.
    server.listen({ port: process.env.PORT || 5000 }).then(({ url }) => {
      console.log(`🚀  Server ready at ${url}`);
    });
    // const res = await collection.findOne({"tuoi": 22});
    // console.log(res);
    // client.close();
}
catch (err) {
    console.log(err);
}
}

start();
  
  