var mongoose = require('mongoose');
var router = require('express').Router();
var jwt = require('jsonwebtoken');
var _ = require('lodash');
var passport = require('passport');
var User = mongoose.model('User');
var auth = require('../auth');
var cors = require('cors');
const uuidv1 = require('uuid/v1');
var nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');
const Chatkit = require('@pusher/chatkit-server')
const chatkit = new Chatkit.default({
  instanceLocator: process.env.CHATKIT_INSTANCE_LOCATOR,
  key: process.env.CHATKIT_KEY,
})
var whitelist = ["http://localhost:8080"];
var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
};

const EMAIL_SECRET = 'asdf1093KMnzxcvnkljvasdu09123nlasdasdf';

const options = {
  auth: {
    api_key: '9e59a73f4f2ad8ddfdaf69c862db7086-87cdd773-7bd017ea',
    domain: 'mg.lemo.io'
  },
  host: 'api.mailgun.net'
}

const transporter = nodemailer.createTransport(mg(options));

router.get('/confirmation/:token', async (req, res) => {
  try {
    var decoded = jwt.verify(req.params.token, EMAIL_SECRET);
    console.log('>>>>>>' + decoded.user);
    await User.findOneAndUpdate({userId: decoded.user }, { confirmed: true });
  } catch (error) {
    console.log('@@@@@' + id);
    res.send('error');
  }

   return res.redirect('http://localhost:8080/');
});


router.get('/user', auth.required, function(req, res, next){
  User.findById(req.payload.id).then(function(user){
    if(!user){ return res.sendStatus(401); }

    return res.json({user: user.toAuthJSON()});
  }).catch(next);
});

router.put('/user', auth.required, function(req, res, next){
  User.findById(req.payload.id).then(function(user){
    if(!user){ return res.sendStatus(401); }

    // only update fields that were actually passed...
    if(typeof req.body.user.username !== 'undefined'){
      user.username = req.body.user.username;
    }
    if(typeof req.body.user.email !== 'undefined'){
      user.email = req.body.user.email;
    }
    if(typeof req.body.user.bio !== 'undefined'){
      user.bio = req.body.user.bio;
    }
    if(typeof req.body.user.image !== 'undefined'){
      user.image = req.body.user.image;
    }
    if(typeof req.body.user.password !== 'undefined'){
      user.setPassword(req.body.user.password);
    }

    return user.save().then(function(){
      return res.json({user: user.toAuthJSON()});
    });
  }).catch(next);
});

router.post('/users/login', function(req, res, next){
  if(!req.body.user.email){
    return res.status(422).json({errors: {email: "can't be blank"}});
  }

  if(!req.body.user.password){
    return res.status(422).json({errors: {password: "can't be blank"}});
  }

  passport.authenticate('local', {session: false}, function(err, user, info){
    if(err){ return next(err); }

    if(user){
      user.token = user.generateJWT();
      return res.json({user: user.toAuthJSON()});
    } else {
      return res.status(422).json(info);
    }
  })(req, res, next);
});

router.post('/users', cors(corsOptions), async (req, res, next) => {
  var user = new User();

  user.userId = uuidv1();
  user.teamName = req.body.user.teamName;
  user.username = req.body.user.username;
  user.email = req.body.user.email;
  user.setPassword(req.body.user.password);

  // Save local user details into DB
  await user.save().then(function(){
    // Create New Chatkit User
    chatkit.createUser({
      id: user.userId,
      name: user.username
    }).then(() => {
      console.log('User created successfully');
      // Create New Team Chat Room
      chatkit.createRoom({
        creatorId: user.userId,
        name: user.teamName,
        isPrivate: true
      }).then(() => {
        console.log('Room created successfully');
        jwt.sign(
          {
            user: user.userId,
          },
          EMAIL_SECRET,
          {
            expiresIn: '1d',
          },
          (err, emailToken) => {
            const url = `http://localhost:3000/api/confirmation/${emailToken}`;
  
             transporter.sendMail({
              from: 'info@lemo.io',
              to: user.email,
              subject: 'Confirm Email',
              html: `Please click this email to confirm your email: <a href="${url}">${url}</a>`,
            });
          },
        );
      }).catch((err) => {
        console.log(err);
      });
    }).catch((err) => {
      console.log(err);
    })
    return res.json({user: {username: ""}});
    // return res.redirect(302, 'http://localhost:8080/login');
  }).catch(next);
  
});


  

module.exports = router;