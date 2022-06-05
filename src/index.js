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
    searchSongByTitle(title: String!): [Song]
  }

  type Mutation {
    signUp(input: signUpInput!): AuthUser!
    signIn(input: signInInput!): AuthUser!
    createPlayList(input: createPlayListInput!): PlayList!
    addSongToPlayList(songId: String!, playListId: String!): PlayList! #addSongToPlayList ~ update play list
    addSong(input: addSongInput!): Song!
    
  }

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

  input addSongInput {
    name: String!
    author: String!
    URI: String!
    title: String!
    imageURL: String
  }

  input createPlayListInput {
    name: String!
    imageURL: String
    description: String
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
    title: String!
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
    searchSongByName: async (root, {name}, {db}) =>  await db.collection("Songs").find({name: name}).toArray(), //Can add authorization by token
    myPlayLists: async (root, data, {db, user}) => {
      if(!user) throw new Error("Please sign in to see your play list!")
      const playListArr = await db.collection("PlayLists").find({"author._id": user._id}).toArray();
      return playListArr;
    },
    searchSongByTitle: async (root, {title}, {db, user}) => await db.collection("Songs").find({title: title}).toArray()
    
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
        URI: input.URI,
        title: input.title
      }
      await db.collection("Songs").insertOne(newSong);
      // console.log(newSong);
      return({
        ...newSong
      })
    },
    
    createPlayList: async (root, {input}, {db, user}) => {
      if (!user) throw new Error("Please sign in to create your play list!")

      //Add current user as author of play list
      const author = await db.collection("Users").findOne({_id: user._id})
      const newPlayList = {...input, author};
      await db.collection("PlayLists").insertOne(newPlayList);
      // console.log(author);
      return({...newPlayList})
    },

    addSongToPlayList: async (root, {songId, playListId}, {db, user}) => {
      if (!user) throw new Error("Please sign in to add song to your play list!")
      playListToUpdate = await db.collection("PlayLists").findOne({_id: ObjectId(playListId)})
      
      //save last song array
      lastSongArr = playListToUpdate.songArr;
      if(typeof(lastSongArr) == 'undefined')
      {
        songToAdd = await db.collection("Songs").findOne({_id: ObjectId(songId)})
        await db.collection("PlayLists").updateOne({_id: ObjectId(playListId)}, {$set: {songArr: [{...songToAdd}]}})
        updatedPlayList = await db.collection("PlayLists").findOne({_id: ObjectId(playListId)})
        return({...updatedPlayList})
      }
      //check if song is already add to play list
      let checkExists = 0
      playListToUpdate.songArr.forEach(item => {
        if(JSON.stringify(item._id) === JSON.stringify(ObjectId(songId))){
          checkExists = 1
          return
        }
      })

      if (checkExists === 1) {
        return({...playListToUpdate})
      } 
      //find song with songId 
      songToAdd = await db.collection("Songs").findOne({_id: ObjectId(songId)})
      newSongArr = [...lastSongArr, {...songToAdd}];
      await db.collection("PlayLists").updateOne({_id: ObjectId(playListId)}, {$set: {songArr: [...newSongArr]}})
      updatedPlayList_2 = await db.collection("PlayLists").findOne({_id: ObjectId(playListId)})
      return({...updatedPlayList_2})
    }
  },
  //Custom resolver here
  User: {
    id: ({_id, id}) => {
      objId = JSON.stringify(_id);
      objId = objId.slice(1); //Remove quote at the beginning of string
      objId = objId.slice(0, 24);//Remove quote at the end of string
      return (objId || id);
    }
  },

  Song: {
    id: ({_id, id}) => {
      objId = JSON.stringify(_id);
      objId = objId.slice(1); //Remove quote at the beginning of string
      objId = objId.slice(0, 24);//Remove quote at the end of string
      return (objId || id);
    }
  },

  PlayList: {
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
  
  