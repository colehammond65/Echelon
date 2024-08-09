const express = require('express');
const session = require('express-session');
const passport = require('passport');
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

// Passport setup
app.use(passport.initialize());
app.use(passport.session());

// Render the homepage
app.get('/', (req, res) => {
    res.render('index');
});

// Import and use your routes
const authRoutes = require(path.join(__dirname, 'routes', 'auth'));
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
