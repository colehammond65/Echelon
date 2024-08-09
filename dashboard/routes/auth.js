const express = require('express');
const session = require('express-session');
const passport = require('passport');
const flash = require('connect-flash');
require('dotenv').config();
const path = require('path');

const app = express();

// Middleware setup
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session setup
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

// Flash messages middleware
app.use(flash());

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Middleware to pass flash messages to templates
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});

// Routes setup
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

// Basic error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
