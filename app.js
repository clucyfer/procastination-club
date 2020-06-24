const express = require('express')
const session = require('express-session')
const MongoStore = require('connect-mongo')(session) //setting up mongo store
const flash = require('connect-flash')
const markdown = require('marked')
const sanitizeHTML = require('sanitize-html')
const csrf = require('csurf')
const app = express()

app.use(express.urlencoded({extended:false})) //adds user submitted data to request object
app.use(express.json())

// router for api
app.use('/api', require('./router-api'))

//setting up sessions
let sessionOptions = session({
    secret: "JavaScript is soooo cool",
    store: new MongoStore({client: require('./db')}),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true
    }
})

app.use(sessionOptions)

app.use(flash())

//this creates a function which passes the session variable to all the templates
app.use(function(req, res, next){
    //make markdown available in ejs
    res.locals.filterUserHTML = function(content) {
        return sanitizeHTML(markdown(content), {allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'bold', 'i', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'], allowedAttributes: {}})
    }
    
    //make all errors and flash messages available from all templates
    res.locals.errors = req.flash("errors")
    res.locals.success = req.flash("success")

    //make current user id available on the request object
    if (req.session.user){req.visitorId = req.session.user._id} else {req.visitorId = 0}

    //make user seesion data available from within view templates
    res.locals.user = req.session.user
    next()
})

const router = require('./router') //setting up router

app.use(express.static('public')) //make the public folder accessible

//setting up template engine 
app.set('views', 'views')
app.set('view engine', 'ejs')

// setting up csrf token
app.use(csrf())

app.use(function(req, res, next) {
    res.locals.csrfToken = req.csrfToken()
    next()
})

app.use('/', router)

app.use(function(err, req, res, next) {
    if (err) {
        if (err.code == "EBADCSRFTOKEN") {
            req.flash('errors', "Cross site request forgery detected")
            req.session.save(() => res.redirect('/'))
        } else {
            res.render("404")
        }
    }
})

const server = require('http').createServer(app)
const io = require('socket.io')(server)

// express session data available to socket io
io.use(function (socket, next) {
    sessionOptions(socket.request, socket.request.res, next)
})

io.on('connection', function(socket) {
    if (socket.request.session.user) {
        let user = socket.request.session.user

        socket.emit('welcome', {username: user.username, avatar: user.avatar})

        socket.on('chatMessageFromBrowser', function (data) {
            socket.broadcast.emit('chatMessageFromServer', {message: sanitizeHTML(data.message, {allowedTags: [], allowedAttributes: {}}), username: user.username, avatar: user.avatar})
        })
    }
})

module.exports = server