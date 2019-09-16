// controllers
import * as posts from './controllers/posts';
import * as chats from './controllers/chats';
import * as user from './controllers/users';

// modules
import express from 'express';
import http from 'http';
import i from 'socket.io';
import bodyparser from 'body-parser';
import path from 'path';
import assert from 'assert';
import session from 'express-session';
import sharedSession from 'express-socket.io-session';
import mStore from 'connect-mongodb-session';
import cookie from 'cookie';
import mongoose from 'mongoose';

// Middleware and helper functions
import { auth } from './utils/middleware';

// server config
const app = express();
const server = new http.Server(app);
const io = i(server);
const MongoDBStore = mStore(session);
require('dotenv').config();

app.use(
  require('cors')({
    origin: ['http://localhost:8080'], // Allow CORS from this domain (the frontend)
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'UPDATE', 'OPTIONS'],
    credentials: true,
  })
);

app.use(bodyparser.json());

app.use(bodyparser.urlencoded({ extended: true }));

// Disable the 'x-powered-by' in our responses
app.disable('x-powered-by');

import config from '../configuration/environment';

const port = process.env.PORT || 3000;
const stage = process.env.NODE_ENV!.trim();
const host = config[stage as string].MONGO_URL;
// User Sockets

// MongoDB set up
mongoose
  .connect(config[stage as string].MONGO_URL, {
    useNewUrlParser: true,
  })
  .then(client => {
    app.locals.db = client.connection.db;
    console.log(
      `Connection to ${client.connection.db.databaseName} database successful!`
    );
  })
  .catch(err => {
    console.error(`Error in connecting to database: `, err);
  });

mongoose.connection.on('error', () => {
  console.log('Error occured in database connection');
});

mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

// mongoose.connection.once('open', () => {
//   console.log(`Connection to database ${keys[stage].MONGO_URL} successful!`);
// });

// MongoDB Store initiliazation
const store = new MongoDBStore(
  {
    uri: config[stage as string].MONGO_URL,
    collection: 'Sessions',
  },
  err => {
    if (err) {
      console.log('Error connecting Store to MongoDB => ', err);
    }
  }
);

const Session = session({
  secret: 'thisisasecret:)',
  cookie: { maxAge: 60000 * 60 * 24 * 14, secure: 'auto', path: '/' },
  store,
  saveUninitialized: false,
  resave: false,
});

// Catch errors
store.on('error', function(error) {
  assert.ifError(error);
  assert.ok(false);
});

// Use Sessions o
app.use(Session);

// Socket.io Instance
io.use(function(socket, next) {
  Session(socket.request, socket.request.res, next);
});

io.use(sharedSession(Session));

// For preventing clients from connecting if they don't have the cookiess
io.use(function(socket, next) {
  const cookies = cookie.parse(socket.request.headers.cookie);
  if (cookies['connect.sid']) {
    console.log(`Client connected`);
    next();
  } else {
    console.log('No cookie sent, reload the frontend');
    next(new Error('Not authorized man!'));
  }
});

// TODO: look at a better way to pass the io and store objects

export { io, store };

// TODO: I don't like this :p
import * as connections from './controllers/connections';

// Anytime there is a (re)connection save the socketID to the session
// You could actually also save the User id... then map the id to the current socket id.
// TODO: refactor after creating User model

io.on('connection', function(socket: i.Socket) {
  // let sessionID = socket.handshake.session.id;

  console.log('Connection!');

  socket.handshake.session!.socketID = socket.id;
  socket.handshake.session!.save((err: Error) => {
    if (err) {
      console.log('Error in saving session! => ', err);
    }
  });
  // Now each session has it's socketID
});

// TODO: pass a central kini to carry all
//  of these guys

// For Posts stuff
io.on('connection', posts.listener);

// For Chat stuff
io.on('connection', chats.listener);

// For Connections stuff

io.on('connection', connections.listener);

// Last last
server.listen(port, function() {
  console.log(`App listening on localhost:${port}`);
});

/* ==============ROUTES (for testing only; remove soon) =============== */

app.use('/public', express.static(path.join(__dirname, 'public')));

// o boy

// app.use(function(req, res, next) {
//   res.header('Access-Control-Allow-Credentials', 'true');
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header(
//     'Access-Control-Allow-Methods',
//     'GET,PUT,POST,DELETE,UPDATE,OPTIONS'
//   );
//   res.header(
//     'Access-Control-Allow-Headers',
//     'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept'
//   );
//   next();
// });

// app.get('/api/connect', (req, res) => {
//   if (req.session.views) {
//     req.session.views++;
//     res.setHeader('Content-Type', 'text/html');
//     res.write('<p>views: ' + req.session.views + '</p>');
//     res.write('<p>expires in: ' + req.session.cookie.maxAge / 1000 + 's</p>');
//     res.end();
//     console.log('From /api/connect: ', req.session.cookie);
//   } else {
//     req.session.views = 1;
//     res.end('welcome to the session demo. refresh!');
//     console.log('From /api/connect: ', req.session.cookie);
//   }
// });

// Endpoints :b
app.use('/api/posts', auth, posts.router);
app.use('/api/chats', auth, chats.router);
app.use('/api/user', user.router);
